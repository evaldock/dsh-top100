import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { descriptionFor, descriptionDisplayFor } from '../public/description-presentation.js';
const pending = '中文简介待生成。';
const entry = { descriptionPolicy: 'server-v1', descriptionZh: '读取网页内容并整理研究资料。' };
test('renders the final server text without editorial or semantic overrides', () => {
  assert.equal(descriptionFor(entry), entry.descriptionZh);
  assert.equal(descriptionFor({...entry, descriptionZh:'感谢用户帮助我们测试新的功能。'}),'感谢用户帮助我们测试新的功能。');
  assert.equal(descriptionFor({...entry, descriptionZh:'**读取网页** <script>secret()</script>并整理资料。'}),'读取网页 并整理资料。');
});
test('status, empty content, unknown contract and legacy data cannot borrow stale author prose', () => {
  for (const state of ['pending','review-required','missing-source','retry']) {
    const value = {...entry, descriptionStatus:{state,reason:'服务端待复核'}};
    assert.equal(descriptionFor(value),pending);
    assert.match(descriptionDisplayFor(value), /服务端待复核/);
  }
  for (const value of [{...entry,descriptionZh:''}, {...entry,descriptionZh:null},
    {...entry,descriptionPolicy:undefined},{...entry,descriptionPolicy:'future'}]) {
    assert.equal(descriptionFor({...value,description:'旧的中文说明用于自动管理项目。',readmeSummary:'旧功能介绍。'}),pending);
  }
});
test('website does not fetch or distribute an editorial table', () => {
  assert.equal(existsSync(new URL('../public/reviewed-descriptions.json',import.meta.url)),false);
  for (const file of ['index.html','skills.html','description-presentation.js','description-rules.js']) {
    assert.doesNotMatch(readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8'),/reviewedDescriptions|loadReviewedDescriptions|matchesReviewedDescriptionSource|descriptionQualityIssue/);
  }
});

test('approved stale descriptions retain the date and update qualification before the body', () => {
  const value = { ...entry, descriptionStatus: { state: 'stale', reviewedAt: '2026-09-16', reason: '来源核查中' } };
  assert.equal(descriptionFor(value), entry.descriptionZh);
  assert.equal(descriptionDisplayFor(value), `旧版简介（2026-09-16 核对，未确认最新变化）：${entry.descriptionZh}`);
  // Skills normalizes the body on load and formats again when rendering a row.
  assert.equal(descriptionDisplayFor({ ...value, descriptionZh: descriptionFor(value) }), descriptionDisplayFor(value));
  for (const reviewedAt of [undefined, '', '2026-02-29', '2026-13-01', '2026-09-31', '2026-9-16']) {
    const invalid = { ...entry, descriptionStatus: { state: 'stale', reviewedAt, reason: '来源核查中' } };
    assert.equal(descriptionFor(invalid), pending);
    assert.match(descriptionDisplayFor(invalid), /中文简介待复核/);
    assert.doesNotMatch(descriptionDisplayFor(invalid), /读取网页/);
  }
  for (const descriptionZh of ['', '  ', '<script>old()</script>', pending]) {
    assert.equal(descriptionFor({ ...value, descriptionZh }), pending);
    assert.doesNotMatch(descriptionDisplayFor({ ...value, descriptionZh }), /上次核验/);
  }
});
test('each pending state retains its own accurate label', () => {
  const labels = { pending: '中文简介待生成', 'review-required': '中文简介待复核',
    'missing-source': '中文简介资料不足', retry: '中文简介生成未完成' };
  for (const [state, label] of Object.entries(labels)) {
    assert.equal(descriptionDisplayFor({ ...entry, descriptionStatus: { state, reason: '服务端原因' } }), `${label}：服务端原因`);
  }
});

test('model stale text uses generatedAt and never presents generation as a human review', () => {
  const status = { state: 'stale', origin: 'model', generatedAt: '2026-09-16', reason: '来源待核查' };
  const value = { ...entry, descriptionStatus: status };
  assert.equal(descriptionFor(value), entry.descriptionZh);
  assert.equal(descriptionDisplayFor(value), `旧版简介（2026-09-16 生成，未确认最新变化）：${entry.descriptionZh}`);
  assert.doesNotMatch(descriptionDisplayFor(value), /上次核验/);
  for (const generatedAt of [undefined, '', '2026-02-29', '2026-09-31', '2026-9-16']) {
    const invalid = { ...entry, descriptionStatus: { ...status, generatedAt, reviewedAt: '2026-09-16' } };
    assert.equal(descriptionFor(invalid), pending);
    assert.doesNotMatch(descriptionDisplayFor(invalid), /生成于|上次核验/);
  }
});
