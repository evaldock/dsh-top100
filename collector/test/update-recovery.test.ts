import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGithubPreflight } from '../src/github-preflight.js';
import { GithubAccessError } from '../src/github-auth.js';
import { advanceOperation, loadOperation } from '../src/operation-state.js';
import { operationCommand, weeklyDiscoveryDue } from '../src/operation-command.js';
import { OperationError } from '../src/operation-errors.js';
const dirs: string[] = [];
const now = Date.parse('2026-09-20T00:00:00Z');
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'update-recovery-')); dirs.push(dir); return dir; }
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
describe('authentication gate', () => {
  it('pauses without spending stage attempts, throttles probes and resumes on a successful probe', async () => {
    const dir = fixture(), state = loadOperation(dir, '2026-09-20', now);
    const probe = vi.fn(async () => { throw new GithubAccessError('github-auth-invalid'); });
    const execute = vi.fn(async () => {});
    await advanceOperation(state, { now: () => now, timeZone: 'Asia/Shanghai', persist: () => {}, execute,
      beforeStage: () => checkGithubPreflight(dir, { now, probe }) });
    expect(state.stages.collect.attempts).toBe(0); expect(execute).not.toHaveBeenCalled();
    expect(await checkGithubPreflight(dir, { now: now + 60_000, probe })).toBe(false);
    expect(probe).toHaveBeenCalledOnce();
    expect(await checkGithubPreflight(dir, { now: now + 15 * 60_000, probe: async () => {} })).toBe(true);
    await advanceOperation(state, { now: () => now + 15 * 60_000, timeZone: 'Asia/Shanghai', persist: () => {}, execute });
    expect(state.stages.verify.status).toBe('complete'); expect(execute).toHaveBeenCalledTimes(3);
    expect(JSON.parse(readFileSync(join(dir, 'github-preflight.json'), 'utf8')).status).toBe('ready');
  });
  it('stores only safe failure codes and distinguishes a timed-out child', async () => {
    const dir = fixture();
    await checkGithubPreflight(dir, { now, probe: async () => { throw new Error('secret provider message'); } });
    expect(readFileSync(join(dir, 'github-preflight.json'), 'utf8')).not.toContain('secret');
    const state = loadOperation(dir, '2026-09-20', now);
    await advanceOperation(state, { now: () => now, timeZone: 'Asia/Shanghai', persist: () => {},
      execute: async () => { throw new OperationError('collect-timeout'); } });
    expect(state.stages.collect.error).toBe('collect-timeout');
    expect(state.stages.publish.status).toBe('pending');
  });
});
describe('daily publication and weekly discovery separation', () => {
  it('keeps Sunday collection incremental and never starts the model pipeline in discovery', () => {
    expect(operationCommand('collect', '2026-09-20').env.DSH_DISCOVERY_MODE).toBe('incremental');
    const weekly = operationCommand('discovery', '2026-09-20');
    expect(weekly.executable).toBe('node'); expect(weekly.args.at(-1)).toContain('weekly-discovery-entry');
    expect(weekly.env.DSH_MODEL_REQUESTS_ENABLED).toBe('0');
    expect(weekly.timeoutMs).toBeLessThan(operationCommand('collect', '2026-09-20').timeoutMs);
  });
  it('requires verified publication and bounds dispatch to one slice a day, including after restart', () => {
    const base = { date: '2026-09-20', fullWeekday: 0, dailyVerified: true };
    expect(weeklyDiscoveryDue(base)).toBe(true);
    expect(weeklyDiscoveryDue({ ...base, dailyVerified: false })).toBe(false);
    expect(weeklyDiscoveryDue({ ...base, lastSliceDate: base.date })).toBe(false);
    expect(weeklyDiscoveryDue({ ...base, date: '2026-09-21', lastSliceDate: base.date,
      sweep: { status: 'partial', startedAt: '2026-09-20T00:00:00Z' } })).toBe(true);
  });
  it('catches up a missed week but does not repeat a sweep completed this week', () => {
    const base = { date: '2026-09-21', fullWeekday: 0, dailyVerified: true };
    expect(weeklyDiscoveryDue({ ...base, sweep: { status: 'complete', startedAt: '2026-09-13T00:00:00Z', completedAt: '2026-09-15T00:00:00Z' } })).toBe(true);
    expect(weeklyDiscoveryDue({ ...base, sweep: { status: 'complete', startedAt: '2026-09-13T00:00:00Z', completedAt: '2026-09-20T00:00:00Z' } })).toBe(false);
  });
});
