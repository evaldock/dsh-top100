import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearInstallVerificationCache } from "../src/install/install-verify.js";
import { listManagedPlugins } from "../src/host/manage.js";
import { recordInstallProvenance } from "../src/host/provenance.js";
import type { InstallProvenance } from "../src/shared/types.js";
import { assertUpdateUnchanged, clearUpdateApprovals, createUpdatePreflight, discardUpdateApprovals, discardUpdatePreflightSession, finalizeUpdatePreflightSession, startUpdatePreflightSession, UpdateNotAvailableError, validateUpdateApprovals, type ApprovedUpdate } from "../src/host/update-preflight.js";

let directory: string;
function install(name = "demo", spec = "^1.0.0", extra: Record<string, unknown> = {}) {
  const profilePath = join(directory, "package.json");
  let dependencies = {};
  try { dependencies = JSON.parse(readFileSync(profilePath, "utf8")).dependencies; } catch { /* first package */ }
  writeFileSync(profilePath, JSON.stringify({ dependencies: { ...dependencies, [name]: spec } }));
  const packageDir = join(directory, "node_modules", name);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({
    name, version: "1.0.0", repository: "https://github.com/acme/demo.git", ...extra,
  }));
}
function registry(extra: Record<string, unknown> = {}) {
  const manifest = {
    name: "demo", version: "1.2.3", repository: "https://github.com/acme/demo.git",
    dist: { integrity: "sha512-example" }, dsh: { bundle: { patch: "./patch.yml" } }, ...extra,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("api.github.com") ? { id: url.endsWith("acme/demo") ? 1 : 2, full_name: "acme/demo" } : { ...manifest, versions: { [String(manifest.version)]: manifest } }), { status: 200 })));
}
function request(approval: ApprovedUpdate, risksAccepted = true) {
  return { name: approval.name, approvalToken: approval.preflight.approvalToken, risksAccepted };
}
function recordSource(provenance: Partial<InstallProvenance>) {
  recordInstallProvenance({ profile: "web", profileDirectory: directory, dataUrl: "https://example.invalid" }, {
    approvalToken: "fixture", expiresAt: Date.now() + 1000, fullName: "acme/demo", profile: "web", kind: "bundle",
    lifecycleScripts: [], risks: [], requiresExplicitApproval: false, activationExpectation: "restart-required",
    provenance: {
      source: "npm", requestedTarget: "demo@beta", resolvedTarget: "demo@2.0.0-beta.1", packageName: "demo",
      version: "2.0.0-beta.1", commit: null, integrity: "sha512-test", verifiedAt: Date.now(),
      repositoryUrl: "https://github.com/acme/demo", repositoryIdentity: "matched", ...provenance,
    },
  });
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "top100-update-preflight-")); });
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  clearUpdateApprovals();
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("update source approval", () => {
  it("finalizes a slow batch into a fresh ten-minute window without allowing draft installation", async () => {
    vi.useFakeTimers(); install(); registry();
    const { sessionToken } = startUpdatePreflightSession("web", directory);
    const approval = await createUpdatePreflight("demo", "web", directory, undefined, "preserve", sessionToken);
    const draftRequest = request(approval);
    expect(() => validateUpdateApprovals([draftRequest], "web", directory)).toThrow("仍在检查中");
    vi.advanceTimersByTime(15 * 60 * 1000);
    const [ready] = finalizeUpdatePreflightSession(sessionToken, "web", directory);
    expect(ready.preflight.expiresAt).toBe(Date.now() + 10 * 60 * 1000);
    expect(ready.preflight.approvalToken).not.toBe(draftRequest.approvalToken);
    expect(ready.preflight.provenance.resolvedTarget).toBe("demo@1.2.3");
    expect(() => validateUpdateApprovals([draftRequest], "web", directory)).toThrow("已过期");
    expect(validateUpdateApprovals([{ name: ready.name, approvalToken: ready.preflight.approvalToken, risksAccepted: true }], "web", directory)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("binds batch sessions to profile, directory, identities and a finite collection lifetime", async () => {
    vi.useFakeTimers(); install(); registry();
    const { sessionToken } = startUpdatePreflightSession("web", directory);
    await expect(createUpdatePreflight("demo", "other", directory, undefined, "preserve", sessionToken)).rejects.toThrow("Profile 不匹配");
    const approval = await createUpdatePreflight("demo", "web", directory, undefined, "preserve", sessionToken);
    await expect(createUpdatePreflight("demo", "web", directory, undefined, "preserve", sessionToken)).rejects.toThrow("重复插件");
    install("demo", "^1.1.0");
    expect(() => finalizeUpdatePreflightSession(sessionToken, "web", directory)).toThrow("已变化");
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("仍在检查中");
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(() => finalizeUpdatePreflightSession(sessionToken, "web", directory)).toThrow("会话已过期");
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已过期");
  });

  it("discards cancelled drafts and finalizes empty sessions without package operations", async () => {
    install(); registry();
    const { sessionToken } = startUpdatePreflightSession("web", directory);
    const approval = await createUpdatePreflight("demo", "web", directory, undefined, "preserve", sessionToken);
    discardUpdatePreflightSession(sessionToken, "web", directory);
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已过期");
    const empty = startUpdatePreflightSession("web", directory);
    expect(finalizeUpdatePreflightSession(empty.sessionToken, "web", directory)).toEqual([]);
    expect(() => finalizeUpdatePreflightSession(empty.sessionToken, "web", directory)).toThrow("会话已过期");
  });

  it("keeps the beta channel through inventory, preflight, installation pinning and a later check", async () => {
    install("demo", "2.0.0-beta.1", { version: "2.0.0-beta.1" });
    recordSource({});
    registry({ version: "2.0.0-beta.2" });
    const inventory = (await listManagedPlugins("web", null, directory, true)).find((item) => item.name === "demo");
    expect(inventory).toMatchObject({ latest: "2.0.0-beta.2", updateAvailable: true, updateTarget: "demo@beta", updatePolicy: "保留 npm beta 频道" });
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval.preflight.provenance).toMatchObject({ requestedTarget: "demo@beta", resolvedTarget: "demo@2.0.0-beta.2" });
    install("demo", "2.0.0-beta.2", { version: "2.0.0-beta.2" });
    recordInstallProvenance({ profile: "web", profileDirectory: directory, dataUrl: "https://example.invalid" }, approval.preflight);
    registry({ version: "2.0.0-beta.3" });
    expect((await createUpdatePreflight("demo", "web", directory)).bundleTarget.requestedTarget).toBe("demo@beta");
    expect(fetch).toHaveBeenCalledWith("https://registry.npmjs.org/demo/beta", expect.anything());
    expect(fetch).not.toHaveBeenCalledWith("https://registry.npmjs.org/demo/latest", expect.anything());
  });

  it("keeps an exact legacy 0.x install inside its minor line in inventory and preflight", async () => {
    install("demo", "0.2.3", { version: "0.2.3" });
    const versions = Object.fromEntries(["0.2.3", "0.2.9", "0.3.0", "1.0.0"].map((version) => [version, {
      name: "demo", version, repository: "https://github.com/acme/demo", dist: { integrity: "sha512-test" }, dsh: { bundle: { patch: "patch.yml" } },
    }]));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://registry.npmjs.org/demo");
      return new Response(JSON.stringify({ versions }));
    }));
    expect((await listManagedPlugins("web", null, directory, true)).find((item) => item.name === "demo"))
      .toMatchObject({ latest: "0.2.9", updateTarget: "demo@~0.2.3", updateAvailable: true });
    expect((await createUpdatePreflight("demo", "web", directory)).bundleTarget.target).toBe("demo@0.2.9");
  });

  it("restores a maintenance branch from matching commit provenance and preserves its package path", async () => {
    const installedSha = "a".repeat(40);
    const sha = "b".repeat(40);
    install("demo", `git+https://github.com/acme/demo.git#${installedSha}&path:/packages/demo`);
    recordSource({ source: "github", version: "1.0.0", commit: installedSha,
      resolvedTarget: `github:acme/demo#${installedSha}&path:/packages/demo`, requestedTarget: "github:acme/demo#release/1.x&path:/packages/demo" });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/commits/release%2F1.x")) return new Response(JSON.stringify({ sha }));
      expect(url).toBe(`https://api.github.com/repos/acme/demo/contents/packages/demo/package.json?ref=${sha}`);
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({ name: "demo", version: "1.0.0", dsh: { bundle: { patch: "patch.yml" } } })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await createUpdatePreflight("demo", "web", directory)).bundleTarget).toMatchObject({
      requestedTarget: "github:acme/demo#release/1.x&path:/packages/demo", target: `github:acme/demo#${sha}&path:/packages/demo`,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an unknown GitHub commit before network activity and exposes that state in inventory", async () => {
    install("demo", `github:acme/demo#${"a".repeat(40)}`);
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toMatchObject({ code: "update-strategy-required" });
    expect((await listManagedPlugins("web", null, directory)).find((item) => item.name === "demo"))
      .toMatchObject({ updateTarget: null, updateAvailable: false, updateError: expect.stringContaining("无法确认原更新分支") });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalidates an approval after its recorded release channel changes", async () => {
    install("demo", "2.0.0-beta.1", { version: "2.0.0-beta.1" }); recordSource({}); registry({ version: "2.0.0-beta.2" });
    const approval = await createUpdatePreflight("demo", "web", directory);
    recordSource({ requestedTarget: "demo@next" });
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已变化");
  });

  it("resolves a fresh npm target after the five-minute inventory cache expires before the ten-minute verification cache", async () => {
    vi.useFakeTimers();
    const name = "cache-refresh-demo";
    install(name, "1.2.3", { version: "1.2.3" });
    let latest = "1.2.3";
    const fetchMock = vi.fn(async () => {
      const manifest = {
      name, version: latest, repository: "https://github.com/acme/demo.git",
      dist: { integrity: `sha512-${latest}` }, dsh: { bundle: { patch: "./patch.yml" } },
      };
      return new Response(JSON.stringify({ ...manifest, versions: { [latest]: manifest } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(createUpdatePreflight(name, "web", directory)).rejects.toMatchObject({ code: "no-update" });
    expect((await listManagedPlugins("web", null, directory)).find((item) => item.name === name))
      .toMatchObject({ latest: "1.2.3", updateAvailable: false });
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    latest = "1.3.0";
    expect((await listManagedPlugins("web", null, directory)).find((item) => item.name === name))
      .toMatchObject({ latest: "1.3.0", updateAvailable: true });
    await expect(createUpdatePreflight(name, "web", directory)).resolves.toMatchObject({
      bundleTarget: { target: `${name}@1.3.0` },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("resolves the GitHub branch again when a new commit arrives within the verification cache window", async () => {
    const installedSha = "a".repeat(40);
    let sha = installedSha;
    install("demo", `github:acme/demo#${installedSha}`);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/acme/demo")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({
        name: "demo", version: "1.0.0", dsh: { bundle: { patch: "./patch.yml" } },
      })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(createUpdatePreflight("demo", "web", directory, undefined, "latest")).rejects.toMatchObject({ code: "no-update" });
    sha = "b".repeat(40);
    await expect(createUpdatePreflight("demo", "web", directory, undefined, "latest")).resolves.toMatchObject({
      bundleTarget: { commit: sha },
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each([
    { current: "1.2.3", latest: "1.2.3", message: "已是最新版本" },
    { current: "1.2.3+local", latest: "1.2.3+registry", message: "已是最新版本" },
    { current: "2.0.0", latest: "1.2.3", message: "低于当前版本" },
    { current: "2.0.0-beta.1", latest: "1.2.3", message: "低于当前版本" },
    { current: "1.2.3", latest: "1.2.3-rc.1", message: "低于当前版本" },
    { current: undefined, latest: "1.2.3", message: "当前插件版本无法核对" },
    { current: "unknown", latest: "1.2.3", message: "当前插件版本无法核对" },
    { current: "1.0.0", latest: "unknown", message: "缺少精确 version" },
  ])("does not approve an npm update without a newer version: %j", async ({ current, latest, message }) => {
    install("demo", "latest", { version: current }); registry({ version: latest });
    const result = createUpdatePreflight("demo", "web", directory, undefined, "latest");
    await expect(result).rejects.toThrow(message);
    if (message === "已是最新版本" || message === "低于当前版本") {
      await expect(result).rejects.toBeInstanceOf(UpdateNotAvailableError);
      await expect(result).rejects.toMatchObject({ code: "no-update" });
    }
  });

  it("allows a newer npm prerelease and a stable release after a prerelease", async () => {
    install("demo", "2.0.0-rc.1", { version: "2.0.0-rc.1" }); registry({ version: "2.0.0-rc.2" });
    const prerelease = await createUpdatePreflight("demo", "web", directory);
    expect(prerelease.bundleTarget.target).toBe("demo@2.0.0-rc.2");
    clearInstallVerificationCache();
    registry({ version: "2.0.0" });
    const stable = await createUpdatePreflight("demo", "web", directory);
    expect(stable.bundleTarget.target).toBe("demo@2.0.0");
  });

  it.each(["a".repeat(40), "A".repeat(40)])("does not approve the same installed GitHub commit %s", async (installedSha) => {
    const sha = "a".repeat(40);
    install("demo", `github:acme/demo#${installedSha}`);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/acme/demo")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({
        name: "demo", version: "1.0.0", dsh: { bundle: { patch: "./patch.yml" } },
      })).toString("base64") }));
    }));
    const result = createUpdatePreflight("demo", "web", directory, undefined, "latest");
    await expect(result).rejects.toThrow("已是最新提交");
    await expect(result).rejects.toMatchObject({ code: "no-update" });
  });

  it.each(["main", "b".repeat(40)])("allows a GitHub update with unchanged manifest version when installed ref is %s", async (ref) => {
    const sha = "a".repeat(40);
    install("demo", `github:acme/demo#${ref}`);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/acme/demo")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({
        name: "demo", version: "1.0.0", dsh: { bundle: { patch: "./patch.yml" } },
      })).toString("base64") }));
    }));
    const approval = await createUpdatePreflight("demo", "web", directory, undefined, "latest");
    expect(approval.bundleTarget.target).toBe(`github:acme/demo#${sha}`);
  });

  it("pins npm updates and requires explicit approval for new lifecycle scripts", async () => {
    install(); registry({ scripts: { postinstall: "node setup.js" } });
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval).toMatchObject({ name: "demo", currentSpec: "^1.0.0", currentVersion: "1.0.0",
      preflight: { fullName: "acme/demo", requiresExplicitApproval: true,
        provenance: { resolvedTarget: "demo@1.2.3", repositoryIdentity: "matched" } },
    });
    expect(() => validateUpdateApprovals([request(approval, false)], "web", directory)).toThrow("需要明确确认");
    expect(validateUpdateApprovals([request(approval)], "web", directory)[0].bundleTarget.target).toBe("demo@1.2.3");
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已过期");
  });

  it("keeps GitHub monorepo updates on the installed package path and pins the commit", async () => {
    const sha = "a".repeat(40);
    install("demo", `github:acme/mono#${"b".repeat(40)}&path:/plugins/demo`, {
      repository: { url: "git+https://github.com/acme/mono.git", directory: "plugins/demo" },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/acme/mono")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      expect(url).toContain(`/contents/plugins/demo/package.json?ref=${sha}`);
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({
        name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } },
      })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const approval = await createUpdatePreflight("demo", "web", directory, undefined, "latest");
    expect(approval.bundleTarget.target).toBe(`github:acme/mono#${sha}&path:/plugins/demo`);
    expect(approval.preflight.fullName).toBe("acme/mono");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { name: "another", message: "包名" },
    { repository: "https://github.com/other/demo.git", message: "仓库" },
  ])("rejects changed source identity: %j", async ({ message, ...extra }) => {
    install(); registry(extra);
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow(message);
  });

  it("rejects inconsistent installed GitHub identity before network requests", async () => {
    install("demo", "github:acme/other"); registry();
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow("仓库与安装来源不一致");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["link:../demo", "file:/tmp/demo", "npm:another@1", "https://other.test/plugin.tgz", "workspace:*"])("does not redirect unsupported source %s to npm", async (spec) => {
    install("demo", spec); registry();
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects protected packages", async () => {
    install("@deepseek-ai/dsh-web-app"); registry();
    await expect(createUpdatePreflight("@deepseek-ai/dsh-web-app", "web", directory)).rejects.toThrow("受保护");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { spec: "^1.1.0", manifest: {} },
    { spec: "^1.0.0", manifest: { version: "1.1.0" } },
    { spec: "^1.0.0", manifest: { scripts: { install: "node changed.js" } } },
    { spec: "^1.0.0", manifest: { repository: "https://github.com/other/demo" } },
  ])("rejects local changes after preflight: %j", async ({ spec, manifest }) => {
    install(); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    install("demo", spec, manifest);
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已变化");
    expect(() => assertUpdateUnchanged(approval, "web", directory)).toThrow("已变化");
  });

  it("rejects installation changes made during network preflight", async () => {
    install();
    vi.stubGlobal("fetch", vi.fn(async () => {
      install("demo", "^1.1.0");
      const manifest = { name: "demo", version: "1.2.0", repository: "https://github.com/acme/demo",
        dist: { integrity: "sha512-example" }, dsh: { bundle: { patch: "./patch.yml" } } };
      return new Response(JSON.stringify({ versions: { "1.2.0": manifest } }));
    }));
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow("已变化");
  });

  it("validates every batch token before consuming and rejects duplicates", async () => {
    install(); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(() => validateUpdateApprovals([request(approval), request(approval)], "web", directory)).toThrow("重复");
    expect(() => validateUpdateApprovals([request(approval), { name: "other", approvalToken: "invalid", risksAccepted: true }], "web", directory)).toThrow("已过期");
    expect(validateUpdateApprovals([request(approval)], "web", directory)).toHaveLength(1);
  });

  it("binds tokens to package, profile name and resolved directory", async () => {
    install(); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(() => validateUpdateApprovals([{ ...request(approval), name: "other" }], "web", directory)).toThrow("不匹配");
    expect(() => validateUpdateApprovals([request(approval)], "another", directory)).toThrow("不匹配");
    const otherDirectory = mkdtempSync(join(directory, "another-profile-"));
    mkdirSync(join(otherDirectory, "node_modules", "demo"), { recursive: true });
    writeFileSync(join(otherDirectory, "package.json"), readFileSync(join(directory, "package.json")));
    writeFileSync(join(otherDirectory, "node_modules", "demo", "package.json"), readFileSync(join(directory, "node_modules", "demo", "package.json")));
    expect(() => validateUpdateApprovals([request(approval)], "web", otherDirectory)).toThrow("已变化");
    expect(validateUpdateApprovals([request(approval)], "web", directory)).toHaveLength(1);
  });

  it("rejects expired and discarded approvals", async () => {
    install(); registry();
    vi.useFakeTimers();
    const approval = await createUpdatePreflight("demo", "web", directory);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已过期");
    const next = await createUpdatePreflight("demo", "web", directory);
    discardUpdateApprovals([next.preflight.approvalToken]);
    expect(() => validateUpdateApprovals([request(next)], "web", directory)).toThrow("已过期");
  });

  it("does not return an approval after cancellation during source verification", async () => {
    install();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      return new Response(JSON.stringify({ name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } } }));
    }));
    await expect(createUpdatePreflight("demo", "web", directory, controller.signal)).rejects.toThrow();
  });
});

