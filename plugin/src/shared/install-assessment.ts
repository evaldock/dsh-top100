import { resolveCatalogInstallTarget, type CatalogInstallSource } from "./install-source.js";
import type { DiscoveryEvidence, InstallSourceAssessment } from "./types.js";

export interface AssessedCatalogEntry extends CatalogInstallSource {
  installRepositoryPath?: string;
  discovery?: DiscoveryEvidence;
  installAssessment?: InstallSourceAssessment;
  install?: NonNullable<CatalogInstallSource["install"]> & {
    repositoryPath?: string;
    discovery?: DiscoveryEvidence;
    assessment?: InstallSourceAssessment;
  };
}

export const SOURCE_ASSESSMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type CatalogSourceStatus = "unidentified" | "identified" | "verified" | "invalid" | "unavailable" | "stale";

/** Bind evidence to source + selected subpackage, not merely the repository name. */
export function installSourceKey(entry: AssessedCatalogEntry, profile = "web"): string {
  return JSON.stringify([
    entry.fullName.toLowerCase(), resolveCatalogInstallTarget(entry, { profile }),
    entry.install?.packageName ?? entry.installPackageName ?? null,
    entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null,
  ]);
}

export function catalogSourceStatus(entry: AssessedCatalogEntry, profile = "web", now = Date.now()): CatalogSourceStatus {
  if (!resolveCatalogInstallTarget(entry, { profile })) return "unidentified";
  const assessment = entry.install?.assessment ?? entry.installAssessment;
  if (!assessment || assessment.sourceKey !== installSourceKey(entry, profile)) return "identified";
  // Age does not erase a known failure. The collector retries it separately.
  if (assessment.status === "invalid") return "invalid";
  const checkedAt = Date.parse(assessment.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > SOURCE_ASSESSMENT_TTL_MS) return "stale";
  if (assessment.status === "verified" && (!assessment.resolvedTarget || !assessment.integrity)) return "identified";
  return ["verified", "invalid", "unavailable"].includes(assessment.status) ? assessment.status : "identified";
}

export function discoveryNeedsReview(entry: AssessedCatalogEntry): boolean {
  return (entry.install?.discovery ?? entry.discovery)?.status === "review-required";
}
