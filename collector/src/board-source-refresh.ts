import { refreshCachedInstallEvidence } from "./install-cache.js";
import { supplementInstallDocument } from "./install-document.js";
/** Read-only, bounded source refresh for today's two boards, before paid work. */
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument } from './rankings.js';
import { boardDescriptionScope, hasPublishedChinese } from './board-descriptions.js';
import { detectPlugin, detectNeedsConfig, DISCOVERY_POLICY_VERSION, ReviewedTargetValidationError } from './detect.js';
import { githubFetch, fetchRepoRoot, fetchRawFile } from './github.js';
import { summarizeSelectedReadme } from './reviewed-summary.js';
import { selectedReadmeEvidence, hasSelectedReadmeEvidence } from './readme-evidence.js';
import { reviewFunctionChanges } from './source-change-review.js';
import { applyFunctionEvidenceCheck } from './reviewed-evidence-state.js';
import { PENDING_DESCRIPTION_ZH } from './description-rules.js';
import { readPackageSourceFacts, hasPackageSourceFacts } from './package-source-facts.js';
import { beginSourceRecovery, completeSourceRecovery, recoveryCandidate, recoveryKey, sourceRecoveryDue,
  type SourceRecoveryState } from './source-recovery.js';
import { hasContentEvidence, matchingEditorialHold } from './content-source.js';

export interface SourceRefreshResult {
  status: 'verified' | 'review-required' | 'excluded';
  source?: DshPlugin;
  reason: string;
  content?: 'ready' | 'missing-source' | 'review-required';
}
function held(source: DshPlugin, now: number, reason: string, invalid = false): SourceRefreshResult {
  const old = source.install.discovery;
  return { status: 'review-required', reason, source: { ...source,
    ...(invalid ? { descriptionZh: PENDING_DESCRIPTION_ZH, categories: [] } : {}),
    install: { ...source.install, ...(invalid ? { commands: undefined, commandSource: undefined, assessment: undefined } : {}),
      discovery: { ...(old ?? { kind: 'host', policyVersion: DISCOVERY_POLICY_VERSION, checkedAt: source.lastCheckedAt }),
        status: 'review-required', evidence: [...new Set([...(old?.evidence ?? []),
          `${invalid ? 'selected-package-invalid:' : 'board-source-unavailable:'}${reason}`])] } } } };
}

/** Pin one current commit for the manifest, README and reviewed source files.
 * No package installation/execution, root README substitution or LLM calls.
 */
export async function refreshBoardSource(source: DshPlugin, now: number): Promise<SourceRefreshResult> {
  let revision: string | undefined;
  try {
    const repo = await githubFetch<{ private?: boolean; visibility?: string; archived?: boolean; fork?: boolean; default_branch: string; full_name: string }>(`/repos/${source.fullName}`);
    if (repo.private || repo.visibility === 'private' || repo.archived || repo.fork) {
      return { status: 'excluded', reason: 'Repository no longer eligible for public collection.' };
    }
    if (repo.full_name.toLowerCase() !== source.fullName.toLowerCase()) return held(source, now, '仓库身份发生变化，待重新确认所选包。');
    const head = await githubFetch<{ sha: string }>(`/repos/${source.fullName}/commits/${encodeURIComponent(repo.default_branch)}`);
    if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error('Missing commit');
    revision = head.sha;
    const root = await fetchRepoRoot(source.fullName, head.sha);
    const detection = await detectPlugin(source.fullName, root, head.sha, { primaryOnly: true, reviewedTarget: {
      packageName: source.install.packageName!, repositoryPath: source.install.repositoryPath ?? null,
    } });
    const path = detection.pluginPath ? `${detection.pluginPath}/README.md` : 'README.md';
    const document = await fetchRawFile(source.fullName, path, head.sha);
    const summary = document === null ? null : summarizeSelectedReadme(source.fullName, source.install, document);
    const facts = document === null ? await readPackageSourceFacts(source, head.sha) : null;
    const checkedAt = new Date(now).toISOString();
    const installIdentity = { fullName: source.fullName, ...source.install };
    const install = await supplementInstallDocument(installIdentity, refreshCachedInstallEvidence(installIdentity,
      { commands: source.install.commands ?? [], source: source.install.commandSource ?? 'template' }, document).installParsed, head.sha);
    // Commands remain an independent assessment. Do not derive a sibling package
    // install command from examples in a package README during evidence refresh.
    let refreshed: DshPlugin = { ...source, readmeSummary: summary ?? facts?.summary ?? null, lastCheckedAt: checkedAt,
      install: { ...source.install, commands: install.commands.length ? install.commands : undefined,
        commandSource: install.source === 'template' ? undefined : install.source, needsConfig: document === null ? source.install.needsConfig : detectNeedsConfig(document),
        discovery: { status: 'verified', kind: detection.kind!, policyVersion: DISCOVERY_POLICY_VERSION,
          checkedAt, sourceRevision: head.sha, evidence: detection.evidence,
          ...(facts ? { sourceFiles: facts.proof } : {}),
          ...(document !== null && summary !== null ? { readme: selectedReadmeEvidence(source.fullName,
            detection.packageName, detection.pluginPath, head.sha, document, summary) } : {}) } } };
    const check = await reviewFunctionChanges(source.fullName, refreshed.install,
      path => fetchRawFile(source.fullName, path, head.sha),
      (path, baseline) => fetchRawFile(source.fullName, path, baseline));
    if (check.sourceReview) check.sourceReview.sourceRevision = head.sha;
    refreshed = applyFunctionEvidenceCheck(refreshed, source, check);
    const content = check.status !== 'not-required' && check.status !== 'matched' ? 'review-required'
      : summary || facts || check.status === 'matched' ? 'ready' : 'missing-source';
    return { status: refreshed.install.discovery!.status, source: refreshed, content,
      reason: content === 'review-required' ? check.reason : content === 'missing-source'
        ? 'Selected package identity verified; functional documentation is still missing.' : 'Selected package and scoped source refreshed.' };
  } catch (error) {
    if (!(error instanceof ReviewedTargetValidationError)) return held(source, now, '本轮来源读取未完成，保留历史证据，后续重试。');
    const result = held(source, now, '当前选中包未通过插件声明或包身份核验，需纠正收录对象。', true);
    if (error.reason === 'invalid-declaration' && revision) {
      const evidence = result.source!.install.discovery!;
      evidence.checkedAt = new Date(now).toISOString(); evidence.sourceRevision = revision;
      evidence.evidence.push(`selected-package-ineligible:${revision}`);
    }
    return result;
  }
}

