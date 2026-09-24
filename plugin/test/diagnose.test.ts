import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPackageEnabled } from "../src/host/patch-toggle.js";
import { buildDiagnosticReport } from "../src/host/diagnose.js";
import type { RankingsDocument } from "../src/shared/types.js";
import { readRuntimeStatus, type HostRuntimeStatus } from "../src/host/runtime-status.js";

const emptyCatalog: RankingsDocument = {
  schemaVersion: 1,
  generatedAt: "2026-08-25T00:00:00.000Z",
  snapshotDate: "2026-08-25",
  rankings: { hot: [], rising: [], total: [] },
};

const temporaryDirectories: string[] = [];
function temporaryProfile(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-top100-diagnose-"));
  temporaryDirectories.push(directory);
  vi.stubEnv("DSH_HOME", join(directory, "home"));
  return directory;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Host runtime diagnostic wiring", () => {
  function profileWithBundle(requiredPeer = false): string {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "runtime-demo");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: { "runtime-demo": "1.0.0", "not-a-bundle": "1.0.0" },
      dsh: { profile: { bundles: ["runtime-demo"] } },
    }));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({
      name: "runtime-demo", version: "1.0.0", dsh: { bundle: { patch: "bundle.yml" } },
      ...(requiredPeer ? { peerDependencies: { "missing-runtime-peer": "^1.0.0" } } : {}),
    }));
    writeFileSync(join(pluginDirectory, "bundle.yml"), '- insert: [{ id: declared-root, name: runtime-demo }]\n');
    return directory;
  }

  it("includes missing required Host services in errors and keeps their names", async () => {
    const readRuntime = vi.fn(() => ({ "runtime-demo": {
      state: "missing-services", reason: "required-services-missing", missingServices: ["requiredBridge"],
    } satisfies HostRuntimeStatus }));
    const report = await buildDiagnosticReport("web", {
      profileDir: profileWithBundle(), document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt), readRuntime,
    });
    expect(readRuntime).toHaveBeenCalledExactlyOnceWith([{ name: "runtime-demo", enabled: true, entryIds: ["declared-root"] }]);
    expect(report.summary.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      severity: "error", code: "runtime-missing-services", subject: "runtime-demo", parameters: { services: ["requiredBridge"] },
    }));
    expect(report.bundles[0].runtime?.missingServices).toEqual(["requiredBridge"]);
  });

  it("retains configuration errors even when a Host root has loaded", async () => {
    const report = await buildDiagnosticReport("web", {
      profileDir: profileWithBundle(true), document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt),
      readRuntime: () => ({ "runtime-demo": { state: "loaded", reason: "root-active" } }),
    });
    expect(report.bundles[0].runtime).toEqual({ state: "loaded", reason: "root-active" });
    expect(report.summary.ok).toBe(false);
    expect(report.findings.some((finding) => finding.code === "peer-missing")).toBe(true);
    expect(report.findings.filter((finding) => finding.code.startsWith("runtime-"))).toEqual([]);
  });

  it("preserves unknown for another Profile without claiming Host success or failure", async () => {
    const get = vi.fn(() => { throw new Error("must not read a different Profile"); });
    const report = await buildDiagnosticReport("other-profile", {
      profileDir: profileWithBundle(), document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt),
      readRuntime: (bundles) => readRuntimeStatus({ get }, { isCurrentProfile: false, bundles }),
    });
    expect(get).not.toHaveBeenCalled();
    expect(report.bundles[0].runtime).toEqual({ state: "unknown", reason: "profile-not-active" });
    // Summary covers detected errors; the distinct runtime field retains the observation gap.
    expect(report.summary.ok).toBe(true);
    expect(report.findings.filter((finding) => finding.code.startsWith("runtime-"))).toEqual([]);
  });
});

