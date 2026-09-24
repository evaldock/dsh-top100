import { describe, expect, it, vi } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import { runBoardFirstDescriptions } from '../src/daily-board-descriptions.js';
import { descriptionSourceHash, type DescriptionJob } from '../src/description-jobs.js';
import { checkReviewedFunctionEvidence } from '../src/reviewed-evidence.js';
import { applyFunctionEvidenceCheck } from '../src/reviewed-evidence-state.js';
import { reviewedDescription } from '../src/editorial.js';
import { publishedDescriptionZh, publishDescription, verifiedDescriptionZh } from '../src/published-description.js';
import { attachDescriptionCoverage } from '../src/board-descriptions.js';
import type { RankingEntry, RankingsDocument } from '../src/rankings.js';
import type { ZhEntry } from '../src/zh-util.js';
import { descriptionDisplayFor, PENDING_DESCRIPTION_ZH } from '../../plugin/src/shared/description-rules.js';
import { withPublishedDescription } from '../../plugin/src/shared/descriptions.js';
import { descriptionDisplayFor as webDescriptionDisplayFor } from '../../web/public/description-presentation.js';
import reviews from '../config/reviewed-descriptions.json';
import fixture from './fixtures/board-review-integration-20260916.json';

const now = Date.parse('2026-09-16T04:00:00Z');
const approved = fixture.entries.filter(row => row.expected !== null);
const unresolved = fixture.entries.filter(row => row.expected === null);
type Row = typeof fixture.entries[number];

function source(row: Row): DshPlugin {
  const input = structuredClone(row.source);
  const [owner, repo] = input.fullName.split('/');
  return { ...input, id: input.fullName.toLowerCase(), owner, repo,
    descriptionZh: input.descriptionZh ?? null, readmeSummary: input.readmeSummary ?? null,
    type: input.type as DshPlugin['type'], install: input.install as DshPlugin['install'],
    stars: 10, forks: 0, openIssues: 0, language: 'TypeScript', curated: false,
    homepage: null, license: null, tags: [], topics: [], sources: [],
    pushedAt: '', createdAt: '', updatedAt: '', lastCheckedAt: '',
    score: { total: 0, confidence: 0, explanation: '',
      breakdown: { maintain: 0, practical: 0, popularity: 0, ease: 0, signal: 0 } } };
}

async function verifiedSources(rows: Row[] = approved): Promise<DshPlugin[]> {
  return Promise.all(rows.map(async row => {
    const input = source(row);
    if (input.id !== 'adwmc/helm-d') return input;
    const check = await checkReviewedFunctionEvidence(input.fullName, input.install,
      async path => fixture.helmSourceFiles[path as keyof typeof fixture.helmSourceFiles] ?? null);
    expect(check.status).toBe('matched');
    return applyFunctionEvidenceCheck(input, undefined, check);
  }));
}

function rankingEntry(input: DshPlugin, rank = 1): RankingEntry {
  return { ...input, rank, totalRank: rank, descriptionZh: input.descriptionZh ?? PENDING_DESCRIPTION_ZH,
    readmeSummary: input.readmeSummary ?? undefined, dailyStars: 0, weeklyStars: 0, hotScore: 1,
    categories: [], url: `https://github.com/${input.fullName}` };
}

function rankings(inputs: DshPlugin[]): RankingsDocument {
  return { schemaVersion: 1, generatedAt: new Date(now).toISOString(), snapshotDate: '2026-09-16',
    definitions: { hot: '', rising: '', total: '' }, categories: [], directories: { skills: [] },
    rankings: { total: [], hot: inputs.map(rankingEntry), rising: inputs.map(rankingEntry) } };
}

function staleState(inputs: DshPlugin[], locked = false) {
  const cache = new Map<string, ZhEntry>();
  const jobs: Record<string, DescriptionJob> = {};
  for (const input of inputs) {
    const descriptionZh = input.descriptionZh ?? PENDING_DESCRIPTION_ZH;
    const sourceHash = descriptionSourceHash(input);
    cache.set(input.id, { descriptionZh, tagsZh: [], sourceHash, origin: 'legacy' });
    jobs[input.id] = { sourceHash, status: locked ? 'review-required' : 'complete', attempts: 1,
      descriptionZh, origin: 'legacy', ...(locked ? { reviewLocked: true,
        rejectedDescriptionZh: descriptionZh, reviewReason: '旧摘要待定向复核。' } : {}) };
  }
  return { cache, jobs };
}

