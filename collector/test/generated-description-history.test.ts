import { describe, expect, it, vi } from 'vitest';
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingEntry, RankingsDocument } from '../src/rankings.js';
import { prepareDailyDescriptions, runDailyDescriptions, updateDailyDescriptionCache } from '../src/daily-descriptions.js';
import { createGeneratedDescriptionVersion, generatedSourceUnchanged, mergeGeneratedHistory } from '../src/generated-description-history.js';
import { descriptionSourceHash, type DescriptionJob } from '../src/description-jobs.js';
import { selectedReadmeEvidence } from '../src/readme-evidence.js';
import { publishDescription } from '../src/published-description.js';
import { attachDescriptionCoverage } from '../src/board-descriptions.js';
import { toSnapshotSearchEntry } from '../src/search-index.js';
import { descriptionDisplayFor } from '../../plugin/src/shared/description-rules.js';
import type { ZhEntry } from '../src/zh-util.js';
const now=Date.parse('2026-09-17T00:00:00Z'), zh='检索学术论文并导出引用，帮助用户整理研究资料。';
function source(): DshPlugin {
 const s={id:'model-history/papers',fullName:'model-history/papers',name:'papers',type:'cordis-plugin',description:'Search papers.',
 readmeSummary:'Search papers and export citations.',descriptionZh:null,tags:[],topics:[],stars:1,
 install:{method:'pnpm-profile',packageName:'papers',needsConfig:false,discovery:{status:'verified',kind:'package',sourceRevision:'a'.repeat(40),evidence:[]}}} as unknown as DshPlugin;
 s.install.discovery!.readme=selectedReadmeEvidence(s.fullName,'papers',null,'a'.repeat(40),'Full paper search README',s.readmeSummary!);
 return s;
}
function completed(s: DshPlugin): DescriptionJob { return {sourceHash:descriptionSourceHash(s),status:'complete',origin:'model',attempts:1,lastAttemptAt:new Date(now).toISOString(),descriptionZh:zh}; }
function rank(s: DshPlugin): RankingEntry {return {...s,rank:1,categories:[],descriptionZh:s.descriptionZh??'',readmeSummary:s.readmeSummary??undefined} as RankingEntry;}
function doc(s: DshPlugin): RankingsDocument {const r=rank(s); return {generatedAt:new Date(now).toISOString(),snapshotDate:'2026-09-17',rankings:{hot:[r],rising:[r],total:[r]},directories:{skills:[]}} as unknown as RankingsDocument;}
const previous=(s: DshPlugin)=>new Map([[s.id.toLowerCase(),structuredClone(s)]]);

