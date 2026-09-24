import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiagnosticReport } from "../src/host/diagnose.js";
import { recordInstallProvenance } from "../src/host/provenance.js";
import type { InstallPreflight, RankingEntry, RankingsDocument } from "../src/shared/types.js";

const document: RankingsDocument = {
  schemaVersion: 1, generatedAt: "2026-09-10T00:00:00.000Z", snapshotDate: "2026-09-10",
  rankings: { hot: [], rising: [], total: [] },
};
const originalArgv = process.argv;
const directories: string[] = [];
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function packageAt(directory: string, name: string, version: string, extra = {}) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    name, version, main: "./index.js", exports: { ".": "./index.js" },
    dsh: { bundle: { patch: "./cordis.patch.yml" } }, ...extra,
  }));
  writeFileSync(join(directory, "cordis.patch.yml"), "[]\n");
  writeFileSync(join(directory, "index.js"), "throw new Error('Diagnostics must not execute package code');\n");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dsh-diagnose-resolution-"));
  directories.push(root);
  vi.stubEnv("DSH_HOME", join(root, "home"));
  const profile = join(root, "profile");
  const hostModules = join(root, "_npx", "example", "node_modules");
  const host = join(hostModules, "@deepseek-ai/dsh");
  packageAt(host, "@deepseek-ai/dsh", "1.0.0");
  process.argv = [originalArgv[0], join(host, "lib/bin.js")];
  mkdirSync(profile, { recursive: true });
  writeFileSync(join(profile, "package.json"), JSON.stringify({
    dependencies: { "resolution-demo": "1.0.0" },
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "resolution-demo"] } },
  }));
  packageAt(join(profile, "node_modules/resolution-demo"), "resolution-demo", "1.0.0", {
    peerDependencies: { "@deepseek-ai/dsh-settings": "^1.0.0" },
  });
  return { root, profile, hostModules, host };
}

describe("diagnostic host package lookup", () => {
  it.each(["0.5.0", "0.6.0"])("binds compact catalog recognition to the recorded npm version (installed %s)", async (version) => {
    const { profile } = fixture();
    const name = "@acme/theme", fullName = "acme/theme-repo";
    writeFileSync(join(profile, "package.json"), JSON.stringify({ dependencies: { [name]: version }, dsh: { profile: { bundles: [name] } } }));
    packageAt(join(profile, "node_modules", name), name, version, { repository: "https://github.com/acme/theme-repo" });
    const approval: InstallPreflight = { approvalToken: "test", expiresAt: 1, fullName, profile: "web", kind: "bundle", lifecycleScripts: [], risks: [], requiresExplicitApproval: false, activationExpectation: "restart-required", provenance: { source: "npm", requestedTarget: name, resolvedTarget: `${name}@0.5.0`, packageName: name, version: "0.5.0", commit: null, integrity: "sha512-test", verifiedAt: 1, repositoryIdentity: "matched", repositoryUrl: "https://github.com/acme/theme-repo" } };
    recordInstallProvenance({ profile: "web", profileDirectory: profile, dataUrl: "" }, approval);
    const compact = { fullName, type: "cordis-plugin", install: { commands: [`dsh plugin add github:${fullName}`] } } as RankingEntry;
    const catalog = { ...document, rankings: { total: [compact], hot: [compact], rising: [] } };
    const report = await buildDiagnosticReport("web", { profileDir: profile, document: catalog, now: Date.parse(document.generatedAt) });
    expect(report.bundles[0].catalogName).toBe(version === "0.5.0" ? fullName : null);
    expect(report.findings.some((finding) => finding.code === "bundle-unlisted")).toBe(version !== "0.5.0");
  });
  it("uses verified repository identity to distinguish forks sharing one npm name", async () => {
    const { profile } = fixture();
    const name = "@acme/theme", fullName = "acme/theme-repo";
    writeFileSync(join(profile, "package.json"), JSON.stringify({ dependencies: { [name]: "0.5.0" }, dsh: { profile: { bundles: [name] } } }));
    packageAt(join(profile, "node_modules", name), name, "0.5.0", { repository: `https://github.com/${fullName}` });
    recordInstallProvenance({ profile: "web", profileDirectory: profile, dataUrl: "" }, {
      approvalToken: "test", expiresAt: 1, fullName, profile: "web", kind: "bundle", lifecycleScripts: [], risks: [], requiresExplicitApproval: false, activationExpectation: "restart-required",
      provenance: { source: "npm", requestedTarget: name, resolvedTarget: `${name}@0.5.0`, packageName: name, version: "0.5.0", commit: null, integrity: "sha512-test", verifiedAt: 1, repositoryIdentity: "matched", repositoryUrl: `https://github.com/${fullName}` },
    });
    const entries = [fullName, "fork/theme-repo"].map((repo) => ({ fullName: repo, type: "cordis-plugin", install: { packageName: name } } as RankingEntry));
    const report = await buildDiagnosticReport("web", { profileDir: profile, document: { ...document, rankings: { total: entries, hot: [], rising: [] } } });
    expect(report.bundles[0].catalogName).toBe(fullName);
  });
  it("finds npm/npx hoisted inbox bundles and peer fallbacks without requiring their entrypoints", async () => {
    const { profile, hostModules } = fixture();
    const base = join(hostModules, "@deepseek-ai/dsh-base");
    packageAt(base, "@deepseek-ai/dsh-base", "1.2.0");
    packageAt(join(hostModules, "@deepseek-ai/dsh-settings"), "@deepseek-ai/dsh-settings", "1.3.0");
    const report = await buildDiagnosticReport("web", { profileDir: profile, document, now: Date.parse(document.generatedAt) });
    expect(report.bundles.find((bundle) => bundle.name === "@deepseek-ai/dsh-base")).toMatchObject({ directory: base, version: "1.2.0", error: null });
    expect(report.peers).toContainEqual({ plugin: "resolution-demo", name: "@deepseek-ai/dsh-settings", range: "^1.0.0", resolved: "1.3.0", satisfied: true });
    expect(report.findings.filter((finding) => ["bundle-unresolved", "peer-missing"].includes(finding.code))).toEqual([]);
  });

  it("preserves Profile precedence over both nested and hoisted host packages", async () => {
    const { profile, host, hostModules } = fixture();
    for (const [modules, version] of [[join(profile, "node_modules"), "1.1.0"], [join(host, "node_modules"), "1.2.0"], [hostModules, "1.3.0"]]) {
      packageAt(join(modules, "@deepseek-ai/dsh-base"), "@deepseek-ai/dsh-base", version);
      packageAt(join(modules, "@deepseek-ai/dsh-settings"), "@deepseek-ai/dsh-settings", version);
    }
    const report = await buildDiagnosticReport("web", { profileDir: profile, document, now: Date.parse(document.generatedAt) });
    expect(report.bundles.find((bundle) => bundle.name === "@deepseek-ai/dsh-base")?.version).toBe("1.1.0");
    expect(report.peers[0]?.resolved).toBe("1.1.0");
  });

  it("uses a host-local dependency before a hoisted sibling", async () => {
    const { profile, host, hostModules } = fixture();
    packageAt(join(host, "node_modules/@deepseek-ai/dsh-base"), "@deepseek-ai/dsh-base", "1.2.0");
    packageAt(join(hostModules, "@deepseek-ai/dsh-base"), "@deepseek-ai/dsh-base", "1.3.0");
    const report = await buildDiagnosticReport("web", { profileDir: profile, document, now: Date.parse(document.generatedAt) });
    expect(report.bundles.find((bundle) => bundle.name === "@deepseek-ai/dsh-base")?.version).toBe("1.2.0");
  });
});
