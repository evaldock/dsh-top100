/** Resumable, metadata-only discovery. Callers serialize this with collection using the scheduler lock. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import discoveryConfig from '../config/discovery-sources.json';
import { isGithubAuthenticationFailure, type GithubRepo, type GithubCodeRepository, type GithubSearchResult, type GithubCodeSearchResult } from './github.js';
import type { DiscoveryCandidate, DiscoverySourceAudit, DiscoverOptions } from './sources/discovery.js';
import { partitionedRepositorySearch, requestGithubRepositories, RepositorySearchIncompleteError, SearchPartialError, type PartitionedSearchOptions, type RepositorySearchRequest } from './sources/github-partitioned-search.js';
import { searchCodeRepositories, requestGithubCode, type CodeSearchOptions, type CodeSearchRequest } from './sources/github-code-search.js';
import { searchNpmRepositories, githubRepositoryFromNpmLink, type NpmSearchOptions } from './sources/npm-search.js';

type Config = NonNullable<DiscoverOptions['config']>;
export interface WeeklyDiscoveryStatus {
  sweepId: string;
  startedAt: string;
  completedAt?: string;
  status: 'complete' | 'partial';
  audit: DiscoverySourceAudit[];
}
interface Checkpoint extends WeeklyDiscoveryStatus { version: 1; config: Config; finishedSources: string[] }
interface QueueEntry { fullName: string; sources: string[]; observations: string[]; revision: string; acknowledged?: string }
interface Queue { version: 1; entries: Record<string, QueueEntry> }
export interface WeeklyCandidateReceipt { id: string; fullName: string; revision: string }
export interface WeeklyDiscoveryOptions {
  dataDir: string;
  now?: Date;
  maxRequests?: number;
  maxDurationMs?: number;
  config?: Config;
  repositoryRequest?: RepositorySearchRequest;
  codeRequest?: CodeSearchRequest;
  npmFetch?: typeof fetch;
  partitionOptions?: Omit<PartitionedSearchOptions, 'request' | 'to'>;
  codeOptions?: Omit<CodeSearchOptions, 'request'>;
  npmOptions?: Omit<NpmSearchOptions, 'fetchImpl'>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const directory = (dataDir: string) => join(dataDir, 'weekly-discovery');
async function readJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
  await rename(temp, path);
}
const validName = (value: unknown): value is string => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value);
const validRevision = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
function validConfig(value: Config): boolean {
  return value && ['repositoryQueries', 'codeQueries', 'npmQueries'].every(key => {
    const sources = value[key as keyof Config];
    return Array.isArray(sources) && sources.every(source => source && typeof source.id === 'string' && source.id.length > 0 && typeof source.query === 'string' && source.query.length > 0)
      && new Set(sources.map(source => source.id)).size === sources.length;
  });
}
async function queueAt(dataDir: string): Promise<Queue> {
  const value = await readJson<Queue>(join(directory(dataDir), 'queue.json'));
  if (!value) return { version: 1, entries: {} };
  if (value.version !== 1 || !value.entries || Array.isArray(value.entries) || typeof value.entries !== 'object' ||
      !Object.entries(value.entries).every(([id, entry]) => entry && validName(entry.fullName) && id === entry.fullName.toLowerCase() &&
        stringArray(entry.sources) && entry.sources.length > 0 && stringArray(entry.observations) && entry.observations.length > 0 && validRevision(entry.revision) &&
        entry.revision === hash(entry.observations.slice().sort().join('\n')) &&
        (entry.acknowledged === undefined || validRevision(entry.acknowledged)))) {
    throw new Error('Weekly discovery queue is invalid; refusing to overwrite it');
  }
  return value;
}
async function checkpointAt(dataDir: string): Promise<Checkpoint | null> {
  const value = await readJson<Checkpoint>(join(directory(dataDir), 'checkpoint.json'));
  if (!value) return null;
  if (value.version !== 1 || typeof value.sweepId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.sweepId) ||
      !validDate(value.startedAt) || !['complete', 'partial'].includes(value.status) ||
      (value.completedAt !== undefined && !validDate(value.completedAt)) || (value.status === 'complete' && !value.completedAt) ||
      !stringArray(value.finishedSources) || !validConfig(value.config) || !Array.isArray(value.audit) ||
      !value.audit.every(source => source && typeof source.id === 'string' && ['repository', 'code', 'npm'].includes(source.kind) &&
        ['complete', 'partial', 'failed'].includes(source.status) && Number.isInteger(source.candidates) && source.candidates >= 0 &&
        Number.isInteger(source.requests) && source.requests >= 0)) {
    throw new Error('Weekly discovery checkpoint is invalid; refusing to overwrite it');
  }
  const sourceIds = new Set([
    ...value.config.repositoryQueries.map(source => `github-repository:${source.id}`),
    ...value.config.codeQueries.map(source => `github-code:${source.id}`),
    ...value.config.npmQueries.map(source => `npm:${source.id}`),
  ]);
  if (!value.finishedSources.every(id => sourceIds.has(id)) || !value.audit.every(source => sourceIds.has(source.id)) ||
      (value.status === 'complete' && ![...sourceIds].every(id => value.finishedSources.includes(id)))) {
    throw new Error('Weekly discovery checkpoint source coverage is invalid');
  }
  return value;
}
function validateReceipt(receipt: WeeklyCandidateReceipt[]): void {
  if (!Array.isArray(receipt) || !receipt.every(item => item && validName(item.fullName) && item.id === item.fullName.toLowerCase() && validRevision(item.revision))) {
    throw new Error('Weekly candidate receipt is invalid');
  }
}
export async function readWeeklyDiscoveryStatus(dataDir: string): Promise<WeeklyDiscoveryStatus | null> {
  return checkpointAt(dataDir);
}
/** Read without removing: acknowledge only candidates successfully handled by a completed collection. */
export async function takeWeeklyCandidates(dataDir: string, limit = 200): Promise<{ candidates: DiscoveryCandidate[]; receipt: WeeklyCandidateReceipt[] }> {
  if (!Number.isInteger(limit) || limit < 0) throw new Error('Weekly candidate limit must be a nonnegative integer');
  const selected = Object.entries((await queueAt(dataDir)).entries)
    .filter(([, entry]) => entry.acknowledged !== entry.revision).slice(0, limit);
  return {
    candidates: selected.map(([, entry]) => ({ fullName: entry.fullName, repo: null, sources: entry.sources })),
    receipt: selected.map(([id, entry]) => ({ id, fullName: entry.fullName, revision: entry.revision })),
  };
}
export async function acknowledgeWeeklyCandidates(dataDir: string, receipt: WeeklyCandidateReceipt[]): Promise<void> {
  validateReceipt(receipt);
  if (!receipt.length) return;
  const queue = await queueAt(dataDir);
  for (const item of receipt) {
    const entry = queue.entries[item.id];
    if (entry?.revision === item.revision) entry.acknowledged = item.revision;
  }
  await mkdir(directory(dataDir), { recursive: true, mode: 0o700 });
  await atomicJson(join(directory(dataDir), 'queue.json'), queue);
}
/** Retry temporary failures behind the existing backlog; never discard pending candidates. */
export async function deferWeeklyCandidates(dataDir: string, receipt: WeeklyCandidateReceipt[]): Promise<void> {
  validateReceipt(receipt);
  if (!receipt.length) return;
  const queue = await queueAt(dataDir);
  for (const item of receipt) {
    const entry = queue.entries[item.id];
    if (entry?.revision !== item.revision || entry.acknowledged === entry.revision) continue;
    delete queue.entries[item.id];
    queue.entries[item.id] = entry;
  }
  await mkdir(directory(dataDir), { recursive: true, mode: 0o700 });
  await atomicJson(join(directory(dataDir), 'queue.json'), queue);
}
class SliceEnded extends Error {}
function causedBy(error: unknown, kind: typeof SliceEnded | typeof RepositorySearchIncompleteError): boolean {
  return error instanceof kind || (error instanceof Error && error.cause !== undefined && causedBy(error.cause, kind));
}
function publicIdentity(repo: GithubCodeRepository & { private?: boolean; visibility?: string }): GithubCodeRepository | null {
  if (repo.private === true || repo.visibility === 'private') return null;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo.full_name)) return null;
  return { id: repo.id, node_id: repo.node_id, full_name: repo.full_name };
}

