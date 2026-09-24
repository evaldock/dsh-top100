import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessInstallSource, refreshInstallAssessments, type AssessmentCache } from "../src/install-assessment.js";
import { catalogSourceStatus, installSourceKey, SOURCE_ASSESSMENT_TTL_MS, type AssessedCatalogEntry } from "../../plugin/src/shared/install-assessment.js";
import { clearInstallVerificationCache, InstallVerificationError, verifyInstallSpec } from "../../plugin/src/install/install-verify.js";
import type { InstallSourceAssessment } from "../../plugin/src/shared/types.js";

const now = Date.parse("2026-09-10T00:00:00Z");
const day = 86_400_000;
function entry(): AssessedCatalogEntry & { stars: number } {
  return { fullName: "acme/tool", type: "cordis-plugin", stars: 100, install: {
    packageName: "@acme/tool", repositoryPath: "packages/tool", commands: ["dsh plugin add @acme/tool@1.0.0"],
  } };
}
function manifest() {
  return { name: "@acme/tool", version: "1.0.0", repository: { url: "https://github.com/acme/tool", directory: "packages/tool" },
    dsh: { bundle: { patch: "./missing-from-archive.yml" } }, dist: { integrity: "sha512-example", tarball: "https://example.test/must-not-fetch.tgz" } };
}
function assessment(source: AssessedCatalogEntry, overrides: Partial<InstallSourceAssessment> = {}): InstallSourceAssessment {
  return { sourceKey: installSourceKey(source), checkedAt: new Date(now).toISOString(), status: "verified",
    resolvedTarget: "@acme/tool@1.0.0", integrity: "sha512-example", reason: "清单元数据预检", ...overrides };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); clearInstallVerificationCache(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); clearInstallVerificationCache(); });

