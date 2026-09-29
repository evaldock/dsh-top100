import { resolveCatalogInstallTarget } from "./install-source.js";
export const SOURCE_ASSESSMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Bind evidence to source + selected subpackage, not merely the repository name. */
export function installSourceKey(entry, profile = "web") {
    return JSON.stringify([
        entry.fullName.toLowerCase(), resolveCatalogInstallTarget(entry, { profile }),
        entry.install?.packageName ?? entry.installPackageName ?? null,
        entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null,
    ]);
}
export function catalogSourceStatus(entry, profile = "web", now = Date.now()) {
    if (!resolveCatalogInstallTarget(entry, { profile }))
        return "unidentified";
    const assessment = entry.install?.assessment ?? entry.installAssessment;
    if (!assessment || assessment.sourceKey !== installSourceKey(entry, profile))
        return "identified";
    // Age does not erase a known failure. The collector retries it separately.
    if (assessment.status === "invalid")
        return "invalid";
    const checkedAt = Date.parse(assessment.checkedAt);
    if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > SOURCE_ASSESSMENT_TTL_MS)
        return "stale";
    if (assessment.status === "verified" && (!assessment.resolvedTarget || !assessment.integrity))
        return "identified";
    return ["verified", "invalid", "unavailable"].includes(assessment.status) ? assessment.status : "identified";
}
export function discoveryNeedsReview(entry) {
    return (entry.install?.discovery ?? entry.discovery)?.status === "review-required";
}
