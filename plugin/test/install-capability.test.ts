import { describe, expect, it } from "vitest";
import { presentInstallCapability } from "../src/client/install-capability.js";
import type { CatalogItem } from "../src/shared/types.js";
import { zh, en } from "../src/client/locales.js";
import { installSourceKey } from "../src/shared/install-assessment.js";

function item(patch: Partial<CatalogItem> = {}): CatalogItem {
  return {
    rank: 1,
    fullName: "acme/demo",
    name: "demo",
    owner: "acme",
    description: "Demo",
    descriptionZh: "演示",
    stars: 1,
    dailyStars: 0,
    weeklyStars: 0,
    hotScore: 1,
    forks: 0,
    openIssues: 0,
    language: "TypeScript",
    homepage: null,
    license: "MIT",
    topics: [],
    tags: [],
    type: "bundle",
    sources: [],
    url: "https://github.com/acme/demo",
    pushedAt: "2026-09-01T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    installable: true,
    installSpec: { kind: "npm", spec: "demo@1.0.0" },
    installed: false,
    evidence: {
      formFactor: "dsh-bundle",
      compatible: true,
      trustLevel: "install-source",
      signalCodes: ["indexed", "dsh-bundle", "install-source"],
      caveatCode: "not-security-review",
      signals: [],
      caveat: "Not a security review",
    },
    ...patch,
  };
}

describe("install capability presentation", () => {
  it("describes unidentified sources without implying installation is impossible", () => {
    expect(zh.installableOnly).toBe("仅看有安装源");
    expect(zh.capabilityUnavailable).toBe("未找到安装命令");
    expect(zh.installAvailability_unavailable).toBe(zh.capabilityUnavailable);
    expect(zh.browseOnly).toBe(zh.capabilityUnavailable);
    expect(zh.capabilityNoSourceReason).toContain("不代表无法安装");
    expect(zh.browseOnlyHint).toContain("不代表无法安装");
    expect(en.installableOnly).toBe("With install source only");
    expect(en.capabilityUnavailable).toBe("No install command found");
    expect(en.installAvailability_unavailable).toBe(en.capabilityUnavailable);
    expect(en.browseOnly).toBe(en.capabilityUnavailable);
  });
  it("separates one-click install from post-install configuration", () => {
    expect(presentInstallCapability(item()).kind).toBe("ready");
    expect(presentInstallCapability(item({ install: { needsConfig: true } })).kind).toBe("manual");
  });

  it("explains browse-only entries according to the available evidence", () => {
    expect(presentInstallCapability(item({ installable: false, installSpec: null }))).toMatchObject({
      labelKey: "capabilityUnavailable",
      reasonKey: "capabilityNoSourceReason",
    });
    expect(presentInstallCapability(item({
      installable: false,
      installSpec: null,
      evidence: { ...item().evidence, compatible: false },
    }))).toMatchObject({
      labelKey: "capabilityBrowse",
      reasonKey: "capabilityUnverifiedReason",
    });
  });

  it("keeps installed state distinct from catalog installability", () => {
    expect(presentInstallCapability(item({ installed: true })).kind).toBe("installed");
  });

  it("distinguishes changed function evidence from unconfirmed plugin identity", () => {
    const discovery = { status: "review-required", kind: "bundle", evidence: [],
      checkedAt: "2026-09-29T00:00:00Z", policyVersion: 1 } as const;
    const entry = item({ install: { discovery: { ...discovery, evidence: [] } } });
    expect(presentInstallCapability(entry).labelKey).toBe("capabilityReview");
    entry.install = { discovery: { ...discovery, evidence: [], functionReview: { decision: "held" } } };
    expect(presentInstallCapability(entry).labelKey).toBe("capabilityFunctionReview");
    entry.installed = true;
    expect(presentInstallCapability(entry).labelKey).toBe("capabilityInstalled");
  });

  it("reserves checked information for current package evidence, independent of configuration needs", () => {
    const entry = item({ install: { packageName: "demo", commands: ["dsh plugin add demo@1.0.0"] } });
    expect(presentInstallCapability(entry).labelKey).toBe("capabilityReady");
    entry.install = { ...entry.install, assessment: { sourceKey: installSourceKey(entry), status: "verified",
      checkedAt: new Date().toISOString(), resolvedTarget: "demo@1.0.0", integrity: "sha512-example", reason: "checked" } };
    expect(presentInstallCapability(entry).labelKey).toBe("capabilitySource_verified");
    entry.install.needsConfig = true;
    expect(presentInstallCapability(entry).labelKey).toBe("capabilityManual");
    entry.install.assessment!.status = "invalid";
    expect(presentInstallCapability(entry).labelKey).toBe("capabilitySource_invalid");
  });
});