/** Successful request pages are checkpointed before proceeding; failed/incomplete responses never enter the cache. */
export async function runWeeklyDiscovery(options: WeeklyDiscoveryOptions): Promise<WeeklyDiscoveryStatus & { requests: number; queued: number }> {
  const maxRequests = options.maxRequests ?? 300;
  const maxDurationMs = options.maxDurationMs ?? 20 * 60_000;
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isFinite(maxDurationMs) || maxDurationMs <= 0) {
    throw new Error('Weekly discovery budgets must be positive');
  }
  const base = directory(options.dataDir);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const saved = await checkpointAt(options.dataDir);
  if (options.config && !validConfig(options.config)) throw new Error('Weekly discovery config is invalid');
  const checkpoint: Checkpoint = saved && saved.status !== 'complete' ? saved : {
    version: 1, sweepId: randomUUID(), startedAt: (options.now ?? new Date()).toISOString(),
    status: 'partial', audit: [], config: options.config ?? discoveryConfig, finishedSources: [],
  };
  const queue = await queueAt(options.dataDir);
  await atomicJson(join(base, 'checkpoint.json'), checkpoint);
  const cacheDir = join(base, 'requests', checkpoint.sweepId);
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const started = Date.now();
  let requests = 0;
  const checkBudget = () => {
    if (requests >= maxRequests || Date.now() - started >= maxDurationMs) throw new SliceEnded();
  };
  const enqueue = async (names: string[], source: string) => {
    let changed = false;
    for (const fullName of names) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) continue;
      const id = fullName.toLowerCase();
      const observation = `${checkpoint.sweepId}:${source}`;
      const entry = queue.entries[id] ?? { fullName, sources: [], observations: [], revision: '' };
      if (entry.observations.includes(observation)) continue;
      // Only this sweep's observations are needed; old acknowledgements remain useful tombstones until rediscovery.
      entry.observations = entry.observations.filter(value => value.startsWith(`${checkpoint.sweepId}:`));
      entry.observations.push(observation);
      if (!entry.sources.includes(source)) entry.sources.push(source);
      const wasAcknowledged = entry.acknowledged === entry.revision;
      entry.revision = hash(entry.observations.slice().sort().join('\n'));
      // Rediscovery goes behind the existing backlog so frequent rediscovery cannot starve older candidates.
      if (wasAcknowledged) delete queue.entries[id];
      queue.entries[id] = entry;
      changed = true;
    }
    if (changed) await atomicJson(join(base, 'queue.json'), queue);
  };
  const tasks = [
    ...checkpoint.config.repositoryQueries.map(source => ({ ...source, id: `github-repository:${source.id}`, kind: 'repository' as const })),
    ...checkpoint.config.codeQueries.map(source => ({ ...source, id: `github-code:${source.id}`, kind: 'code' as const })),
    ...checkpoint.config.npmQueries.map(source => ({ ...source, id: `npm:${source.id}`, kind: 'npm' as const })),
  ];
  for (const task of tasks) {
    if (checkpoint.finishedSources.includes(task.id)) continue;
    const sourceCache = join(cacheDir, hash(task.id));
    await mkdir(sourceCache, { recursive: true, mode: 0o700 });
    let attempts = 0;
    const request = async <T>(key: string, execute: () => Promise<T>, names: (body: T) => string[], cacheable: (body: T) => boolean = () => true): Promise<T> => {
      // Cache hits do not spend network budget, but replay must still respect the wall-clock slice.
      if (Date.now() - started >= maxDurationMs) throw new SliceEnded();
      const path = join(sourceCache, `${hash(key)}.json`);
      const cached = await readJson<T>(path);
      if (cached) { await enqueue(names(cached), task.id); return cached; }
      checkBudget();
      requests++; attempts++;
      const body = await execute();
      await enqueue(names(body), task.id);
      if (cacheable(body)) await atomicJson(path, body);
      return body;
    };
    let audit: DiscoverySourceAudit;
    try {
      if (task.kind === 'repository') {
        const result = await partitionedRepositorySearch(`${task.query} is:public`, {
          ...options.partitionOptions, to: new Date(checkpoint.startedAt),
          request: (query, page, perPage) => request(JSON.stringify([query, page, perPage]), async () => {
            const response = await (options.repositoryRequest ?? requestGithubRepositories)(query, page, perPage);
            return { total_count: response.total_count, incomplete_results: response.incomplete_results,
              items: response.items.map(publicIdentity).filter(item => item !== null) as GithubRepo[] } satisfies GithubSearchResult;
          }, body => body.items.map(repo => repo.full_name), body => !body.incomplete_results),
        });
        audit = { id: task.id, kind: task.kind, status: 'complete', candidates: result.repositories.length, requests: result.audit.requests, shards: result.audit.shards };
      } else if (task.kind === 'code') {
        const result = await searchCodeRepositories(task.query, {
          ...options.codeOptions,
          request: (query, page, perPage) => request(JSON.stringify([query, page, perPage]), async () => {
            const response = await (options.codeRequest ?? requestGithubCode)(query, page, perPage);
            return { total_count: response.total_count, incomplete_results: response.incomplete_results,
              items: response.items.map(item => publicIdentity(item.repository)).filter(item => item !== null).map(repository => ({ repository })) } satisfies GithubCodeSearchResult;
          }, body => body.items.map(item => item.repository.full_name), body => !body.incomplete_results),
        });
        audit = { id: task.id, kind: task.kind, status: result.complete ? 'complete' : 'partial', candidates: result.repositories.length, requests: result.requests,
          message: result.complete ? undefined : `GitHub exposes only the first ${result.matches} of ${result.totalMatches} code matches` };
      } else {
        const result = await searchNpmRepositories(task.query, {
          ...options.npmOptions,
          fetchImpl: (async (input, init) => {
            const body = await request(String(input), async () => {
              const response = await (options.npmFetch ?? fetch)(input, init);
              if (!response.ok) throw new Error('npm search request failed');
              const raw = await response.json() as { total: number; objects: Array<{ package: { name: string; links?: { repository?: string } } }> };
              return { total: raw.total, objects: raw.objects.map(item => ({ package: { name: item.package.name, links: { repository: githubRepositoryFromNpmLink(item.package.links?.repository) ? `github:${githubRepositoryFromNpmLink(item.package.links?.repository)}` : undefined } } })) };
            }, body => body.objects.map(item => githubRepositoryFromNpmLink(item.package.links.repository)).filter((name): name is string => name !== null));
            return new Response(JSON.stringify(body), { status: 200 });
          }) as typeof fetch,
        });
        audit = { id: task.id, kind: task.kind, status: result.complete ? 'complete' : 'partial', candidates: result.repositories.length, requests: result.requests,
          message: result.complete ? undefined : `npm returned ${result.packages} packages before the configured page limit` };
      }
      checkpoint.finishedSources.push(task.id);
    } catch (error) {
      if (isGithubAuthenticationFailure(error)) throw error;
      const sliceEnded = causedBy(error, SliceEnded);
      // Semantic failures must retry fresh pages; retaining their stale cache could make incompleteness permanent.
      if (causedBy(error, RepositorySearchIncompleteError)) await rm(sourceCache, { recursive: true, force: true });
      const partial = error instanceof SearchPartialError ? error.partial as { repositories?: unknown[]; audit?: { requests: number }; requests?: number } | undefined : undefined;
      const candidates = partial?.repositories?.length ?? 0;
      audit = { id: task.id, kind: task.kind, status: candidates ? 'partial' : 'failed', candidates,
        requests: partial?.audit?.requests ?? partial?.requests ?? attempts, message: 'Source interrupted; successful requests retained for retry' };
      if (sliceEnded) {
        checkpoint.audit = [...checkpoint.audit.filter(source => source.id !== task.id), audit];
        break;
      }
    }
    checkpoint.audit = [...checkpoint.audit.filter(source => source.id !== task.id), audit];
    await atomicJson(join(base, 'checkpoint.json'), checkpoint);
  }
  if (tasks.every(task => checkpoint.finishedSources.includes(task.id))) {
    checkpoint.status = 'complete';
    checkpoint.completedAt = new Date().toISOString();
  }
  await atomicJson(join(base, 'checkpoint.json'), checkpoint);
  // Completed-sweep request pages are disposable; the audit and pending candidate queue remain durable.
  if (checkpoint.status === 'complete') await rm(cacheDir, { recursive: true, force: true });
  return { ...checkpoint, requests, queued: Object.values(queue.entries).filter(entry => entry.acknowledged !== entry.revision).length };
}
