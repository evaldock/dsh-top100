import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), audit: vi.fn(), preflight: vi.fn(), sweep: vi.fn() }));
vi.mock('../src/env.js', () => ({}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs', async importOriginal => ({ ...await importOriginal<typeof import('node:fs')>(), fstatSync: vi.fn() }));
vi.mock('../src/operation-audit.js', () => ({ auditPublication: mocks.audit }));
vi.mock('../src/github-preflight.js', () => ({ checkGithubPreflight: mocks.preflight, recordGithubAuthFailure: vi.fn() }));
vi.mock('../src/weekly-discovery.js', () => ({ readWeeklyDiscoveryStatus: mocks.sweep }));
vi.mock('../src/disk-space.js', () => ({ assessDiskSpace: () => ({ status: 'ready' }) }));
vi.mock('../src/disk-observation.js', () => ({ observeDisk: () => ({ finish: () => ({}) }) }));
let dir: string;
let listeners: Record<'SIGINT' | 'SIGTERM', Set<Function>>;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-20T00:00:00Z'));
  dir = mkdtempSync(join(tmpdir(), 'managed-recovery-'));
  vi.stubEnv('DATABASE_PATH', join(dir, 'catalog.sqlite'));
  vi.stubEnv('DSH_OPERATION_LOCK_FD', '9'); vi.stubEnv('DSH_PUBLIC_ORIGIN', 'https://fixture.invalid');
  vi.stubEnv('TZ', 'Asia/Shanghai'); vi.stubEnv('COLLECT_HOUR', '6'); vi.stubEnv('FULL_DISCOVERY_WEEKDAY', '0');
  vi.stubEnv('DSH_AUTOMATION_START_DATE', '2026-09-20');
  listeners = { SIGINT: new Set(process.listeners('SIGINT')), SIGTERM: new Set(process.listeners('SIGTERM')) };
  mocks.preflight.mockResolvedValue(true); mocks.audit.mockResolvedValue({ snapshotId: 'today-verified' });
  mocks.sweep.mockResolvedValue(null);
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    for (const listener of process.listeners(signal)) if (!listeners[signal].has(listener)) process.removeListener(signal, listener);
  }
  rmSync(dir, { recursive: true, force: true });
});
function children(exitCodes: number[]) {
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    // The real command remains asynchronous, but these tests cannot run external commands.
    Promise.resolve().then(() => child.emit('exit', exitCodes.shift() ?? 0));
    return child;
  });
}
describe('managed scheduler dispatch integration', () => {
  it('publishes Sunday daily data before weekly discovery and keeps success if discovery fails', async () => {
    children([0, 0, 1]);
    await import('../src/managed-scheduler.js');
    expect(mocks.spawn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    const calls = mocks.spawn.mock.calls;
    expect(calls.map(call => call[1])).toEqual([
      ['run', 'collect'], ['run', 'db:sync'], ['--use-env-proxy', '--import', 'tsx', 'collector/src/weekly-discovery-entry.ts'],
    ]);
    expect(calls[0][2].env.DSH_DISCOVERY_MODE).toBe('incremental');
    expect(calls[2][2].env.DSH_MODEL_REQUESTS_ENABLED).toBe('0');
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(mocks.spawn.mock.invocationCallOrder[2]);
    const state = JSON.parse(readFileSync(join(dir, 'operations/days/2026-09-20.json'), 'utf8'));
    expect(state.stages.verify.status).toBe('complete');
    expect(JSON.parse(readFileSync(join(dir, 'operations/weekly-discovery-slice.json'), 'utf8')).status).toBe('interrupted');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.spawn).toHaveBeenCalledTimes(3);
  });
  it('never launches collection, publication or weekly work when authentication is blocked', async () => {
    mocks.preflight.mockResolvedValue(false); children([]);
    await import('../src/managed-scheduler.js');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.spawn).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('does not begin weekly work when daily collection fails', async () => {
    children([1]); await import('../src/managed-scheduler.js');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.spawn).toHaveBeenCalledTimes(1); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('records a timeout and still kills remaining descendants after npm exits', async () => {
    const child = Object.assign(new EventEmitter(), { pid: 424242 });
    mocks.spawn.mockReturnValue(child);
    const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 'SIGTERM') Promise.resolve().then(() => child.emit('exit', null));
      return true;
    });
    await import('../src/managed-scheduler.js');
    await vi.advanceTimersByTimeAsync(91 * 60_000);
    expect(kill).toHaveBeenCalledWith(-424242, 'SIGTERM');
    const state = JSON.parse(readFileSync(join(dir, 'operations/days/2026-09-20.json'), 'utf8'));
    expect(state.stages.collect.error).toBe('collect-timeout');
    expect(state.stages.publish.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(kill).toHaveBeenCalledWith(-424242, 'SIGKILL');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });
});