describe("shared repository parsing across install and update", () => {
  it.each([
    "https://github.com/acme/demo/tree/main/packages/demo",
    "git+ssh://git@github.com:22/acme/demo.git",
    "acme/demo",
  ])("does not lose installed repository identity for %s", async (repository) => {
    install("demo", "1.0.0", { repository });
    registry({ repository: "https://github.com/other/different" });
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow("不一致");
  });

  it.each([undefined, "https://other.test/acme/demo"])("requires source risk approval when the installed repository is unknown: %s", async (repository) => {
    install("demo", "1.0.0", { repository }); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval.preflight).toMatchObject({ requiresExplicitApproval: true, provenance: { repositoryIdentity: "unavailable" } });
    expect(() => validateUpdateApprovals([request(approval, false)], "web", directory)).toThrow("需要明确确认");
  });

  it.each([
    "git+https://github.com/acme/mono.git", "git+ssh://git@github.com/acme/mono.git", "git@github.com:acme/mono.git",
  ])("updates the package path from pnpm's persisted Git spec %s", async (base) => {
    const sha = "d".repeat(40);
    install("demo", `${base}#${"a".repeat(40)}&path:/packages/demo`, { repository: { url: "https://github.com/acme/mono/tree/main/packages/demo", directory: "packages/demo" } });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/acme/mono")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      expect(url).toBe(`https://api.github.com/repos/acme/mono/contents/packages/demo/package.json?ref=${sha}`);
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({ name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } } })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const approval = await createUpdatePreflight("demo", "web", directory, undefined, "latest");
    expect(approval.bundleTarget.target).toBe(`github:acme/mono#${sha}&path:/packages/demo`);
    expect(approval.bundleTarget.repositoryIdentity).toBe("matched");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
