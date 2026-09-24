import { describe, expect, it } from 'vitest';
import { descriptionFor, descriptionDisplayFor, PENDING_DESCRIPTION_ZH } from '../src/shared/description-rules.js';
import { withPublishedDescription } from '../src/shared/descriptions.js';
import { parseRankingSearchDocument, parseRankingsDocument, filterCatalog } from '../src/host/catalog.js';
import type { RankingEntry } from '../src/shared/types.js';
const current = { fullName:'nexu-io/open-design', name:'open-design', rank:1,
  descriptionPolicy:'server-v1', descriptionZh:'服务端新修订的简介：读取网页并整理研究资料。',
  description:'过期的中文描述包含已撤回的功能。', tags:[],topics:[],categories:[] } as RankingEntry;
const options = {view:'total' as const, category:null,query:'',offset:0,limit:10,installed:{}};

describe('server-owned published descriptions', () => {
  it('uses arbitrary server revisions for previously reviewed identities', () => {
    expect(withPublishedDescription(current).descriptionZh).toBe(current.descriptionZh);
    expect(descriptionFor({...current,descriptionZh:'感谢使用此工具，它可以读取网页并保存资料。'})).toContain('感谢使用');
    expect(current.description).toContain('过期');
  });
  it.each(['pending','review-required','missing-source','retry'] as const)('never restores withheld %s prose', state => {
    const entry={...current,descriptionStatus:{state,reason:'正在确认所选插件的功能资料。'}};
    expect(descriptionFor(entry)).toBe(PENDING_DESCRIPTION_ZH);
    expect(descriptionDisplayFor(entry)).toContain(entry.descriptionStatus.reason);
  });
  it('preserves approved stale text and dated qualification through full, compact and filtered catalogs', () => {
    const row = { ...current, descriptionStatus: { state: 'stale' as const, reviewedAt: '2026-09-16', reason: '来源核查中' } };
    expect(descriptionFor(row)).toBe(current.descriptionZh);
    expect(descriptionDisplayFor(row)).toBe(`旧版简介（2026-09-16 核对，未确认最新变化）：${current.descriptionZh}`);
    const payload = { schemaVersion: 2, generatedAt: '2026-09-17T00:00:00Z', snapshotDate: '2026-09-17' };
    for (const doc of [parseRankingSearchDocument(JSON.stringify({ ...payload, rankings: [row] })),
      parseRankingsDocument(JSON.stringify({ ...payload, rankings: { hot: [row], rising: [row], total: [row] } }))]) {
      const parsed = filterCatalog(doc, options).items[0];
      expect(parsed.descriptionStatus).toEqual(row.descriptionStatus);
      expect(descriptionDisplayFor(parsed)).toBe(descriptionDisplayFor(row));
      const searched = filterCatalog(doc, { ...options, query: '读取网页' }).items[0];
      expect(descriptionDisplayFor(searched)).toContain('2026-09-16 核对');
    }
  });
  it('keeps model generation dates distinct from reviewed dates in full and compact catalogs', () => {
    const row = { ...current, descriptionStatus: { state: 'stale' as const, origin: 'model' as const,
      generatedAt: '2026-09-16', reason: '来源变化待核查' } };
    const expected = `旧版简介（2026-09-16 生成，未确认最新变化）：${current.descriptionZh}`;
    expect(descriptionFor(row)).toBe(current.descriptionZh);
    expect(descriptionDisplayFor(row)).toBe(expected);
    const payload = { schemaVersion: 2, generatedAt: '2026-09-17T00:00:00Z', snapshotDate: '2026-09-17' };
    for (const doc of [parseRankingSearchDocument(JSON.stringify({ ...payload, rankings: [row] })),
      parseRankingsDocument(JSON.stringify({ ...payload, rankings: { hot: [row], total: [row] } }))]) {
      const parsed = filterCatalog(doc, options).items[0];
      expect(parsed.descriptionStatus).toEqual(row.descriptionStatus);
      expect(descriptionDisplayFor(parsed)).toBe(expected);
      expect(descriptionDisplayFor(parsed)).not.toContain('核验');
    }
    for (const generatedAt of [undefined, '', '2026-02-29', '2026-09-31', '2026-9-16', '2026-09-16T00:00:00Z']) {
      const invalid = { ...row, descriptionStatus: { ...row.descriptionStatus, generatedAt, reviewedAt: '2026-09-16' } };
      expect(descriptionFor(invalid)).toBe(PENDING_DESCRIPTION_ZH);
      expect(descriptionDisplayFor(invalid)).not.toContain('上次核验');
    }
    for (const descriptionZh of ['', '  ', PENDING_DESCRIPTION_ZH]) {
      expect(descriptionDisplayFor({ ...row, descriptionZh })).not.toContain('生成于');
    }
  });
  it('rejects invalid stale dates and empty or placeholder bodies rather than showing undated old text', () => {
    for (const reviewedAt of [undefined, '', '2026-02-29', '2026-13-01', '2026-09-31', '2026-9-16', '2026-09-16T00:00:00Z']) {
      const row = { ...current, descriptionStatus: { state: 'stale' as const, reviewedAt, reason: '等待来源核查' } };
      expect(descriptionFor(row)).toBe(PENDING_DESCRIPTION_ZH);
      expect(descriptionDisplayFor(row)).toContain('中文简介待复核');
      expect(descriptionDisplayFor(row)).not.toContain(current.descriptionZh);
      const doc = parseRankingSearchDocument(JSON.stringify({ schemaVersion: 2, rankings: [row] }));
      expect(doc.rankings.total[0].descriptionStatus?.state).toBe('review-required');
    }
    for (const descriptionZh of ['', '  ', '<script>old()</script>', PENDING_DESCRIPTION_ZH]) {
      const row = { ...current, descriptionZh, descriptionStatus: { state: 'stale' as const, reviewedAt: '2024-02-29', reason: '核查中' } };
      expect(descriptionFor(row)).toBe(PENDING_DESCRIPTION_ZH);
      expect(descriptionDisplayFor(row)).not.toContain('上次核验');
    }
  });
  it('treats missing, empty, unknown-contract and legacy text conservatively in full and compact catalogs', () => {
    for(const row of [{...current,descriptionZh:''},{...current,descriptionZh:undefined},
      {...current,descriptionPolicy:undefined},{...current,descriptionPolicy:'future'},
      {...current,descriptionStatus:null},{...current,descriptionStatus:{state:['stale'],reason:'bad'}},
      {...current,descriptionStatus:{state:'stale',origin:'unknown',reviewedAt:'2026-09-16',reason:'bad'}},
      {...current,descriptionStatus:{state:'unexpected',reason:'bad'}}]) {
      const payload={schemaVersion:2,generatedAt:'2026-09-16T00:00:00Z',snapshotDate:'2026-09-16'};
      for(const doc of [parseRankingSearchDocument(JSON.stringify({...payload,rankings:[row]})),
        parseRankingsDocument(JSON.stringify({...payload,rankings:{total:[row]}}))]) {
        expect(filterCatalog(doc,options).items[0].descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
      }
    }
  });
});
