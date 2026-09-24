/** Read-only source preflight. Never installs packages or executes repository code. */
import { resolveInstallSpec } from "../../plugin/src/install/install-spec.js";
import { verifyInstallSpec, InstallVerificationError } from "../../plugin/src/install/install-verify.js";
import { catalogSourceStatus, installSourceKey, SOURCE_ASSESSMENT_TTL_MS, type AssessedCatalogEntry } from "../../plugin/src/shared/install-assessment.js";
import type { InstallSourceAssessment, RankingEntry } from "../../plugin/src/shared/types.js";
import { runPool } from "./pool.js";

export type AssessmentCache = Record<string, InstallSourceAssessment>;
export async function assessInstallSource(entry: AssessedCatalogEntry): Promise<InstallSourceAssessment | null> {
  if (entry.type === "skill") return null; // Skill file verification remains in its own preflight.
  const spec = resolveInstallSpec(entry as RankingEntry);
  if (!spec) return null;
  const base = { sourceKey: installSourceKey(entry), checkedAt: new Date().toISOString() };
  try {
    const result = await verifyInstallSpec(spec, { expectedRepository: entry.fullName,
      expectedPackageName: typeof (entry.install?.packageName ?? entry.installPackageName) === "string"
        ? String(entry.install?.packageName ?? entry.installPackageName) : undefined,
      expectedRepositoryPath: entry.install?.repositoryPath ?? entry.installRepositoryPath,
      forceRefresh: true, signal: AbortSignal.timeout(25_000) });
    if (result.repositoryIdentity !== "matched" || !result.target || !result.integrity) return { ...base, status: "unavailable", reason: "包已找到，但缺少可核对的仓库身份或精确来源记录。" };
    return { ...base, status: "verified", resolvedTarget: result.target, integrity: result.integrity ?? undefined,
      reason: "已核对清单元数据中的来源身份、Bundle 声明及精确版本；尚未验证发布归档、安装、宿主兼容或业务功能。" };
  } catch (error) {
    // Transport/rate-limit failures must never turn into an 'uninstallable' claim.
    const invalid = error instanceof InstallVerificationError && (error.status === 404
      || error.reason === "invalid-manifest" || (error.fatal && error.status === null));
    return { ...base, status: invalid ? "invalid" : "unavailable", reason: invalid
      ? `安装信息检查未通过：${error instanceof InstallVerificationError ? error.message.slice(0, 300) : "安装包的声明或仓库归属不符合要求。"}`
      : "本次未能完成来源预检，可能为网络、限流或资料缺失；可稍后重试。" };
  }
}

export async function refreshInstallAssessments<T extends AssessedCatalogEntry & { stars: number }>(
  entries: T[], cache: AssessmentCache, options: { limit: number; priority?: Set<string>; now?: number },
): Promise<{ checked: number; cache: AssessmentCache }> {
  const now = options.now ?? Date.now();
  for (const entry of entries) {
    const previous = cache[entry.fullName.toLowerCase()];
    if (previous?.sourceKey === installSourceKey(entry)) {
      if (entry.install) entry.install.assessment = previous;
      else entry.installAssessment = previous;
    } else {
      if (entry.install?.assessment?.sourceKey !== installSourceKey(entry) && entry.install) delete entry.install.assessment;
      if (entry.installAssessment?.sourceKey !== installSourceKey(entry)) delete entry.installAssessment;
    }
  }
  const pending = entries.filter(entry => {
    if (entry.type === "skill") return false;
    const status = catalogSourceStatus(entry, "web", now);
    // Retry unavailable results after a day; successful/permanent failures expire in a week.
    const previous = entry.install?.assessment ?? entry.installAssessment;
    const age = previous ? now - Date.parse(previous.checkedAt) : NaN;
    return status === "identified" || status === "stale"
      || (status === "invalid" && (!Number.isFinite(age) || age < 0 || age > SOURCE_ASSESSMENT_TTL_MS))
      || (status === "unavailable" && previous && age >= 86_400_000);
  }).sort((a, b) => Number(options.priority?.has(b.fullName.toLowerCase())) - Number(options.priority?.has(a.fullName.toLowerCase())) || b.stars - a.stars).slice(0, options.limit);
  await runPool(pending, async entry => {
    const result = await assessInstallSource(entry);
    if (result) {
      cache[entry.fullName.toLowerCase()] = result;
      if (entry.install) entry.install.assessment = result;
      else entry.installAssessment = result;
    }
  }, 4);
  return { checked: pending.length, cache };
}