describe("read-only install source assessment", () => {
  it("checks only manifest metadata and never claims archive, install or runtime success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(manifest())));
    const source = entry();
    const result = await assessInstallSource(source);
    expect(result).toMatchObject({ status: "verified", sourceKey: installSourceKey(source), resolvedTarget: "@acme/tool@1.0.0", integrity: "sha512-example" });
    expect(result!.reason).toContain("清单元数据");
    expect(result!.reason).toContain("尚未验证发布归档、安装、宿主兼容或业务功能");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    expect(result).not.toHaveProperty("installed");
    expect(result).not.toHaveProperty("compatible");
  });

  it.each([403, 429, 500, 503])("does not turn HTTP %s into invalid source evidence", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status }));
    expect(await assessInstallSource(entry())).toMatchObject({ status: "unavailable" });
  });

  it.each([403, 429])("preserves GitHub rate limit HTTP %s and leaves it retryable", async status => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("rate limit", { status, headers: { "x-ratelimit-remaining": "0" } }));
    const source = entry();
    source.install!.commands = ["dsh plugin add github:acme/tool"];
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/tool" }, { forceRefresh: true }))
      .rejects.toMatchObject({ name: "InstallVerificationError", status, fatal: true });
    expect(await assessInstallSource(source)).toMatchObject({ status: "unavailable" });
  });

  it("treats network failures and missing identity as unavailable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    expect(await assessInstallSource(entry())).toMatchObject({ status: "unavailable" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...manifest(), repository: undefined })));
    expect(await assessInstallSource(entry())).toMatchObject({ status: "unavailable" });
  });

  it.each([undefined, {}, { bundle: { patch: "" } }])("records a fetched npm manifest without a bundle as invalid", async dsh => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ...manifest(), dsh })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "@acme/tool@1.0.0" }, { forceRefresh: true }))
      .rejects.toMatchObject({ reason: "invalid-manifest", fatal: false, status: null });
    expect(await assessInstallSource(entry())).toMatchObject({ status: "invalid" });
  });

  it("records missing sources and mismatched repository/subpackage identity as invalid", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not found", { status: 404 }));
    expect(await assessInstallSource(entry())).toMatchObject({ status: "invalid" });
    for (const repository of [{ url: "https://github.com/other/tool" }, { url: "https://github.com/acme/tool", directory: "packages/other" }]) {
      fetchMock.mockImplementation(async (url) => new Response(JSON.stringify(String(url).includes("api.github.com") ? { id: String(url).endsWith("acme/tool") ? 1 : 2, full_name: "acme/tool" } : { ...manifest(), repository })));
      expect(await assessInstallSource(entry())).toMatchObject({ status: "invalid" });
    }
  });

  it("does not preflight Skills or entries without a recognized install source", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected request"));
    expect(await assessInstallSource({ ...entry(), type: "skill" })).toBeNull();
    expect(await assessInstallSource({ fullName: "acme/tool", type: "cordis-plugin" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("assessment cache and retry scheduling", () => {
  it("retries an expired failure even while the UI continues to display it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(manifest())));
    const source = entry();
    const cache: AssessmentCache = { [source.fullName]: assessment(source, { status: "invalid", checkedAt: new Date(now - 8 * day).toISOString() }) };
    expect((await refreshInstallAssessments([source], cache, { limit: 1, now })).checked).toBe(1);
    expect(cache[source.fullName].status).toBe("verified");
  });
  it("reuses current source-bound metadata but retries unavailable evidence after a day", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(manifest())));
    const source = entry();
    const cache: AssessmentCache = { [source.fullName]: assessment(source) };
    expect((await refreshInstallAssessments([source], cache, { limit: 10, now })).checked).toBe(0);
    cache[source.fullName] = assessment(source, { status: "unavailable", checkedAt: new Date(now - day + 1).toISOString() });
    expect((await refreshInstallAssessments([source], cache, { limit: 10, now })).checked).toBe(0);
    cache[source.fullName].checkedAt = new Date(now - day).toISOString();
    expect((await refreshInstallAssessments([source], cache, { limit: 10, now })).checked).toBe(1);
    expect(cache[source.fullName].status).toBe("verified");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes expired verified and invalid records", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(manifest())));
    for (const status of ["verified", "invalid"] as const) {
      const source = entry();
      const cache = { [source.fullName]: assessment(source, { status, checkedAt: new Date(now - SOURCE_ASSESSMENT_TTL_MS - 1).toISOString() }) };
      expect((await refreshInstallAssessments([source], cache, { limit: 10, now })).checked).toBe(1);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates changed source versions and checks them again immediately", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ...manifest(), version: "2.0.0" })));
    const source = entry();
    const cache = { [source.fullName]: assessment(source) };
    source.install!.commands = ["dsh plugin add @acme/tool@2.0.0"];
    expect((await refreshInstallAssessments([source], cache, { limit: 10, now })).checked).toBe(1);
    expect(cache[source.fullName].resolvedTarget).toBe("@acme/tool@2.0.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors priority and batch limits and skips Skills", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const ordinary = entry();
    const priority = { ...entry(), fullName: "acme/priority", stars: 1 };
    const skill = { ...entry(), type: "skill", fullName: "acme/skill" };
    const cache: AssessmentCache = {};
    expect((await refreshInstallAssessments([ordinary, priority, skill], cache, { limit: 1, priority: new Set([priority.fullName]), now })).checked).toBe(1);
    expect(Object.keys(cache)).toEqual([priority.fullName]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches and reuses compact-entry evidence without losing selected package identity", async () => {
    const source = entry();
    const compact: AssessedCatalogEntry & { stars: number } = { fullName: source.fullName, type: source.type, stars: 100,
      installTarget: "@acme/tool@1.0.0", installPackageName: "@acme/tool", installRepositoryPath: "packages/tool" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(manifest())));
    const cache: AssessmentCache = {};
    expect((await refreshInstallAssessments([compact], cache, { limit: 10, now })).checked).toBe(1);
    expect(catalogSourceStatus(compact, "web", now)).toBe("verified");
    expect((await refreshInstallAssessments([compact], cache, { limit: 10, now })).checked).toBe(0);
    compact.installRepositoryPath = "packages/other";
    expect((await refreshInstallAssessments([compact], cache, { limit: 10, now })).checked).toBe(1);
    expect(cache[compact.fullName].status).toBe("invalid");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
