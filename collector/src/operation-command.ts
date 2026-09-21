import { localDay } from './operation-state.js';
export type CommandStage = 'collect' | 'publish' | 'discovery';
/** Daily publication is independent of the weekday; weekly discovery never invokes models. */
export function operationCommand(stage: CommandStage, date: string) {
  return {
    executable: stage === 'discovery' ? 'node' : 'npm',
    args: stage === 'discovery' ? ['--use-env-proxy', '--import', 'tsx', 'collector/src/weekly-discovery-entry.ts']
      : ['run', stage === 'collect' ? 'collect' : 'db:sync'],
    timeoutMs: (stage === 'discovery' ? 21 : 90) * 60_000,
    env: {
      DSH_DAILY_UPDATE: '1', DSH_OPERATION_DATE: date, DSH_DISCOVERY_MODE: 'incremental',
      ...(stage === 'discovery' ? { DSH_MODEL_REQUESTS_ENABLED: '0', DSH_MONITOR_READ_ONLY: '1' } : {}),
    },
  };
}

/** One bounded weekly slice per day, only after a verified daily publication. */
export function weeklyDiscoveryDue(options: {
  date: string; fullWeekday: number; dailyVerified: boolean; lastSliceDate?: string;
  timeZone?: string;
  sweep?: { startedAt: string; status: string; completedAt?: string };
}): boolean {
  if (!options.dailyVerified || options.lastSliceDate === options.date) return false;
  if (options.sweep && options.sweep.status !== 'complete') return true;
  const today = new Date(`${options.date}T12:00:00Z`);
  const daysSince = (today.getUTCDay() - options.fullWeekday + 7) % 7;
  today.setUTCDate(today.getUTCDate() - daysSince);
  const anchor = today.toISOString().slice(0, 10);
  // First installation starts after daily verification; a missed Sunday catches up.
  return !options.sweep || localDay(Date.parse(options.sweep.completedAt ?? options.sweep.startedAt), options.timeZone).date < anchor;
}
