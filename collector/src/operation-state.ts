/** Durable daily progress. Only the scheduler holding the OS lock may write it. */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OperationError } from './operation-errors.js';

export const stages = ['collect', 'publish', 'verify'] as const;
export type Stage = typeof stages[number];
export const stageAttemptLimits: Readonly<Record<Stage, number>> = { collect: 3, publish: 3, verify: 6 };
export interface StageProgress {
  status: 'pending' | 'running' | 'failed' | 'complete';
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  nextAttemptAt?: string;
  error?: string;
}
export interface DailyOperation {
  schemaVersion: 1;
  date: string;
  updatedAt: string;
  stages: Record<Stage, StageProgress>;
  snapshotId?: string;
}
export function atomicOperationJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  renameSync(temporary, path);
}
export function readOperationJson<T>(path: string): T | undefined {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
export function localDay(now: number, timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) };
}
export function operationPath(directory: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid-operation-date');
  return join(directory, 'days', `${date}.json`);
}
export function loadOperation(directory: string, date: string, now: number): DailyOperation {
  const old = readOperationJson<DailyOperation>(operationPath(directory, date));
  if (old) {
    if (old.schemaVersion !== 1 || old.date !== date || !old.stages || stages.some(stage => {
      const value = old.stages[stage];
      return !value || !['pending', 'running', 'failed', 'complete'].includes(value.status)
        || !Number.isInteger(value.attempts) || value.attempts < 0
        || value.nextAttemptAt !== undefined && !Number.isFinite(Date.parse(value.nextAttemptAt));
    }) || stages.some((stage, index) => old.stages[stage].status !== 'pending'
      && stages.slice(0, index).some(before => old.stages[before].status !== 'complete'))) throw new Error('invalid-operation-state');
    return old;
  }
  return { schemaVersion: 1, date, updatedAt: new Date(now).toISOString(),
    stages: Object.fromEntries(stages.map(stage => [stage, { status: 'pending', attempts: 0 }])) as DailyOperation['stages'] };
}
export function dailyOperationDue(now: number, hour: number, timeZone = 'Asia/Shanghai', startDate?: string): boolean {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('invalid-schedule');
  const today = localDay(now, timeZone);
  return today.hour >= hour && (!startDate || today.date >= startDate);
}
export function nextStage(state: DailyOperation, now: number): Stage | undefined {
  const stage = stages.find(stage => state.stages[stage].status !== 'complete');
  if (!stage) return undefined;
  const progress = state.stages[stage];
  if (progress.attempts >= stageAttemptLimits[stage]) return undefined;
  if (progress.nextAttemptAt && Date.parse(progress.nextAttemptAt) > now) return undefined;
  return stage;
}
export function hasExhaustedStage(state: DailyOperation): boolean {
  return stages.some(stage => state.stages[stage].status === 'failed'
    && state.stages[stage].attempts >= stageAttemptLimits[stage]);
}
export function failStage(state: DailyOperation, stage: Stage, now: number, code: string): void {
  const progress = state.stages[stage];
  progress.status = 'failed'; progress.error = code; progress.finishedAt = new Date(now).toISOString();
  progress.nextAttemptAt = new Date(now + Math.min(60, (stage === 'verify' ? 5 : 15) * 2 ** Math.max(0, progress.attempts - 1)) * 60_000).toISOString();
}
/** Running after a crash is inconclusive, never a successful stage. Paid job/ledger state is retained. */
export async function advanceOperation(state: DailyOperation, options: {
  now: () => number; timeZone: string; persist: (state: DailyOperation) => void;
  /** Resource pauses do not start a stage or consume its finite retry allowance. */
  beforeStage?: (stage: Stage) => Promise<boolean> | boolean;
  execute: (stage: Stage) => Promise<{ snapshotId?: string } | void>;
}): Promise<void> {
  let stage: Stage | undefined;
  while (localDay(options.now(), options.timeZone).date === state.date && (stage = nextStage(state, options.now()))) {
    if (options.beforeStage && !await options.beforeStage(stage)) return;
    if (localDay(options.now(), options.timeZone).date !== state.date) return;
    const progress = state.stages[stage];
    progress.status = 'running'; progress.attempts++; progress.startedAt = new Date(options.now()).toISOString();
    delete progress.nextAttemptAt; delete progress.error;
    state.updatedAt = progress.startedAt; options.persist(state);
    try {
      const result = await options.execute(stage);
      if (result?.snapshotId) state.snapshotId = result.snapshotId;
      progress.status = 'complete'; progress.finishedAt = new Date(options.now()).toISOString();
    } catch (error) {
      // Never persist provider messages, command text, URLs or credentials.
      failStage(state, stage, options.now(), error instanceof OperationError ? error.code : `${stage}-failed`);
      state.updatedAt = new Date(options.now()).toISOString(); options.persist(state); return;
    }
    state.updatedAt = new Date(options.now()).toISOString(); options.persist(state);
  }
}
