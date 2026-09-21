/** Entrypoint launched only under scripts/operation-lock.sh. */
import './env.js';
import { spawn } from 'node:child_process';
import { fstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceOperation, atomicOperationJson, dailyOperationDue, loadOperation, localDay, operationPath, readOperationJson } from './operation-state.js';
import { auditPublication } from './operation-audit.js';
import { assessDiskSpace } from './disk-space.js';
import { observeDisk } from './disk-observation.js';
import { checkGithubPreflight, recordGithubAuthFailure } from './github-preflight.js';
import { OperationError } from './operation-errors.js';
import { operationCommand, weeklyDiscoveryDue, type CommandStage } from './operation-command.js';
import { readWeeklyDiscoveryStatus } from './weekly-discovery.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = dirname(resolve(root, process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'));
const operations = join(runtime, 'operations');
const publicDirectory = resolve(root, process.env.PUBLIC_DATA_DIR ?? 'runtime/public-data');
const dataDirectory = resolve(root, 'data');
const timeZone = process.env.TZ ?? 'Asia/Shanghai';
const hour = Number(process.env.COLLECT_HOUR ?? '6');
const fullWeekday = Number(process.env.FULL_DISCOVERY_WEEKDAY ?? '0');
if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(fullWeekday) || fullWeekday < 0 || fullWeekday > 6) throw new Error('invalid-schedule');
if (process.env.DSH_OPERATION_LOCK_FD !== '9') throw new Error('scheduler-requires-os-lock');
fstatSync(9);
let running = false, stopping = false;
let child: ReturnType<typeof spawn> | undefined;
function stopGroup(signal: NodeJS.Signals) {
  if (child?.pid) try { process.kill(-child.pid, signal); } catch { /* already stopped */ }
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopping = true; stopGroup('SIGTERM');
  setTimeout(() => { stopGroup('SIGKILL'); process.exit(1); }, 10_000).unref();
  if (!running) process.exit(0);
});
function command(stage: CommandStage, date: string): Promise<void> {
  const plan = operationCommand(stage, date);
  return new Promise((ok, fail) => {
    const disk = observeDisk(runtime), runId = Date.now();
    const finishDisk = () => {
      const report = disk.finish();
      try { atomicOperationJson(join(operations, 'disk-usage', `${date}-${stage}-${runId}.json`), { ...report, stage, date }); }
      catch { console.error('[scheduler] disk-observation-write-failed'); }
    };
    const processChild = spawn(plan.executable, plan.args, {
      cwd: root, detached: true,
      // Retain the shared flock in the phase tree even if the scheduler is killed.
      stdio: ['ignore', 'inherit', 'inherit', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9],
      env: { ...process.env, ...plan.env },
    });
    child = processChild;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true; stopGroup('SIGTERM');
      killTimer = setTimeout(() => { if (processChild.pid) try { process.kill(-processChild.pid, 'SIGKILL'); } catch { /* exited */ } }, 10_000);
      killTimer.unref();
    }, plan.timeoutMs);
    processChild.once('error', () => { clearTimeout(timeout); finishDisk(); child = undefined; fail(new Error('phase-start-failed')); });
    processChild.once('exit', code => {
      // npm can exit before its descendants; retain timeout escalation for the process group.
      clearTimeout(timeout); finishDisk(); child = undefined;
      if (code === 78) { recordGithubAuthFailure(operations); fail(new OperationError('github-auth-required')); }
      else if (timedOut) fail(new OperationError(`${stage}-timeout`));
      else code === 0 ? ok() : fail(new Error('phase-failed'));
    });
  });
}
async function tick() {
  if (running || stopping) return;
  const now = Date.now(), today = localDay(now, timeZone);
  if (!dailyOperationDue(now, hour, timeZone, process.env.DSH_AUTOMATION_START_DATE)) return;
  running = true;
  try {
    const state = loadOperation(operations, today.date, now);
    const diskReady = (stage: CommandStage): boolean => {
      try {
        const report = assessDiskSpace({ databasePath: resolve(root, process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'),
          sourcePath: resolve(root, process.env.SOURCE_DATA_PATH ?? 'data/plugins.json'), publicDirectory });
        atomicOperationJson(join(operations, 'disk-preflight.json'), { ...report, stage, date: today.date });
        return report.status === 'ready';
      } catch {
        atomicOperationJson(join(operations, 'disk-preflight.json'), { schemaVersion: 1, checkedAt: new Date().toISOString(),
          status: 'unknown', code: 'disk-check-failed', stage, date: today.date });
        return false;
      }
    };
    await advanceOperation(state, { now: Date.now, timeZone,
      persist: state => atomicOperationJson(operationPath(operations, state.date), state),
      beforeStage: async stage => {
        if (stage === 'verify') return true;
        return diskReady(stage) && (stage !== 'collect' || await checkGithubPreflight(operations));
      },
      execute: async stage => {
        if (stopping) throw new Error('scheduler-stopping');
        if (stage !== 'verify') {
          await command(stage, today.date);
          return;
        }
        // Missing public configuration is visible, never reported as a successful public check.
        if (!process.env.DSH_PUBLIC_ORIGIN) throw new Error('public-origin-unconfigured');
        const audit = await auditPublication({ publicDirectory, expectedDate: today.date, publicOrigin: process.env.DSH_PUBLIC_ORIGIN });
        atomicOperationJson(join(operations, 'publication-audit.json'), audit);
        return { snapshotId: audit.snapshotId };
      },
    });
    // Discovery owns no daily stage, so its interruption cannot undo a published day.
    const slicePath = join(operations, 'weekly-discovery-slice.json');
    const previousSlice = readOperationJson<{ date: string }>(slicePath);
    const sweep = await readWeeklyDiscoveryStatus(dataDirectory);
    if (!stopping && localDay(Date.now(), timeZone).date === today.date
      && weeklyDiscoveryDue({ date: today.date, fullWeekday, dailyVerified: state.stages.verify.status === 'complete',
        lastSliceDate: previousSlice?.date, sweep: sweep ?? undefined, timeZone })
      && diskReady('discovery') && await checkGithubPreflight(operations)) {
      const startedAt = new Date().toISOString();
      // Persist before dispatch: a crash/restart must not launch repeated slices today.
      atomicOperationJson(slicePath, { date: today.date, startedAt, status: 'running' });
      try {
        await command('discovery', today.date);
        atomicOperationJson(slicePath, { date: today.date, startedAt, finishedAt: new Date().toISOString(), status: 'finished' });
      } catch (error) {
        atomicOperationJson(slicePath, { date: today.date, startedAt, finishedAt: new Date().toISOString(), status: 'interrupted',
          code: error instanceof OperationError ? error.code : 'discovery-failed' });
      }
    }
  } catch { atomicOperationJson(join(operations, 'scheduler-error.json'), { code: 'scheduler-state-failed', at: new Date().toISOString() }); }
  finally { running = false; if (stopping) process.exit(0); }
}
const heartbeat = () => atomicOperationJson(join(operations, 'scheduler-heartbeat.json'), { at: new Date().toISOString() });
heartbeat(); setInterval(heartbeat, 30_000);
// Deployment/startup never dispatches paid work. The first scheduled tick is one minute later.
setInterval(() => void tick(), 60_000);
console.log('[scheduler] persistent daily recovery enabled; first check in 60 seconds');
