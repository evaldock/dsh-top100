import { catalogSourceStatus, discoveryNeedsReview } from "../shared/install-assessment.js";
import type { CatalogItem } from "../shared/types.js";

export type InstallCapabilityKind = "installed" | "ready" | "manual" | "browse";

export interface InstallCapabilityPresentation {
  kind: InstallCapabilityKind;
  labelKey: string;
  reasonKey: string;
}

/** Explain the next user-visible step without conflating structure, trust, and installability. */
export function presentInstallCapability(item: CatalogItem): InstallCapabilityPresentation {
  if (item.installed) {
    return { kind: "installed", labelKey: "capabilityInstalled", reasonKey: "capabilityInstalledReason" };
  }
  if (discoveryNeedsReview(item) && item.install?.discovery?.functionReview?.decision === "held") {
    return { kind: "browse", labelKey: "capabilityFunctionReview", reasonKey: "capabilityFunctionReviewReason" };
  }
  if (discoveryNeedsReview(item)) return { kind: "browse", labelKey: "capabilityReview", reasonKey: "capabilityReviewReason" };
  const sourceStatus = catalogSourceStatus(item);
  if (sourceStatus === "invalid" || sourceStatus === "unavailable" || sourceStatus === "stale") {
    return { kind: "manual", labelKey: `capabilitySource_${sourceStatus}`, reasonKey: `capabilitySource_${sourceStatus}Reason` };
  }
  if (item.installable && item.install?.needsConfig) {
    return { kind: "manual", labelKey: "capabilityManual", reasonKey: "capabilityManualReason" };
  }
  if (sourceStatus === "verified") return { kind: "ready", labelKey: "capabilitySource_verified", reasonKey: "capabilitySource_verifiedReason" };
  if (item.installable) {
    return { kind: "ready", labelKey: "capabilityReady", reasonKey: "capabilityReadyReason" };
  }
  if (!item.evidence.compatible) {
    return { kind: "browse", labelKey: "capabilityBrowse", reasonKey: "capabilityUnverifiedReason" };
  }
  return { kind: "browse", labelKey: "capabilityUnavailable", reasonKey: "capabilityNoSourceReason" };
}