export async function refreshBoardSources(sources: DshPlugin[], rankings: () => RankingsDocument,
  options: { enabled: boolean; now: number; refresh?: typeof refreshBoardSource; limit?: number;
    recovery?: SourceRecoveryState; persistRecovery?: (state: SourceRecoveryState) => void }) {
  const report: { fullName: string; status: string; reason: string; content?: string }[] = [];
  if (!options.enabled) return report;
  const limit = options.limit ?? 200;
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new Error('Invalid board source refresh limit');
  const attempted = new Set<string>();
  const recovery = options.recovery ?? { schemaVersion: 1, entries: {} };
  const currentKeys = new Set(sources.map(recoveryKey));
  for (const key of Object.keys(recovery.entries)) if (!currentKeys.has(key)) delete recovery.entries[key];
  // Normal collection may already have repaired the source. Do not retain an
  // obsolete incident until the old retry deadline after a fresh valid check.
  for (const source of sources) {
    const old = recovery.entries[recoveryKey(source)];
    if (old && source.install.discovery?.status === 'verified'
      && Date.parse(source.install.discovery.checkedAt) > Date.parse(old.checkedAt)
      && hasContentEvidence(source) && !matchingEditorialHold(source)) delete recovery.entries[recoveryKey(source)];
  }
  options.persistRecovery?.(recovery);
  // A confirmed quarantine is absent from boards. Reserve a small bounded lane
  // so it still has a route back, without turning this into a catalog-wide run.
  const initialScope = boardDescriptionScope(rankings());
  const offBoard = sources.filter(source => source.type === 'cordis-plugin' && !!source.install.packageName
    && !initialScope.has(recoveryKey(source)) && recoveryCandidate(source, recovery)
    && sourceRecoveryDue(source, recovery, options.now))
    .sort((a, b) => (recovery.entries[recoveryKey(a)]?.checkedAt ?? '').localeCompare(recovery.entries[recoveryKey(b)]?.checkedAt ?? '')
      || a.fullName.localeCompare(b.fullName)).slice(0, Math.min(20, limit));
  const refreshOne = async (source: DshPlugin) => {
    attempted.add(recoveryKey(source));
    beginSourceRecovery(source, recovery, options.now); options.persistRecovery?.(recovery);
    let result: SourceRefreshResult;
    try { result = await (options.refresh ?? refreshBoardSource)(source, options.now); }
    catch { result = held(source, options.now, '本轮来源读取未完成，保留历史证据，后续重试。'); }
    const index = sources.indexOf(source);
    if (result.status === 'excluded') sources.splice(index, 1);
    else if (result.source) sources[index] = result.source;
    completeSourceRecovery(source, recovery, result); options.persistRecovery?.(recovery);
    report.push({ fullName: result.status === 'excluded' ? '[excluded repository]' : source.fullName,
      status: result.status, reason: result.reason, ...(result.content ? { content: result.content } : {}) });
  };
  // Recovery is serial; board checks below still use at most three readers.
  for (const source of offBoard) await refreshOne(source);
  // Exclusions can admit new board entries. Recompute within the same total cap.
  while (attempted.size < limit) {
    const preview = rankings(), scope = boardDescriptionScope(preview);
    const missing = new Set([...preview.rankings.hot, ...preview.rankings.rising]
      .filter(entry => !hasPublishedChinese(entry)).map(entry => entry.fullName.toLowerCase()));
    const tasks = sources.filter(source => source.type === 'cordis-plugin' && !!source.install.packageName
      && scope.has(source.fullName.toLowerCase()) && !attempted.has(source.fullName.toLowerCase())
      && sourceRecoveryDue(source, recovery, options.now)
      && (missing.has(source.fullName.toLowerCase()) || source.install.discovery?.status !== 'verified'
        || source.install.discovery.kind === 'host'
        || !!source.install.repositoryPath && !!source.readmeSummary && !hasSelectedReadmeEvidence(source) && !hasPackageSourceFacts(source)))
      .slice(0, limit - attempted.size);
    if (!tasks.length) break;
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => {
      while (next < tasks.length) {
        await refreshOne(tasks[next++]);
      }
    }));
  }
  return report;
}