describe('persistent generated description history',()=>{
 it('captures new outputs and survives changed documents, JSON persistence, restart and source recovery with zero extra calls',async()=>{
  const s=source(), cache=new Map<string,ZhEntry>();
  const initial=prepareDailyDescriptions([s],new Map(),cache,{},new Set(),now);
  const worker=vi.fn(async()=>({descriptionZh:zh,tagsZh:[]}));
  await runDailyDescriptions([s],initial,{limit:1,concurrency:1,worker,now:()=>now});
  expect(s.descriptionHistory).toHaveLength(1);expect(initial.jobs[s.id].generatedAt).toBe(new Date(now).toISOString());
  const old=structuredClone(s), oldId=s.descriptionHistory![0].id;
  // Same short excerpt but a changed complete document still requires review.
  s.install.discovery!.readme!.documentSha256='b'.repeat(64);
  expect(s.descriptionHistory![0].id).toBe(oldId);
  let plan=prepareDailyDescriptions([s],previous(old),cache,initial.jobs,new Set(),now+86400000);
  expect(plan.ready).toHaveLength(0);expect(plan.jobs[s.id].status).toBe('review-required');
  expect(s.descriptionZh).toBe('中文简介待生成。');
  const document=doc(s), coverage=attachDescriptionCoverage(document,plan.jobs);
  expect(coverage.boards.hot).toMatchObject({covered:0,stale:1,available:1});
  const published=publishDescription(document.rankings.hot[0]);
  expect(published.descriptionStatus).toMatchObject({state:'stale',origin:'model',generatedAt:'2026-09-17'});
  expect(descriptionDisplayFor(toSnapshotSearchEntry(published))).toContain('2026-09-17 生成');
  expect(descriptionDisplayFor(published)).not.toContain('核验');
  updateDailyDescriptionCache([s],cache,plan.jobs);
  expect(cache.get(s.id)?.descriptionHistory).toHaveLength(1);
  const restarted=structuredClone(s);delete restarted.descriptionHistory;
  plan=prepareDailyDescriptions([restarted],new Map(),new Map(JSON.parse(JSON.stringify([...cache]))),JSON.parse(JSON.stringify(plan.jobs)),new Set(),now+2*86400000);
  expect(restarted.descriptionHistory).toHaveLength(1);expect(plan.ready).toHaveLength(0);
  restarted.install=structuredClone(old.install);
  const restored=prepareDailyDescriptions([restarted],previous(s),cache,plan.jobs,new Set(),now+3*86400000);
  expect(restored.ready).toHaveLength(0);expect(restored.jobs[s.id]).toMatchObject({status:'complete',origin:'model',generatedAt:new Date(now).toISOString()});
  expect(publishDescription(rank(restarted)).descriptionStatus).toBeUndefined();expect(worker).toHaveBeenCalledTimes(1);
 });
 it('migrates only timestamped model jobs bound to real source evidence',()=>{
  const s=source(),job=completed(s),version=createGeneratedDescriptionVersion(s,job)!;
  expect(version.descriptionZh).toBe(zh);expect(generatedSourceUnchanged(s,version)).toBe(true);
  for(const patch of [{lastAttemptAt:undefined},{sourceHash:'other'},{origin:'legacy' as const},{reviewLocked:true}])expect(createGeneratedDescriptionVersion(s,{...job,...patch})).toBeNull();
  s.install.discovery!.status='review-required';expect(createGeneratedDescriptionVersion(s,job)).toBeNull();
 });
 it.each(['package','path','invalid','withdrawn','damaged'])('does not display %s old content',condition=>{
  const s=source();s.descriptionHistory=[createGeneratedDescriptionVersion(s,completed(s))!];
  if(condition==='package')s.install.packageName='other';
  if(condition==='path')s.install.repositoryPath='other';
  if(condition==='invalid')s.install.discovery!.evidence.push('selected-package-invalid:other');
  if(condition==='withdrawn')s.descriptionHistoryHold='已确认旧简介错误。';
  if(condition==='damaged')s.descriptionHistory[0].descriptionZh='无来源的伪造简介内容，不能恢复展示。';
  s.descriptionZh=zh;
  expect(publishDescription(rank(s)).descriptionZh).toBe('中文简介待生成。');
 });
 it('retains a transient read failure as dated old text and never approves it as current',()=>{
  const s=source();s.descriptionHistory=[createGeneratedDescriptionVersion(s,completed(s))!];
  s.install.discovery!.status='review-required';s.install.discovery!.evidence.push('board-source-unavailable:timeout');
  expect(publishDescription(rank(s)).descriptionStatus?.state).toBe('stale');
 });
 it('bounds history without changing generation dates or mutating stored source proof',()=>{
  const s=source();const values=Array.from({length:5},(_,i)=>createGeneratedDescriptionVersion(s,{...completed(s),lastAttemptAt:new Date(now+i*86400000).toISOString()})!);
  expect(mergeGeneratedHistory(values)).toHaveLength(3);expect(mergeGeneratedHistory(values)[0].id).toBe(values[4].id);
 });
});

it('requires an exact source-difference decision, preserves retry backoff and replaces only a valid new candidate',async()=>{
 const {publicationDescriptionSourceHash}=await import('../src/publication-description-review.js');
 const s=source(),old=structuredClone(s);s.descriptionHistory=[createGeneratedDescriptionVersion(s,completed(s))!];old.descriptionHistory=structuredClone(s.descriptionHistory);
 s.description='Search papers and patents.';s.readmeSummary='Search papers and patents with citations.';
 s.install.discovery!.readme=selectedReadmeEvidence(s.fullName,'papers',null,'a'.repeat(40),'New paper and patent docs',s.readmeSummary);
 const decision={sourceProofHash:publicationDescriptionSourceHash(rank(s)),decision:'regenerate' as const,reviewedAt:new Date(now).toISOString(),reason:'旧文遗漏已核对的新能力，按当前资料生成候选。'};
 let jobs={[s.id]:{...completed(old),descriptionHistory:s.descriptionHistory,sourceChangeReview:{...decision,sourceProofHash:'wrong'}}};
 expect(prepareDailyDescriptions([s],previous(old),new Map(),jobs,new Set(),now).ready).toHaveLength(0);
 jobs[s.id].sourceChangeReview=decision;
 let plan=prepareDailyDescriptions([s],previous(old),new Map(),jobs,new Set(),now);
 expect(plan.ready).toHaveLength(1);
 const fail=vi.fn(async()=>null);await runDailyDescriptions([s],plan,{limit:1,concurrency:1,worker:fail,now:()=>now});
 const nextAttempt=plan.jobs[s.id].nextAttemptAt;
 expect(publishDescription(rank(s)).descriptionZh).toBe('中文简介待生成。');
 plan=prepareDailyDescriptions([s],previous(s),new Map(),JSON.parse(JSON.stringify(plan.jobs)),new Set(),now+1000);
 expect(plan.ready).toHaveLength(0);expect(plan.jobs[s.id].attempts).toBe(1);expect(plan.jobs[s.id].nextAttemptAt).toBe(nextAttempt);
 plan=prepareDailyDescriptions([s],previous(s),new Map(),plan.jobs,new Set(),Date.parse(nextAttempt!));
 expect(plan.ready).toHaveLength(1);
 const text='检索学术论文和专利，整理带引用的研究资料。';
 await runDailyDescriptions([s],plan,{limit:1,concurrency:1,worker:async()=>({descriptionZh:text,tagsZh:[]}),now:()=>Date.parse(nextAttempt!)});
 expect(s.descriptionHistory).toHaveLength(2);expect(s.descriptionHistory![0].descriptionZh).toBe(text);
 expect(s.descriptionHistoryHold).toBeUndefined();expect(publishDescription(rank(s)).descriptionZh).toBe(text);
});

