import { describe, expect, it } from 'vitest';
import { selectedReadmeEvidence, hasSelectedReadmeEvidence } from '../src/readme-evidence.js';
import { matchingEditorialHold, sameDescriptionSource } from '../src/content-source.js';
import { summarizeReadme } from '../src/summary.js';
import { prepareDailyDescriptions } from '../src/daily-descriptions.js';
import { bindDailySourceJob } from '../src/daily-model-scope.js';
import { reviewedDescription } from '../src/editorial.js';
import reviews from '../config/reviewed-descriptions.json';
import type { DshPlugin } from '@dsh-top100/schema';

const document = '# dsh-selected\n\nSearch project files and organize search results in the sidebar.';
const summary = summarizeReadme(document);
function source(): DshPlugin {
 return { id:'a/project',fullName:'a/project',name:'project',type:'cordis-plugin',description:'Root desktop application',
  readmeSummary:summary,descriptionZh:null,topics:[],tags:[],stars:1,
  install:{method:'pnpm-profile',needsConfig:false,packageName:'dsh-selected',repositoryPath:'packages/selected',
   discovery:{status:'verified',kind:'client',evidence:[],checkedAt:'2026-09-15',policyVersion:6,sourceRevision:'revision',
    readme:selectedReadmeEvidence('a/project','dsh-selected','packages/selected','revision',document,summary)}}} as DshPlugin;
}
describe('selected README provenance',()=>{
 it('accepts a real selected README after the package heading disappears from the summary',()=>{
  const s=source(); expect(summary).not.toContain('dsh-selected');
  expect(hasSelectedReadmeEvidence(s)).toBe(true); expect(matchingEditorialHold(s)).toBeNull();
  delete s.install.discovery!.readme; expect(matchingEditorialHold(s)).not.toBeNull();
 });
 it.each(['path','package','repository','summary','revision','documentHash'])('rejects copied or changed %s evidence',kind=>{
  const s=source();
  if(kind==='path')s.install.discovery!.readme!.path='README.md';
  if(kind==='package')s.install.packageName='dsh-other';
  if(kind==='repository')s.fullName='b/project';
  if(kind==='summary')s.readmeSummary+=' New functional claim.';
  if(kind==='revision')s.install.discovery!.sourceRevision='new';
  if(kind==='documentHash')s.install.discovery!.readme!.documentSha256='';
  expect(hasSelectedReadmeEvidence(s)).toBe(false);expect(matchingEditorialHold(s)).not.toBeNull();
 });
 it('keeps same-package Chinese and does not enqueue paid work for root marketing changes',()=>{
  const old=source(); old.descriptionZh='搜索项目文件并在侧边栏整理检索结果。';
  const current=source();current.description='Updated desktop marketing';
  expect(sameDescriptionSource(current,old)).toBe(true);
  const previous=new Map([[old.id,old]]);
  const plan=prepareDailyDescriptions([current],previous,new Map(),{},new Set(),Date.now());
  expect(current.descriptionZh).toBe(old.descriptionZh); expect(plan.ready).toHaveLength(0);
  expect(bindDailySourceJob(current,previous,undefined,{})).toBe(false);
  current.readmeSummary+=' Delete files.';expect(sameDescriptionSource(current,old)).toBe(false);
 });
 it('reuses a scoped fixed review across root metadata changes only with document proof',()=>{
  const id='anywhere-labs/dsh-desktop',r=reviews[id]; const s=source();
  s.fullName=id;s.description='New root marketing';s.readmeSummary=r.sourceReadme;
  s.install.packageName=r.sourceInstall.packageName;s.install.repositoryPath=r.sourceInstall.repositoryPath;
  s.install.discovery!.readme=selectedReadmeEvidence(id,s.install.packageName,s.install.repositoryPath,'revision','original document',r.sourceReadme);
  expect(reviewedDescription(s)).not.toBe(r.descriptionZh);
  s.install.discovery!.readme!.documentSha256 = r.sourceDocumentHashes[0];
  expect(reviewedDescription(s)).toBe(r.descriptionZh);
  delete s.install.discovery!.readme;expect(reviewedDescription(s)).toBe('中文简介待生成。');
 });
});
