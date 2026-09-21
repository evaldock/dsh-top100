/** Independent read-only watchdog; only its own reports/outbox are writable. No model requests. */
import { fstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPublication, readBudgetHealth, type OperationIssue } from './operation-audit.js';
import { atomicOperationJson, hasExhaustedStage, loadOperation, localDay, readOperationJson, type DailyOperation } from './operation-state.js';
import { reconcileIncidents, type IncidentState } from './operation-incidents.js';
import { modelPolicyHealth } from './model-requests.js';
import { loadSourceRecovery } from './source-recovery.js';
import { assessDiskSpace } from './disk-space.js';
import type { GithubPreflight } from './github-preflight.js';
import { readWeeklyDiscoveryStatus } from './weekly-discovery.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = dirname(resolve(root, process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'));
const directory = join(runtime, 'operations');
const timeZone = process.env.TZ ?? 'Asia/Shanghai';
const hour = Number(process.env.COLLECT_HOUR ?? '6');
const startedAt = Date.now();
if (process.env.DSH_OPERATION_LOCK_FD !== '9') throw new Error('watchdog-requires-os-lock');
fstatSync(9);
let running = false;
async function tick() {
  if (running) return; running = true;
  const now = Date.now(), today = localDay(now, timeZone), at = new Date(now).toISOString();
  try {
    const issues: OperationIssue[] = [];
    const github = readOperationJson<GithubPreflight>(join(directory, 'github-preflight.json'));
    if (github?.status === 'blocked') issues.push({ key: 'github-access', severity: 'critical', code: github.code ?? 'github-preflight-unavailable' });
    let weekly;
    try {
      const checkpoint = await readWeeklyDiscoveryStatus(resolve(root, 'data'));
      const slice = readOperationJson<{ date: string; status: string }>(join(directory, 'weekly-discovery-slice.json'));
      weekly = { sweep: checkpoint ? { startedAt: checkpoint.startedAt, completedAt: checkpoint.completedAt,
        status: checkpoint.status, audit: checkpoint.audit } : null, slice };
      if (slice?.status === 'interrupted') issues.push({ key: 'weekly-discovery', severity: 'warning', code: 'weekly-discovery-interrupted' });
    } catch { issues.push({ key: 'weekly-discovery', severity: 'warning', code: 'weekly-discovery-state-unreadable' }); }
    let disk;
    try {
      disk = assessDiskSpace({ databasePath: resolve(root, process.env.DATABASE_PATH ?? 'runtime/dsh-top100.sqlite'),
        sourcePath: resolve(root, process.env.SOURCE_DATA_PATH ?? 'data/plugins.json'),
        publicDirectory: resolve(root, process.env.PUBLIC_DATA_DIR ?? 'runtime/public-data'), now });
      if (disk.status !== 'ready') issues.push({ key: 'disk-capacity', severity: 'critical', code: 'disk-space-insufficient' });
    } catch {
      issues.push({ key: 'disk-capacity', severity: 'critical', code: 'disk-check-failed' });
    }
    let operation: DailyOperation | undefined;
    try { operation = loadOperation(directory, today.date, now); }
    catch { issues.push({ key: 'operation-state', severity: 'critical', code: 'operation-state-invalid' }); }
    const heartbeat = readOperationJson<{ at: string }>(join(directory, 'scheduler-heartbeat.json'));
    if (now - startedAt >= 3 * 60_000 && (!heartbeat || !Number.isFinite(Date.parse(heartbeat.at)) || now - Date.parse(heartbeat.at) > 3 * 60_000)) issues.push({ key: 'scheduler-heartbeat', severity: 'critical', code: 'scheduler-unavailable' });
    const dueDate = localDay(now - (hour + 2) * 3_600_000, timeZone).date;
    if (!process.env.DSH_AUTOMATION_START_DATE || dueDate >= process.env.DSH_AUTOMATION_START_DATE) {
      const due = dueDate === today.date ? operation : loadOperation(directory, dueDate, now);
      if (due?.stages.verify.status !== 'complete') issues.push({ key: 'daily-update', severity: 'critical', code: 'daily-update-overdue' });
    }
    if (operation && hasExhaustedStage(operation)) issues.push({ key: 'daily-stage', severity: 'critical', code: 'daily-stage-retries-exhausted' });
    const previous = readOperationJson<IncidentState>(join(directory, 'incidents.json'));
    const unobservedKeys = new Set<string>();
    const preserve = (incident: NonNullable<IncidentState['incidents'][string]>) => {
      issues.push(incident); unobservedKeys.add(incident.key);
    };
    let audit;
    try {
      const manifest = readOperationJson<{ snapshotDate: string }>(join(resolve(root, process.env.PUBLIC_DATA_DIR ?? 'runtime/public-data'), 'manifest.json'));
      if (!manifest) throw new Error('missing-publication');
      // Before the day's publication, inspect yesterday's assets without claiming today's collection completed.
      audit = await auditPublication({ publicDirectory: resolve(root, process.env.PUBLIC_DATA_DIR ?? 'runtime/public-data'),
        expectedDate: manifest.snapshotDate, publicOrigin: process.env.DSH_PUBLIC_ORIGIN, now });
      if (!audit.publicVerified) issues.push({ key: 'public-check', severity: 'warning', code: 'public-origin-unconfigured' });
      issues.push(...audit.issues);
    } catch {
      const publishing = operation && operation.stages.publish.status !== 'pending' && operation.stages.verify.status !== 'complete'
        && now - Date.parse(operation.stages.publish.startedAt ?? '') < 15 * 60_000;
      issues.push({ key: 'public-check', severity: publishing ? 'info' : 'critical', code: 'publication-check-failed' });
      // An unavailable observation must not falsely resolve existing content incidents.
      for (const incident of Object.values(previous?.incidents ?? {})) if (!incident.resolvedAt && /^(description:|coverage:)/.test(incident.key)) preserve(incident);
    }
    let budget;
    try {
      const recovery = loadSourceRecovery(join(dirname(resolve(root, process.env.SOURCE_DATA_PATH ?? 'data/plugins.json')), 'source-recovery.json'));
      for (const entry of Object.values(recovery.entries)) {
        const key = `description:${entry.fullName.toLowerCase()}`;
        if (!issues.some(issue => issue.key === key)) issues.push({ key, severity: 'info', affectsBoard: false,
          code: `source-${entry.status}`, subject: entry.fullName,
          observationId: localDay(Date.parse(entry.checkedAt), timeZone).date });
      }
    } catch {
      issues.push({ key: 'source-recovery', severity: 'critical', code: 'source-recovery-unreadable' });
      for (const incident of Object.values(previous?.incidents ?? {})) if (!incident.resolvedAt
        && incident.key.startsWith('description:') && !issues.some(issue => issue.key === incident.key)) preserve(incident);
    }
    if (process.env.DSH_MODEL_REQUESTS_ENABLED === '1') {
      try { budget = readBudgetHealth(join(runtime, 'model-budget.sqlite'), now, modelPolicyHealth()); issues.push(...budget.issues); }
      catch {
        issues.push({ key: 'budget-health', severity: 'critical', code: 'budget-health-unavailable' });
        for (const incident of Object.values(previous?.incidents ?? {})) if (!incident.resolvedAt && /^(budget-|model-price)/.test(incident.key)) preserve(incident);
      }
    }
    const collection = readOperationJson<{ generatedAt: string; metadataRefresh?: { attempted: number; failed: number } }>(join(dirname(resolve(root, process.env.SOURCE_DATA_PATH ?? 'data/plugins.json')), 'report.json'));
    if (collection?.metadataRefresh && localDay(Date.parse(collection.generatedAt), timeZone).date === today.date
      && collection.metadataRefresh.failed / Math.max(1, collection.metadataRefresh.attempted) > 0.05) issues.push({ key: 'metadata-refresh', severity: 'warning', code: 'metadata-refresh-degraded' });
    const result = reconcileIncidents(previous, issues, now, { unobservedKeys });
    // Deterministic event IDs make a future GEO consumer idempotent. Persist events before incident acknowledgement.
    for (const event of result.events) {
      const path = join(directory, 'events', `${event.id}.json`);
      if (!readOperationJson(path)) atomicOperationJson(path, event);
    }
    atomicOperationJson(join(directory, 'incidents.json'), result.state);
    const activeIssues = Object.values(result.state.incidents).filter(incident => !incident.resolvedAt);
    atomicOperationJson(join(directory, 'status.json'), { schemaVersion: 1, checkedAt: at,
      status: activeIssues.some(issue => issue.severity === 'critical') ? 'action-required' : activeIssues.some(issue => issue.severity === 'warning') ? 'degraded' : 'healthy',
      notification: { destination: 'geo', connected: false }, operation, publication: audit, budget, disk, github, weekly, issues: activeIssues });
    atomicOperationJson(join(directory, 'watchdog-heartbeat.json'), { at });
  } catch { console.error('[watchdog] observation-failed'); }
  finally { running = false; }
}
await tick(); setInterval(() => void tick(), 5 * 60_000);