describe("profile diagnostics", () => {
  it("only scans bundles declared by the current profile", async () => {
    const directory = temporaryProfile();
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
    }));
    const report = await buildDiagnosticReport("web", { profileDir: directory, document: emptyCatalog });
    expect(report.bundles.map((item) => item.name)).toEqual(["@deepseek-ai/dsh-base"]);
    expect(report.duplicates).toEqual([]);
  });

  it.each([false, true])("distinguishes missing required and optional peer dependencies (optional=%s)", async (optional) => {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "audit-plugin");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: { "audit-plugin": "1.0.0" },
      dsh: { profile: { bundles: ["audit-plugin"] } },
    }));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({
      name: "audit-plugin", version: "1.0.0", dsh: { bundle: { patch: "./cordis.patch.yml" } },
      peerDependencies: { "audit-missing-peer": "^1.0.0" },
      peerDependenciesMeta: { "audit-missing-peer": { optional } },
    }));
    writeFileSync(join(pluginDirectory, "cordis.patch.yml"), "[]\n");
    const report = await buildDiagnosticReport("web", {
      profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt),
    });
    expect(report.summary.ok).toBe(optional);
    expect(report.summary.dependencies).toBe(optional ? 0 : 1);
    expect(report.findings.filter((finding) => finding.code === "peer-missing")).toHaveLength(optional ? 0 : 1);
    if (!optional) expect(report.findings.find((finding) => finding.code === "peer-missing")?.parameters)
      .toEqual({ dependency: "audit-missing-peer", range: "^1.0.0" });
    expect(report.peers).toContainEqual({
      plugin: "audit-plugin", name: "audit-missing-peer", range: "^1.0.0", resolved: null, satisfied: null,
    });
  });

  it("resolves a required peer from a pnpm plugin's real installation directory", async () => {
    const directory = temporaryProfile();
    const modules = join(directory, "node_modules");
    const virtualModules = join(modules, ".pnpm", "audit-plugin@1.0.0", "node_modules");
    const pluginDirectory = join(virtualModules, "audit-plugin");
    const peerDirectory = join(virtualModules, "audit-required-peer");
    mkdirSync(pluginDirectory, { recursive: true });
    mkdirSync(peerDirectory, { recursive: true });
    symlinkSync(pluginDirectory, join(modules, "audit-plugin"), "junction");
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: { "audit-plugin": "1.0.0" }, dsh: { profile: { bundles: ["audit-plugin"] } },
    }));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({
      name: "audit-plugin", version: "1.0.0", dsh: { bundle: { patch: "./cordis.patch.yml" } },
      peerDependencies: { "audit-required-peer": "^1.0.0" },
    }));
    writeFileSync(join(pluginDirectory, "cordis.patch.yml"), "[]\n");
    writeFileSync(join(peerDirectory, "package.json"), JSON.stringify({ name: "audit-required-peer", version: "1.2.0" }));
    const report = await buildDiagnosticReport("web", {
      profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt),
    });
    expect(report.summary.ok).toBe(true);
    expect(report.summary.dependencies).toBe(0);
    expect(report.peers).toContainEqual({
      plugin: "audit-plugin", name: "audit-required-peer", range: "^1.0.0", resolved: "1.2.0", satisfied: true,
    });
  });
});

describe("structured patch diagnostics", () => {
  it.each(["missing-patch", "malformed-patch", "invalid-structure", "malformed-user-patch"])("reports %s as an error", async (scenario) => {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "demo");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({dependencies: {demo: "1.0.0"}, dsh: {profile: {bundles: ["demo"]}}}));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({name: "demo", version: "1.0.0", dsh: {bundle: {patch: "bundle.yml"}}}));
    // A conventional fallback must not mask a missing declared bundle layer.
    writeFileSync(join(pluginDirectory, "cordis.patch.yml"), "[]\n");
    if (scenario !== "missing-patch") writeFileSync(join(pluginDirectory, "bundle.yml"), scenario === "malformed-patch" ? "[broken" : scenario === "invalid-structure" ? "[null]" : "[]\n");
    if (scenario === "malformed-user-patch") writeFileSync(join(directory, "cordis.patch.yml"), "[broken");
    const report = await buildDiagnosticReport("web", {profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt)});
    expect(report.summary.ok).toBe(false);
    expect(report.findings.some((finding) => finding.severity === "error" && finding.code === (scenario === "malformed-user-patch" ? "user-patch-invalid" : "bundle-unresolved"))).toBe(true);
    if (scenario !== "malformed-user-patch") {
      expect(report.bundles[0]?.errorCode).toBe("patch-invalid");
      expect(report.findings.find((finding) => finding.code === "bundle-unresolved")?.parameters).toEqual({ reason: "patch-invalid" });
    }
  });

  it("uses flow/alias loader ids and flow disabled overrides consistently", async () => {
    const directory = temporaryProfile();
    const pluginDirectory = join(directory, "node_modules", "demo");
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({dependencies: {demo: "1.0.0"}, dsh: {profile: {bundles: ["demo"]}}}));
    writeFileSync(join(pluginDirectory, "package.json"), JSON.stringify({name: "demo", version: "1.0.0", dsh: {bundle: {patch: "bundle.yml"}}}));
    writeFileSync(join(pluginDirectory, "bundle.yml"), '[{insert: [{id: actual-loader, name: demo, config: {id: ordinary-option, value: !!js "env.X"}}]}]');
    writeFileSync(join(directory, "cordis.patch.yml"), '[{id: actual-loader, config: {nested: true}, disabled: true}]');
    const report = await buildDiagnosticReport("web", {profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt)});
    expect(report.summary.ok).toBe(true);
    expect(report.bundles[0]).toMatchObject({entries: ["actual-loader"], enabled: false, error: null});
    expect(report.patch.orphans).toEqual([]);
  });
});