it('reuses an explicitly reviewed document change without falling through to the old cache invalidation',async()=>{
 const {publicationDescriptionSourceHash}=await import('../src/publication-description-review.js');
 const old=source(),s=structuredClone(old),job=completed(old);old.descriptionZh=zh;
 s.descriptionHistory=[createGeneratedDescriptionVersion(old,job)!];s.description='Updated document description.';
 const review={sourceProofHash:publicationDescriptionSourceHash(rank(s)),decision:'reuse' as const,reviewedAt:new Date(now).toISOString(),reason:'已核对原中文仍准确。'};
 const cache=new Map([[s.id,{descriptionZh:zh,tagsZh:[],sourceHash:job.sourceHash}]]);
 const plan=prepareDailyDescriptions([s],previous(old),cache,{[s.id]:{...job,sourceChangeReview:review}},new Set(),now);
 expect(plan.ready).toHaveLength(0);expect(plan.jobs[s.id]).toMatchObject({status:'complete',origin:'model',attempts:1});
 expect(s.descriptionZh).toBe(zh);
});

it('accepts an explicit full-document regeneration review even if the excerpt is unchanged',async()=>{
 const {publicationDescriptionSourceHash}=await import('../src/publication-description-review.js');
 const s=source(),old=structuredClone(s),job=completed(s);s.descriptionHistory=[createGeneratedDescriptionVersion(s,job)!];
 s.install.discovery!.readme!.documentSha256='b'.repeat(64);
 const plan=prepareDailyDescriptions([s],previous(old),new Map(),{[s.id]:{...job,sourceChangeReview:{
  sourceProofHash:publicationDescriptionSourceHash(rank(s)),decision:'regenerate',reviewedAt:new Date(now).toISOString(),reason:'复核确认需替换旧结果。'}}},new Set(),now);
 expect(plan.ready).toHaveLength(1);expect(plan.jobs[s.id].attempts).toBe(1);
});

it('recovers persisted regeneration success after a crash without clearing a later withdrawal',async()=>{
 const {publicationDescriptionSourceHash}=await import('../src/publication-description-review.js');
 const s=source(),old=structuredClone(s),job=completed(s);s.descriptionHistory=[createGeneratedDescriptionVersion(s,job)!];
 s.install.discovery!.readme!.documentSha256='c'.repeat(64);
 const jobs={[s.id]:{...job,sourceChangeReview:{sourceProofHash:publicationDescriptionSourceHash(rank(s)),
  decision:'regenerate' as const,reviewedAt:new Date(now).toISOString(),reason:'已确认旧文遗漏，需替换。'}}};
 const plan=prepareDailyDescriptions([s],previous(old),new Map(),jobs,new Set(),now);
 const beforeSuccess=structuredClone(s),cache=new Map<string,ZhEntry>();
 updateDailyDescriptionCache([beforeSuccess],cache,plan.jobs);
 const newText='检索学术论文、导出引用，并整理个人研究资料库。';
 await runDailyDescriptions([s],plan,{limit:1,concurrency:1,worker:async()=>({descriptionZh:newText,tagsZh:[]}),now:()=>now+1000});
 const persisted=JSON.parse(JSON.stringify(plan.jobs));
 const restart=structuredClone(beforeSuccess);
 const recovered=prepareDailyDescriptions([restart],previous(beforeSuccess),cache,persisted,new Set(),now+2000);
 expect(recovered.ready).toHaveLength(0);expect(recovered.jobs[s.id].status).toBe('complete');
 expect(restart.descriptionHistoryHold).toBeUndefined();expect(publishDescription(rank(restart)).descriptionZh).toBe(newText);
 for(const later of [Object.assign(structuredClone(s),{descriptionHistoryHold:beforeSuccess.descriptionHistoryHold}),
  Object.assign(structuredClone(beforeSuccess),{descriptionHistoryHold:'后续核对发现新错误。'})]) {
  const held=prepareDailyDescriptions([later],new Map(),cache,persisted,new Set(),now+3000);
  expect(held.ready).toHaveLength(0);expect(held.jobs[s.id].status).toBe('review-required');
  expect(publishDescription(rank(later)).descriptionZh).toBe('中文简介待生成。');
 }
});
