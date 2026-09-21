import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeWeeklyCandidates, deferWeeklyCandidates, readWeeklyDiscoveryStatus, runWeeklyDiscovery, takeWeeklyCandidates } from '../src/weekly-discovery.js';
import { GithubError, type GithubRepo } from '../src/github.js';

const dirs: string[] = [];
async function directory() { const dir = await mkdtemp(join(tmpdir(), 'weekly-discovery-')); dirs.push(dir); return dir; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const config = { repositoryQueries: [{ id: 'one', query: 'topic:dsh-plugin' }], codeQueries: [], npmQueries: [] };
const repo = (name = 'owner/plugin', extra = {}) => ({ id: 1, node_id: 'R_1', full_name: name, ...extra }) as GithubRepo;
const result = (items = [repo()], total = items.length, incomplete = false) => ({ total_count: total, incomplete_results: incomplete, items });
const noRetry = { semanticRetries: 0, retryDelayMs: 0 };

describe('weekly discovery checkpoints', () => {
  it('queues each successful request before the slice ends, resumes cached pages with fixed sweep dates and fetches candidates fresh', async () => {
    const dataDir = await directory();
    const request = vi.fn(async () => result());
    const first = await runWeeklyDiscovery({ dataDir, config, now: new Date('2026-09-20T00:00:00Z'), maxRequests: 1, repositoryRequest: request });
    expect(first.status).toBe('partial');
    expect(first.audit[0].status).toBe('partial');
    expect((await takeWeeklyCandidates(dataDir)).candidates).toEqual([{ fullName: 'owner/plugin', repo: null, sources: ['github-repository:one'] }]);
    const resumed = vi.fn(async (query: string, page: number, perPage: number) => { expect(query).toContain('2026-09-20T00:00:00Z'); expect(perPage).toBe(100); return result(); });
    const second = await runWeeklyDiscovery({ dataDir, now: new Date('2026-09-21T00:00:00Z'), maxRequests: 1, repositoryRequest: resumed });
    expect(second.status).toBe('complete');
    expect(second.sweepId).toBe(first.sweepId);
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(second.audit[0].status).toBe('complete');
    expect((await readWeeklyDiscoveryStatus(dataDir))?.completedAt).toBeTruthy();
  });

  it('survives SIGKILL between successful requests without losing queued candidates or repeating the completed request', async () => {
    const dataDir = await directory();
    const moduleUrl = pathToFileURL(resolve('src/weekly-discovery.ts')).href;
    const script = `import { runWeeklyDiscovery } from ${JSON.stringify(moduleUrl)};
      let calls = 0;
      await runWeeklyDiscovery({ dataDir: ${JSON.stringify(dataDir)}, config: ${JSON.stringify(config)},
        repositoryRequest: async () => { if (++calls === 2) process.kill(process.pid, 'SIGKILL');
          return ${JSON.stringify(result())}; } });`;
    const exit = await new Promise<{ code: number | null; signal: string | null }>((accept, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { stdio: 'pipe' });
      let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', reject); child.on('exit', (code, signal) => code && signal !== 'SIGKILL' ? reject(new Error(stderr)) : accept({ code, signal }));
    });
    expect(exit.signal).toBe('SIGKILL');
    expect((await takeWeeklyCandidates(dataDir)).candidates).toHaveLength(1);
    const request = vi.fn(async (_query: string, _page: number, perPage: number) => { expect(perPage).toBe(100); return result(); });
    expect((await runWeeklyDiscovery({ dataDir, repositoryRequest: request })).status).toBe('complete');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed or incomplete requests and keeps partial source audit', async () => {
    const dataDir = await directory();
    const request = vi.fn(async () => result([repo()], 1, true));
    const first = await runWeeklyDiscovery({ dataDir, config, partitionOptions: noRetry, repositoryRequest: request });
    expect(first.status).toBe('partial');
    expect(first.audit[0].status).toBe('partial');
    const recovered = vi.fn(async () => result());
    expect((await runWeeklyDiscovery({ dataDir, partitionOptions: noRetry, repositoryRequest: recovered })).status).toBe('complete');
    expect(recovered).toHaveBeenCalledTimes(2);
  });

  it('retries failed network requests while preserving good cached requests', async () => {
    const dataDir = await directory();
    const firstRequest = vi.fn(async (_q: string, _page: number, perPage: number) => { if (perPage === 100) throw new Error('offline'); return result(); });
    expect((await runWeeklyDiscovery({ dataDir, config, repositoryRequest: firstRequest })).status).toBe('partial');
    const recovered = vi.fn(async (_q: string, _page: number, perPage: number) => { expect(perPage).toBe(100); return result(); });
    expect((await runWeeklyDiscovery({ dataDir, repositoryRequest: recovered })).status).toBe('complete');
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('invalidates stale pagination pages on semantic failure so later slices can recover', async () => {
    const dataDir = await directory();
    const response = result([repo()], 2);
    const first = await runWeeklyDiscovery({ dataDir, config, partitionOptions: noRetry, repositoryRequest: async () => response });
    expect(first.status).toBe('partial');
    const fresh = vi.fn(async () => result());
    expect((await runWeeklyDiscovery({ dataDir, partitionOptions: noRetry, repositoryRequest: fresh })).status).toBe('complete');
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('keeps unprocessed backlog ahead of previously acknowledged candidates rediscovered in a new sweep', async () => {
    const dataDir = await directory();
    await runWeeklyDiscovery({ dataDir, config, repositoryRequest: async () => result([repo('owner/first'), repo('owner/backlog', { id: 2, node_id: 'R_2' })]) });
    await acknowledgeWeeklyCandidates(dataDir, (await takeWeeklyCandidates(dataDir, 1)).receipt);
    await runWeeklyDiscovery({ dataDir, config, repositoryRequest: async () => result([repo('owner/first')]) });
    expect((await takeWeeklyCandidates(dataDir, 1)).candidates[0].fullName).toBe('owner/backlog');
  });

  it('defers unsuccessful candidates without deleting them and ignores stale revisions', async () => {
    const dataDir = await directory();
    await runWeeklyDiscovery({ dataDir, config, repositoryRequest: async () => result([repo('owner/first'), repo('owner/next', { id: 2, node_id: 'R_2' })]) });
    const first = (await takeWeeklyCandidates(dataDir, 1)).receipt;
    await deferWeeklyCandidates(dataDir, first.map(item => ({ ...item, revision: '0'.repeat(64) })));
    expect((await takeWeeklyCandidates(dataDir, 1)).candidates[0].fullName).toBe('owner/first');
    await deferWeeklyCandidates(dataDir, first);
    expect((await takeWeeklyCandidates(dataDir)).candidates.map(candidate => candidate.fullName)).toEqual(['owner/next', 'owner/first']);
  });

  it('fails closed on corrupt queue, checkpoint or receipt without replacing files', async () => {
    const dataDir = await directory();
    await runWeeklyDiscovery({ dataDir, config, maxRequests: 1, repositoryRequest: async () => result() });
    await expect(acknowledgeWeeklyCandidates(dataDir, [{ id: 'bad', fullName: 'owner/plugin', revision: 'bad' }])).rejects.toThrow('receipt');
    const queuePath = join(dataDir, 'weekly-discovery/queue.json');
    await writeFile(queuePath, JSON.stringify({ version: 2, entries: {} }));
    await expect(takeWeeklyCandidates(dataDir)).rejects.toThrow('queue');
    await expect(runWeeklyDiscovery({ dataDir, repositoryRequest: async () => result() })).rejects.toThrow('queue');
    expect(JSON.parse(await readFile(queuePath, 'utf8')).version).toBe(2);
    const checkpointPath = join(dataDir, 'weekly-discovery/checkpoint.json');
    await writeFile(checkpointPath, JSON.stringify({ version: 1, status: 'complete' }));
    await expect(readWeeklyDiscoveryStatus(dataDir)).rejects.toThrow('checkpoint');
  });

  it('keeps code/npm truncation honest without rerunning permanently limited windows', async () => {
    const dataDir = await directory();
    const run = await runWeeklyDiscovery({ dataDir,
      config: { repositoryQueries: [], codeQueries: [{ id: 'code', query: 'dsh filename:package.json' }], npmQueries: [{ id: 'npm', query: 'dsh' }] },
      codeOptions: { maxItems: 1, perPage: 1 },
      codeRequest: async () => ({ total_count: 20, incomplete_results: false, items: [{ repository: repo() }] }),
      npmOptions: { maxPages: 1, pageSize: 1 },
      npmFetch: vi.fn(async () => new Response(JSON.stringify({ total: 20, objects: [{ package: { name: 'package', links: { repository: 'git+https://github.com/owner/npm.git' } } }] }))) as typeof fetch,
    });
    expect(run.status).toBe('complete');
    expect(run.audit.map(source => source.status)).toEqual(['partial', 'partial']);
    expect((await takeWeeklyCandidates(dataDir)).candidates.map(candidate => candidate.fullName)).toEqual(['owner/plugin', 'owner/npm']);
    expect(await readdir(dataDir)).toEqual(['weekly-discovery']);
  });

  it('excludes private response identities from checkpoints and queue; a 401 stops later sources', async () => {
    const dataDir = await directory();
    await runWeeklyDiscovery({ dataDir, config, partitionOptions: noRetry, repositoryRequest: async () => result([repo('private/secret', { private: true })]) });
    expect((await takeWeeklyCandidates(dataDir)).candidates).toHaveLength(0);
    expect(await readFile(join(dataDir, 'weekly-discovery/checkpoint.json'), 'utf8')).not.toContain('private/secret');
    const request = vi.fn(async () => { throw new GithubError('Bad credentials', 401, 'https://api.github.com/search/repositories'); });
    await expect(runWeeklyDiscovery({ dataDir, repositoryRequest: request })).rejects.toBeDefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('acknowledges exact revisions only and does not requeue acknowledged pages replayed after interruption', async () => {
    const dataDir = await directory();
    await runWeeklyDiscovery({ dataDir, config, maxRequests: 1, repositoryRequest: async () => result() });
    const selected = await takeWeeklyCandidates(dataDir);
    await acknowledgeWeeklyCandidates(dataDir, selected.receipt);
    await runWeeklyDiscovery({ dataDir, repositoryRequest: async () => result() });
    expect((await takeWeeklyCandidates(dataDir)).candidates).toHaveLength(0);
    await runWeeklyDiscovery({ dataDir, config, now: new Date('2026-09-27T00:00:00Z'), repositoryRequest: async () => result() });
    await acknowledgeWeeklyCandidates(dataDir, selected.receipt);
    expect((await takeWeeklyCandidates(dataDir)).candidates).toHaveLength(1);
    expect((await takeWeeklyCandidates(dataDir, 0)).candidates).toHaveLength(0);
  });
});