it.each([
  {user: '- id: active\n  name: wrong-module\n  disabled: true\n', enabled:true, disables:[]},
  {user: '- id: active\n  name: demo\n  disabled: true\n', enabled:false, disables:['active']},
  {user: '- id: active\n  name: demo\n  disabled: true\n- id: active\n  name: wrong-module\n  disabled: false\n', enabled:false, disables:['active']},
])('diagnostics follow actual name guards: $enabled / $user', async ({user,enabled,disables}) => {
  const directory = temporaryProfile();
  const pluginDirectory = join(directory,'node_modules/demo'); mkdirSync(pluginDirectory,{recursive:true});
  writeFileSync(join(directory,'package.json'), JSON.stringify({dependencies:{demo:'1.0.0'},dsh:{profile:{bundles:['demo']}}}));
  writeFileSync(join(pluginDirectory,'package.json'), JSON.stringify({name:'demo',version:'1.0.0',dsh:{bundle:{patch:'bundle.yml'}}}));
  writeFileSync(join(pluginDirectory,'bundle.yml'), '- insert: [{id: active, name: demo}, {id: optional, name: demo/optional, disabled: true}]\n');
  writeFileSync(join(directory,'cordis.patch.yml'),user);
  const report = await buildDiagnosticReport('web',{profileDir:directory,document:emptyCatalog,now:Date.parse(emptyCatalog.generatedAt)});
  expect(report.bundles[0].enabled).toBe(enabled);
  expect(report.patch.disables).toEqual(disables);
});


describe("DSH multi-patch and catalog compatibility", () => {
  function fixture(patch: unknown = ["first.yml", "second.yml"]) {
    const directory = temporaryProfile();
    const target = join(directory, "node_modules", "dshmarket");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(directory, "package.json"), JSON.stringify({ dependencies: { dshmarket: "1.61.0" }, dsh: { profile: { bundles: ["dshmarket"] } } }));
    writeFileSync(join(target, "package.json"), JSON.stringify({ name: "dshmarket", version: "1.61.0", repository: "git+https://github.com/dsh-market/dsh-market.git", dsh: { bundle: { patch } } }));
    writeFileSync(join(target, "first.yml"), '- insert: [{ id: first, name: dshmarket }]\n');
    writeFileSync(join(target, "second.yml"), '- insert: [{ id: second, name: dshmarket/extra }]\n- id: first\n  disabled: true\n');
    return { directory, target };
  }
  it("reads all declared files in order and toggles their combined entries", async () => {
    const { directory } = fixture();
    const options = { profileDir: directory, document: emptyCatalog, now: Date.parse(emptyCatalog.generatedAt) };
    const before = await buildDiagnosticReport("web", options);
    expect(before.bundles[0].error).toBeNull();
    expect(before.bundles[0].entries).toEqual(["first", "second"]);
    expect(before.bundles[0].enabled).toBe(true);
    expect(setPackageEnabled("web", "dshmarket", false, directory).ok).toBe(true);
    expect((await buildDiagnosticReport("web", options)).bundles[0].enabled).toBe(false);
    expect(setPackageEnabled("web", "dshmarket", true, directory).ok).toBe(true);
    expect((await buildDiagnosticReport("web", options)).bundles[0].enabled).toBe(true);
  });
  it.each([[], ["first.yml", "missing.yml"], ["first.yml", 42]].map((patch) => [patch]))("does not hide invalid multi-file declarations: %j", async (patch) => {
    const { directory } = fixture(patch);
    const result = await buildDiagnosticReport("web", { profileDir: directory, document: emptyCatalog });
    expect(result.bundles[0].errorCode).toBe("patch-invalid");
  });
  it("matches a compact catalog through repository identity, without overriding conflicting package identity", async () => {
    const { directory } = fixture();
    const entry = { fullName: "dsh-market/dsh-market", name: "dsh-market" } as RankingsDocument["rankings"]["total"][number];
    const document = { ...emptyCatalog, rankings: { ...emptyCatalog.rankings, total: [entry] } };
    const matched = await buildDiagnosticReport("web", { profileDir: directory, document });
    expect(matched.bundles[0].catalogName).toBe(entry.fullName);
    expect(matched.findings.some((finding) => finding.code === "bundle-unlisted")).toBe(false);
    entry.install = { packageName: "another-package" };
    const conflict = await buildDiagnosticReport("web", { profileDir: directory, document });
    expect(conflict.bundles[0].catalogName).toBeNull();
  });
});