async function run(inputs: DshPlugin[], previous: DshPlugin[], cache: Map<string, ZhEntry>, jobs: Record<string, DescriptionJob>, at = now) {
  // enabled=true and a nonzero limit prove source/review gates stop dispatch;
  // a disabled model flag or zero batch limit would conceal an eligibility bug.
  const worker = vi.fn(async () => ({ descriptionZh: '检索资料并整理结果，帮助用户完成当前任务。', tagsZh: [] }));
  const persisted: Record<string, DescriptionJob>[] = [];
  const result = await runBoardFirstDescriptions(inputs, new Map(previous.map(entry => [entry.id, entry])), cache, jobs,
    () => rankings(inputs), { enabled: true, limit: 100, now: at, worker,
      persist: state => { persisted.push(structuredClone(state)); } });
  expect(worker).not.toHaveBeenCalled();
  expect(result.boardsReady).toBe(0);
  expect(result.dailyReady).toBe(0);
  expect(result.boards.attempted + result.daily.attempted).toBe(0);
  expect(persisted.length).toBeGreaterThan(0);
  return result;
}

describe('reviewed board corrections survive the real daily pipeline', () => {
  it.each([false, true])('replaces all 36 stale caches and persisted jobs (previous lock=%s) without another request', async locked => {
    expect(approved).toHaveLength(36);
    const inputs = await verifiedSources();
    const previous = structuredClone(inputs);
    const { cache, jobs } = staleState(inputs, locked);
    const before = structuredClone(inputs);
    const result = await run(inputs, previous, cache, jobs);
    for (const [index, input] of inputs.entries()) {
      const expected = approved[index].expected!;
      expect(input.descriptionZh, input.fullName).toBe(expected);
      expect(result.jobs[input.id], input.fullName).toMatchObject({ status: 'complete', attempts: 1,
        descriptionZh: expected, origin: 'reviewed' });
      expect(result.jobs[input.id].reviewLocked, input.fullName).not.toBe(true);
      expect(cache.get(input.id), input.fullName).toMatchObject({ descriptionZh: expected,
        sourceHash: descriptionSourceHash(input), origin: 'reviewed' });
      const { descriptionZh: _old, ...oldRest } = before[index];
      const { descriptionZh: _new, ...newRest } = input;
      expect(newRest, input.fullName).toEqual(oldRest);
    }

    // Simulate tomorrow's collector clearing generated fields before preparation.
    const fresh = await verifiedSources();
    fresh.forEach(input => { input.descriptionZh = null; });
    const next = await run(fresh, inputs, cache, result.jobs, now + 86_400_000);
    for (const [index, input] of fresh.entries()) {
      expect(input.descriptionZh, input.fullName).toBe(approved[index].expected);
      expect(next.jobs[input.id].attempts, input.fullName).toBe(1);
      expect(next.jobs[input.id].origin, input.fullName).toBe('reviewed');
    }
  });

  it('keeps all four unresolved objects withheld across cached text, fresh collection and source changes', async () => {
    expect(unresolved).toHaveLength(4);
    for (const mutate of [false, true]) {
      const inputs = unresolved.map(source);
      inputs.forEach(input => { input.descriptionZh = '为用户提供桌面工作区、任务协作与文件管理功能。'; });
      const previous = structuredClone(inputs);
      const { cache, jobs } = staleState(inputs);
      if (mutate) for (const input of inputs) {
        input.description += ' Updated repository metadata.';
        input.readmeSummary = `${input.readmeSummary ?? ''} Newly documented functions.`;
        input.install.packageName = `${input.install.packageName ?? 'unresolved'}-changed`;
      }
      for (const input of inputs) {
        const stale = rankingEntry(input);
        expect(descriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
        expect(webDescriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      }
      const result = await run(inputs, previous, cache, jobs);
      for (const input of inputs) {
        expect(input.descriptionZh, input.fullName).toBe(PENDING_DESCRIPTION_ZH);
        expect(result.jobs[input.id].status, input.fullName).toBe('review-required');
        expect(cache.has(input.id), input.fullName).toBe(false);
        expect(publishedDescriptionZh(rankingEntry(input)), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      }
      const fresh = structuredClone(inputs);
      fresh.forEach(input => { input.descriptionZh = null; });
      const next = await run(fresh, inputs, cache, result.jobs, now + 86_400_000);
      expect(Object.values(next.jobs).every(job => job.status === 'review-required')).toBe(true);
    }
  });

  it.each(['readme', 'package', 'directory', 'type'] as const)('keeps source jobs frozen after %s changes and qualifies same-package old display', async change => {
    // helm-d uses reviewed implementation files instead of absent README evidence;
    // that separate source contract is exercised below.
    const inputs = (await verifiedSources()).filter(input => change !== 'readme' || input.id !== 'adwmc/helm-d');
    for (const input of inputs) input.descriptionZh = reviewedDescription(input)!;
    const previous = structuredClone(inputs);
    const { cache, jobs } = staleState(inputs);
    for (const input of inputs) {
      if (change === 'readme') input.readmeSummary = `${input.readmeSummary ?? ''} Unreviewed feature change.`;
      if (change === 'package') input.install.packageName = '@unreviewed/other-package';
      if (change === 'directory') input.install.repositoryPath = 'packages/unreviewed-sibling';
      if (change === 'type') input.type = 'skill';
      // Check the stale payload before collection can sanitize it: both clients
      // must independently refuse the old claim for the changed object.
      const stale = rankingEntry(input);
      expect(descriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(webDescriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(withPublishedDescription(stale as Parameters<typeof withPublishedDescription>[0]).descriptionZh,
        input.fullName).toBe(PENDING_DESCRIPTION_ZH);
    }
    const result = await run(inputs, previous, cache, jobs);
    for (const input of inputs) {
      expect(input.descriptionZh, input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(result.jobs[input.id].status, input.fullName).toBe('review-required');
      expect(cache.has(input.id), input.fullName).toBe(false);
      expect(verifiedDescriptionZh(rankingEntry(input)), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      if (change === 'readme' && publishedDescriptionZh(rankingEntry(input)) !== PENDING_DESCRIPTION_ZH) {
        const published = publishDescription(rankingEntry(input));
        expect(published.descriptionStatus?.state, input.fullName).toBe('stale');
        expect(descriptionDisplayFor(published), input.fullName).toContain('核对，未确认最新变化');
        expect(webDescriptionDisplayFor(published), input.fullName).toContain('未确认最新变化');
      } else expect(publishedDescriptionZh(rankingEntry(input))).toBe(PENDING_DESCRIPTION_ZH);
    }
  });

  it('requires the actual reviewed helm bootstrap files before recovering its text, and withholds changed code', async () => {
    const row = approved.find(value => value.source.fullName === 'ADWMC/helm-d')!;
    const original = source(row);
    const { cache, jobs } = staleState([original]);
    const missing = await run([original], [structuredClone(original)], cache, jobs);
    expect(missing.jobs[original.id].status).toBe('review-required');
    expect(original.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);

    const [verified] = await verifiedSources([row]);
    await run([verified], [original], cache, missing.jobs);
    expect(verified.descriptionZh).toBe(row.expected);
    const changed = await checkReviewedFunctionEvidence(verified.fullName, verified.install, async path => {
      const content = fixture.helmSourceFiles[path as keyof typeof fixture.helmSourceFiles];
      return path.endsWith('/src/index.ts') ? `${content}\nexport const unreviewedCapability = true;\n` : content ?? null;
    });
    expect(changed.status).toBe('changed');
    expect(changed.marker).toBeNull();
    const unverified = applyFunctionEvidenceCheck(structuredClone(verified), verified, changed);
    const stale = staleState([verified]);
    const result = await run([unverified], [verified], stale.cache, stale.jobs);
    expect(unverified.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
    expect(result.jobs[unverified.id].status).toBe('review-required');
  });

  it('withholds source caches but qualifies old display when the full README changes beyond the excerpt', async () => {
    const inputs = (await verifiedSources()).filter(input => input.install.discovery?.readme);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) input.descriptionZh = reviewedDescription(input)!;
    const previous = structuredClone(inputs);
    const { cache, jobs } = staleState(inputs);
    for (const input of inputs) input.install.discovery!.readme!.documentSha256 = 'f'.repeat(64);
    for (const [index, input] of inputs.entries()) {
      expect(input.readmeSummary, input.fullName).toBe(previous[index].readmeSummary);
      const stale = rankingEntry(input);
      expect(descriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(webDescriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
    }
    const result = await run(inputs, previous, cache, jobs);
    for (const input of inputs) {
      expect(input.descriptionZh, input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(result.jobs[input.id].status, input.fullName).toBe('review-required');
      expect(cache.has(input.id), input.fullName).toBe(false);
      expect(verifiedDescriptionZh(rankingEntry(input)), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      if (input.type === 'cordis-plugin') {
        const published = publishDescription(rankingEntry(input));
        expect(published.descriptionStatus?.state, input.fullName).toBe('stale');
        expect(descriptionDisplayFor(published), input.fullName).toContain('核对，未确认最新变化');
        expect(webDescriptionDisplayFor(published), input.fullName).toContain('未确认最新变化');
      } else expect(publishedDescriptionZh(rankingEntry(input))).toBe(PENDING_DESCRIPTION_ZH);
    }
  });

  it('keeps source jobs held and old display dated when discovery is no longer verified', async () => {
    const inputs = await verifiedSources();
    for (const input of inputs) input.descriptionZh = reviewedDescription(input)!;
    const previous = structuredClone(inputs);
    const { cache, jobs } = staleState(inputs);
    for (const input of inputs) input.install.discovery!.status = 'review-required';
    for (const input of inputs) {
      const stale = rankingEntry(input);
      expect(descriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(webDescriptionDisplayFor(stale), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
    }
    const result = await run(inputs, previous, cache, jobs);
    for (const input of inputs) {
      expect(input.descriptionZh, input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      expect(result.jobs[input.id].status, input.fullName).toBe('review-required');
      expect(cache.has(input.id), input.fullName).toBe(false);
      expect(verifiedDescriptionZh(rankingEntry(input)), input.fullName).toBe(PENDING_DESCRIPTION_ZH);
      if (input.type === 'cordis-plugin') {
        const published = publishDescription(rankingEntry(input));
        expect(published.descriptionStatus?.state, input.fullName).toBe('stale');
        expect(descriptionDisplayFor(published), input.fullName).toContain('核对，未确认最新变化');
        expect(webDescriptionDisplayFor(published), input.fullName).toContain('未确认最新变化');
      } else expect(publishedDescriptionZh(rankingEntry(input))).toBe(PENDING_DESCRIPTION_ZH);
    }
  });

  it('keeps collector and both clients consistent when only unrelated root metadata changes for a verified subpackage', async () => {
    const inputs = (await verifiedSources()).filter(input => input.install.repositoryPath
      && input.install.discovery?.readme);
    expect(inputs.length).toBeGreaterThan(0);
    const previous = structuredClone(inputs);
    const { cache, jobs } = staleState(inputs);
    for (const input of inputs) {
      input.description += ' Updated root-product marketing, unrelated to this selected package.';
      input.descriptionZh = null;
    }
    const result = await run(inputs, previous, cache, jobs);
    for (const input of inputs) {
      const expected = approved.find(row => row.source.fullName === input.fullName)!.expected;
      expect(input.descriptionZh, input.fullName).toBe(expected);
      expect(result.jobs[input.id].status, input.fullName).toBe('complete');
      const published = publishDescription(rankingEntry(input));
      expect(publishedDescriptionZh(published), input.fullName).toBe(expected);
      expect(descriptionDisplayFor(published), input.fullName).toBe(expected);
      expect(webDescriptionDisplayFor(published), input.fullName).toBe(expected);
      expect(withPublishedDescription(published as Parameters<typeof withPublishedDescription>[0]).descriptionZh,
        input.fullName).toBe(expected);
    }
  });

  it('publishes the same approved text and unresolved status in the website and plugin views', async () => {
    const inputs = await verifiedSources(fixture.entries);
    const { cache, jobs } = staleState(inputs);
    const result = await run(inputs, structuredClone(inputs), cache, jobs);
    const document = rankings(inputs);
    const coverage = attachDescriptionCoverage(document, result.jobs);
    expect(coverage.unique).toBe(40);
    expect(coverage.boards.hot.covered).toBe(36);
    expect(coverage.boards.hot.missing).toHaveLength(4);
    for (const entry of document.rankings.hot) {
      const expected = fixture.entries.find(row => row.source.fullName === entry.fullName)!.expected;
      const published = publishDescription(entry);
      const plugin = withPublishedDescription(published as Parameters<typeof withPublishedDescription>[0]);
      const pluginDisplay = descriptionDisplayFor(plugin);
      const webDisplay = webDescriptionDisplayFor(published);
      expect(webDisplay, entry.fullName).toBe(pluginDisplay);
      if (expected) expect(pluginDisplay, entry.fullName).toBe(expected);
      else {
        expect(published.descriptionStatus?.state).toBe('review-required');
        expect(pluginDisplay, entry.fullName).toMatch(/中文简介待复核|待核实后更新|尚未确认|暂缺/);
      }
    }
  });
});
