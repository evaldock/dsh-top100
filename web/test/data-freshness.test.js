import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { dataFreshnessMessage, renderDataFreshness } from '../public/data-freshness.js';

const now = Date.parse('2026-09-21T01:30:00Z');
const stale = { generatedAt: '2026-09-18T23:30:00Z', snapshotDate: '2026-09-19' };
const fresh = { generatedAt: '2026-09-20T23:30:00Z', snapshotDate: '2026-09-21' };

test('stale snapshots show their real Beijing date; exactly 36 hours remains within grace period', () => {
  assert.match(dataFreshnessMessage(stale, now), /数据更新延迟，当前展示 2026-09-19 的快照/);
  assert.equal(dataFreshnessMessage(fresh, now), '');
  const metadata = { generatedAt: new Date(now - 36 * 3600000).toISOString() };
  assert.equal(dataFreshnessMessage(metadata, now), '');
  assert.match(dataFreshnessMessage(metadata, now + 1), /数据更新延迟/);
});

test('a new publication time cannot mask an old snapshot; date-only fallback allows the entire Beijing day', () => {
  assert.match(dataFreshnessMessage({ snapshotDate: '2026-09-18', generatedAt: fresh.generatedAt }, now), /2026-09-18/);
  assert.equal(dataFreshnessMessage({ snapshotDate: '2026-09-19' }, Date.parse('2026-09-21T04:00:00Z')), '');
  assert.match(dataFreshnessMessage({ snapshotDate: '2026-09-19' }, Date.parse('2026-09-21T04:00:00.001Z')), /数据更新延迟/);
});

test('missing, invalid and future metadata never fabricates a stale snapshot', () => {
  for (const metadata of [null, {}, { generatedAt: null }, { generatedAt: '' }, { generatedAt: '0' },
    { generatedAt: '2026-02-30T00:00:00Z' },
    { generatedAt: 'bad', snapshotDate: '2026-02-30' },
    { generatedAt: '2026-09-22T00:00:00Z', snapshotDate: '2026-09-22' }]) {
    assert.equal(dataFreshnessMessage(metadata, now), '');
  }
  assert.match(dataFreshnessMessage({ generatedAt: 'bad', snapshotDate: '2026-09-18' }, now), /2026-09-18/);
  assert.match(dataFreshnessMessage({ generatedAt: stale.generatedAt, snapshotDate: 'bad' }, now), /2026-09-19/);
});

test('rendering fresh or failed data clears a prior stale notice', () => {
  const element = { hidden: true, textContent: '' };
  renderDataFreshness(element, stale, now);
  assert.equal(element.hidden, false);
  for (const metadata of [fresh, null]) {
    renderDataFreshness(element, metadata, now);
    assert.equal(element.hidden, true);
    assert.equal(element.textContent, '');
  }
});

for (const page of ['index', 'skills']) {
  const html = readFileSync(new URL(`../public/${page}.html`, import.meta.url), 'utf8');
  const source = html.match(page === 'index'
    ? /async function loadManifestAndHot\(\) \{[\s\S]*?\n      \}/
    : /async function load\(\) \{[\s\S]*?\n      \}/)[0];
  async function loadPage(mode, metadata = stale) {
    const element = { hidden: true, textContent: '' };
    const payload = { ...metadata, rankings: [] };
    const manifest = { ...metadata, schemaVersion: 2, datasets: { hot: { url: '/hot' }, skills: { url: '/skills', count: 0 } } };
    const context = {
      document: { querySelector: () => element },
      renderDataFreshness: (element, metadata) => renderDataFreshness(element, metadata, now),
      MANIFEST_URL: '/manifest', LEGACY_URLS: { hot: '/legacy' }, LEGACY_SKILLS_URL: '/legacy', LEGACY_FULL_URL: '/full',
      fetchJson: async (url) => {
        if (url === '/manifest' && mode === 'legacy') throw Object.assign(new Error('missing'), { status: 404 });
        if (url === '/manifest') return manifest;
        if (mode === 'failure') throw new Error('offline');
        return payload;
      },
      console: { warn() {} }, manifest: null, generatedAt: null,
      skillsCount: {}, allCount: {}, updated: {}, entries: [], hotEntries: [], excludedHotEntryCount: 0, legacyCategoryDefinitions: [],
      formatStars: String, formatTime: String, makeEntries: (value) => value, descriptionFor: () => '',
      updateAllCount() {}, updateCategoryCounts() {}, updateCategoryControls() {}, render() {},
    };
    vm.createContext(context);
    vm.runInContext(`${source}; globalThis.runLoad = ${page === 'index' ? 'loadManifestAndHot' : 'load'};`, context);
    if (mode === 'failure') await assert.rejects(context.runLoad(), /offline/);
    else await context.runLoad();
    return element;
  }
  test(`${page} loads stale notices for manifest and compatibility datasets, with fresh and failed loads hidden`, async () => {
    assert.match(html, /id="data-freshness" role="status" hidden/);
    assert.match(html, /renderDataFreshness\(document.querySelector\("#data-freshness"\), null\)/);
    for (const mode of ['manifest', 'legacy']) {
      assert.match((await loadPage(mode)).textContent, /2026-09-19/);
      assert.equal((await loadPage(mode, fresh)).hidden, true);
    }
    assert.equal((await loadPage('failure')).hidden, true);
  });
}
