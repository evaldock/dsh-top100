import { describe, expect, it } from "vitest";
import {
  catalogSourceStatus, discoveryNeedsReview, installSourceKey, SOURCE_ASSESSMENT_TTL_MS,
  type AssessedCatalogEntry,
} from "../src/shared/install-assessment.js";
import type { InstallSourceAssessment } from "../src/shared/types.js";

const now = Date.parse("2026-09-10T00:00:00Z");
function entry(): AssessedCatalogEntry {
  return { fullName: "Acme/tool", type: "cordis-plugin", install: {
    packageName: "@acme/tool", repositoryPath: "packages/tool",
    commands: ["dsh plugin add @acme/tool@1.0.0"],
  } };
}
function assessment(source: AssessedCatalogEntry, overrides: Partial<InstallSourceAssessment> = {}): InstallSourceAssessment {
  return { sourceKey: installSourceKey(source), checkedAt: new Date(now).toISOString(),
    status: "verified", resolvedTarget: "@acme/tool@1.0.0", integrity: "sha512-example", reason: "清单元数据预检", ...overrides };
}

describe("catalog source assessment", () => {
  it("keeps an expired failure visible instead of replacing it with a generic expiry", () => {
    const source = entry();
    source.install!.assessment = assessment(source, { status: "invalid", checkedAt: new Date(now - SOURCE_ASSESSMENT_TTL_MS - 1).toISOString() });
    expect(catalogSourceStatus(source, "web", now)).toBe("invalid");
  });
  it("distinguishes no recognized source, author source, and metadata evidence", () => {
    const source = entry();
    expect(catalogSourceStatus({ fullName: source.fullName }, "web", now)).toBe("unidentified");
    expect(catalogSourceStatus(source, "web", now)).toBe("identified");
    source.install!.assessment = assessment(source);
    expect(catalogSourceStatus(source, "web", now)).toBe("verified");
    expect(source).not.toHaveProperty("installed");
    expect(source).not.toHaveProperty("compatible");
    expect(catalogSourceStatus({ ...source, install: { ...source.install, commands: ["dsh --profile desktop plugin add @acme/tool@1.0.0"] } }, "web", now)).toBe("unidentified");
  });

  it("expires assessments and rejects malformed or future timestamps", () => {
    for (const checkedAt of [new Date(now - SOURCE_ASSESSMENT_TTL_MS - 1).toISOString(), "invalid", new Date(now + 1).toISOString()]) {
      const source = entry();
      source.install!.assessment = assessment(source, { checkedAt });
      expect(catalogSourceStatus(source, "web", now)).toBe("stale");
    }
  });

  it("invalidates evidence when a version, repository, package or subdirectory changes", () => {
    const original = entry();
    original.install!.assessment = assessment(original);
    for (const changed of [
      { ...original, fullName: "acme/other" },
      { ...original, install: { ...original.install, commands: ["dsh plugin add @acme/tool@2.0.0"] } },
      { ...original, install: { ...original.install, packageName: "@acme/other", commands: ["dsh plugin add @acme/other@1.0.0"] } },
      { ...original, install: { ...original.install, repositoryPath: "packages/other" } },
    ]) expect(catalogSourceStatus(changed, "web", now)).toBe("identified");
    expect(installSourceKey({ ...original, fullName: "acme/tool" })).toBe(installSourceKey(original));
  });

  it("binds full and compact entries to the same evidence", () => {
    const original = entry();
    const compact: AssessedCatalogEntry = { fullName: original.fullName, type: original.type,
      installTarget: "@acme/tool@1.0.0", installPackageName: "@acme/tool", installRepositoryPath: "packages/tool",
      installAssessment: assessment(original) };
    expect(installSourceKey(compact)).toBe(installSourceKey(original));
    expect(catalogSourceStatus(compact, "web", now)).toBe("verified");
    expect(catalogSourceStatus({ ...compact, installRepositoryPath: "packages/other" }, "web", now)).toBe("identified");
  });

  it("requires precise source records and preserves invalid versus unavailable", () => {
    const source = entry();
    for (const missing of [{ resolvedTarget: undefined }, { integrity: undefined }]) {
      source.install!.assessment = assessment(source, missing);
      expect(catalogSourceStatus(source, "web", now)).toBe("identified");
    }
    for (const status of ["invalid", "unavailable"] as const) {
      source.install!.assessment = assessment(source, { status });
      expect(catalogSourceStatus(source, "web", now)).toBe(status);
    }
  });

  it("keeps discovery review separate from source preflight", () => {
    const source = entry();
    source.install!.assessment = assessment(source);
    source.install!.discovery = { status: "review-required", kind: "bundle", evidence: [], checkedAt: new Date(now).toISOString(), policyVersion: 1 };
    expect(discoveryNeedsReview(source)).toBe(true);
    expect(catalogSourceStatus(source, "web", now)).toBe("verified");
    expect(discoveryNeedsReview({ fullName: source.fullName, discovery: source.install!.discovery })).toBe(true);
    expect(discoveryNeedsReview(entry())).toBe(false);
  });
});
