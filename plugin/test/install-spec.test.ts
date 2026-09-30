import { describe, expect, it } from "vitest";
import {
  isCordisEntry,
  isInstalledEntry,
  npmPackageSpec,
  parseInstallSpec,
  resolveInstallSpec,
} from "../src/install/install-spec.js";
import type { InstallProvenance, RankingEntry } from "../src/shared/types.js";

function entry(partial: Partial<RankingEntry> & Pick<RankingEntry, "fullName" | "type">): RankingEntry {
  return {
    rank: 1,
    name: partial.fullName.split("/")[1] ?? "plugin",
    owner: partial.fullName.split("/")[0] ?? "owner",
    description: "",
    descriptionZh: "",
    stars: 1,
    dailyStars: 0,
    weeklyStars: 0,
    hotScore: 0,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    tags: [],
    sources: [],
    url: `https://github.com/${partial.fullName}`,
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("parseInstallSpec", () => {
  it("accepts npm package names and github specs", () => {
    expect(parseInstallSpec("dshmarket")).toEqual({ kind: "npm", spec: "dshmarket" });
    expect(parseInstallSpec("@liustack/modlens")).toEqual({ kind: "npm", spec: "@liustack/modlens" });
    expect(parseInstallSpec("npm:@kenz1117/dsh-ui-usage-billing@latest")).toEqual({ kind: "npm", spec: "@kenz1117/dsh-ui-usage-billing@latest" });
    expect(parseInstallSpec("dsh-better-sidebar@latest")).toEqual({
      kind: "npm",
      spec: "dsh-better-sidebar@latest",
    });
    expect(parseInstallSpec("@acme/plugin@1.2.3-rc.1")).toEqual({
      kind: "npm",
      spec: "@acme/plugin@1.2.3-rc.1",
    });
    expect(parseInstallSpec("github:owner/repo#abc123")).toEqual({
      kind: "github",
      spec: "github:owner/repo#abc123",
    });
    expect(parseInstallSpec("github:owner/repo#path:/packages/plugin")).toEqual({
      kind: "github",
      spec: "github:owner/repo#path:/packages/plugin",
    });
  });

  it("rejects shell metacharacters, flags, and non-plugin URLs", () => {
    expect(parseInstallSpec("dshmarket && rm -rf /")).toBeNull();
    expect(parseInstallSpec("github:owner/repo;id")).toBeNull();
    expect(parseInstallSpec("https://evil.example/pkg")).toBeNull();
    expect(parseInstallSpec("link:/tmp/plugin")).toBeNull();
    expect(parseInstallSpec("--yes")).toBeNull();
    expect(parseInstallSpec("plugin@^1.0.0 && id")).toBeNull();
  });

  it.each(["^1.0.0", "~0.2.1", ">=1.0.0 <2.0.0", "1.x || 2.x", "1.2.0 - 1.8.0", "*"])("accepts the standard npm range %s for internal verification", (selector) => {
    expect(parseInstallSpec(`@acme/plugin@${selector}`)).toEqual({ kind: "npm", spec: `@acme/plugin@${selector}` });
    expect(npmPackageSpec(`@acme/plugin@${selector}`)).toEqual({ name: "@acme/plugin", selector });
  });

  it("separates an npm package name from its tag or exact version", () => {
    expect(npmPackageSpec("dshmarket")).toEqual({ name: "dshmarket", selector: null });
    expect(npmPackageSpec("@acme/plugin@next")).toEqual({ name: "@acme/plugin", selector: "next" });
  });
});

describe("resolveInstallSpec", () => {
  it("uses a Web installation source in Desktop without carrying the author's destination", () => {
    const plugin = entry({ fullName: "acme/demo", type: "cordis-plugin", install: { packageName: "demo", commands: ["dsh plugin --profile web add --save-exact demo@1.2.3"] } });
    expect(resolveInstallSpec(plugin, "desktop")).toEqual({ kind: "npm", spec: "demo@1.2.3" });
    expect(resolveInstallSpec(plugin, "research")).toBeNull();
  });
  it("does not relax custom Profiles or registries for Desktop", () => {
    for (const command of ["dsh plugin --profile research add demo", "dsh plugin --profile web add demo --registry https://private.example/"]) {
      const plugin = entry({ fullName: "acme/demo", type: "cordis-plugin", install: { packageName: "demo", commands: [command] } });
      expect(resolveInstallSpec(plugin, "desktop")).toBeNull();
    }
  });
  it("respects a caller's actual custom Profile", () => {
    const plugin = entry({ fullName: "acme/demo", type: "cordis-plugin", install: { packageName: "demo", commands: ["dsh plugin --profile demo add demo"] } });
    expect(resolveInstallSpec(plugin)).toBeNull();
    expect(resolveInstallSpec(plugin, "demo")).toEqual({ kind: "npm", spec: "demo" });
  });
  it.each([
    ["NanmiCoder/dsh-agent-teams", "@nanmicoder/dsh-agent-teams", "dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.16-rc.1", "@nanmicoder/dsh-agent-teams@0.1.16-rc.1"],
    ["xmanrui/dsh-im", "@xmanrui/dsh-im", "dsh plugin --profile web add -w @xmanrui/dsh-im", "@xmanrui/dsh-im"],
    ["kenz1117/dsh-ui-usage-billing", "@kenz1117/dsh-ui-usage-billing", "dsh plugin add npm:@kenz1117/dsh-ui-usage-billing@latest", "@kenz1117/dsh-ui-usage-billing@latest"],
    ["liangmianya/dsh-synapse", "dsh-synapse", "corepack pnpm dsh plugin --profile web add dsh-synapse", "dsh-synapse"],
    ["MichengAI/dsh-skills-manager", "@michengai/dsh-skills-manager", "dsh plugin --profile web add @michengai/dsh-skills-manager@latest --registry=https://registry.npmjs.org/", "@michengai/dsh-skills-manager@latest"],
  ])("recognizes verified Top100 author syntax without executing it: %s", (fullName, packageName, command, spec) => {
    expect(resolveInstallSpec(entry({ fullName, type: "cordis-plugin", install: { packageName, commands: [command] } }))).toEqual({ kind: "npm", spec });
  });
  it("selects the current repository rather than the prerequisite market", () => {
    const plugin = entry({
      fullName: "e2mcc/dsh-popout-sidebar",
      type: "cordis-plugin",
      install: { commands: [
        "dsh plugin --profile web add dshmarket",
        "dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar",
      ] },
    });
    expect(resolveInstallSpec(plugin)).toEqual({ kind: "github", spec: "github:e2mcc/dsh-popout-sidebar" });
    expect(isInstalledEntry(plugin, { dshmarket: "1.40.0" })).toBe(false);
  });

  it("rejects foreign repositories and npm commands without matching package metadata", () => {
    for (const command of ["dsh plugin add github:other/demo", "dsh plugin add dshmarket"]) {
      expect(resolveInstallSpec(entry({ fullName: "acme/demo", type: "cordis-plugin", install: { commands: [command] } }))).toBeNull();
    }
    expect(resolveInstallSpec(entry({
      fullName: "acme/demo", type: "cordis-plugin",
      install: { packageName: "@acme/demo", commands: ["dsh plugin add dshmarket", "dsh plugin add @acme/demo@latest"] },
    }))).toEqual({ kind: "npm", spec: "@acme/demo@latest" });
  });

  it("rejects a command with extra tokens rather than truncating it to a package", () => {
    expect(resolveInstallSpec(entry({
      fullName: "acme/demo", type: "cordis-plugin",
      install: { packageName: "demo", commands: ["dsh plugin add demo && echo unsafe"] },
    }))).toBeNull();
  });

  it("accepts a structured command matching the selected package", () => {
    const spec = resolveInstallSpec(
      entry({
        fullName: "acme/demo",
        type: "skill",
        install: {
          method: "skills-add",
          packageName: "@acme/demo",
          commands: ["dsh plugin --profile web add @acme/demo"],
        },
      }),
    );
    expect(spec).toEqual({ kind: "npm", spec: "@acme/demo" });
  });

  it("keeps cordis entries without an author-provided add command browse-only", () => {
    expect(
      resolveInstallSpec(entry({ fullName: "acme/dsh-demo", type: "cordis-plugin" })),
    ).toBeNull();
  });

  it("preserves an npm tag from an author-provided add command", () => {
    expect(resolveInstallSpec(entry({
      fullName: "acme/dsh-demo",
      type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "@acme/dsh-demo", commands: ["dsh plugin --profile web add @acme/dsh-demo@latest"] },
    }))).toEqual({ kind: "npm", spec: "@acme/dsh-demo@latest" });
  });

  it("falls back to github:owner/repo for catalogued skills", () => {
    expect(
      resolveInstallSpec(
        entry({
          fullName: "titanwings/colleague-skill",
          type: "skill",
          install: {
            method: "skills-add",
            commands: ["git clone https://github.com/titanwings/colleague-skill <TARGET>"],
          },
        }),
      ),
    ).toEqual({ kind: "github", spec: "github:titanwings/colleague-skill" });
  });
});

describe("installed matching", () => {
  const recorded: InstallProvenance = {
    source: "npm", requestedTarget: "@acme/theme", resolvedTarget: "@acme/theme@0.5.0", packageName: "@acme/theme",
    version: "0.5.0", commit: null, integrity: "sha512-test", verifiedAt: 1,
    repositoryUrl: "https://github.com/acme/theme-repo", repositoryIdentity: "matched",
  };
  const manifest = { name: "@acme/theme", version: "0.5.0", repository: { url: "git+https://github.com/acme/theme-repo.git" } };
  const compact = () => entry({ fullName: "acme/theme-repo", type: "cordis-plugin", install: { commands: ["dsh plugin add github:acme/theme-repo"] } });
  it("binds a compact GitHub entry to the exact npm package installed from verified provenance", () => {
    expect(isInstalledEntry(compact(), { "@acme/theme": "0.5.0" })).toBe(false);
    expect(isInstalledEntry(compact(), { "@acme/theme": "0.5.0" }, "web", { "@acme/theme": { manifest, provenance: recorded } })).toBe(true);
  });
  it.each([
    { version: "0.4.0" }, { packageName: "@acme/other" }, { resolvedTarget: "@acme/other@0.5.0" },
    { repositoryUrl: "https://github.com/acme/other" }, { repositoryIdentity: "unavailable" as const }, { integrity: null },
  ])("does not use stale or mismatched provenance %j", (changed) => {
    expect(isInstalledEntry(compact(), { "@acme/theme": "0.5.0" }, "web", { "@acme/theme": { manifest, provenance: { ...recorded, ...changed } } })).toBe(false);
  });
  it("requires unchanged dependency, installed manifest, and unambiguous package scope", () => {
    const evidence = { "@acme/theme": { manifest, provenance: recorded } };
    expect(isInstalledEntry(compact(), { "@acme/theme": "^0.5.0" }, "web", evidence)).toBe(false);
    expect(isInstalledEntry(compact(), { "@acme/theme": "0.5.0" }, "web", { "@acme/theme": { manifest: { ...manifest, version: "0.6.0" }, provenance: recorded } })).toBe(false);
    expect(isInstalledEntry({ ...compact(), install: { repositoryPath: "packages/other" } }, { "@acme/theme": "0.5.0" }, "web", evidence)).toBe(false);
    expect(isInstalledEntry({ ...compact(), install: { packageName: "@acme/other" } }, { "@acme/theme": "0.5.0" }, "web", evidence)).toBe(false);
  });
  it("matches npm names and github dependency specs", () => {
    const plugin = entry({ fullName: "dsh-market/dsh-market", type: "cordis-plugin" });
    expect(isInstalledEntry(plugin, { dshmarket: "^1.15.0" })).toBe(false);
    expect(isInstalledEntry(plugin, { "dsh-market": "github:dsh-market/dsh-market#main" })).toBe(true);
    expect(isCordisEntry(plugin)).toBe(true);
  });

  it("does not confuse a package with a longer package name containing it", () => {
    const plugin = entry({
      fullName: "acme/demo",
      type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "demo", commands: ["dsh plugin --profile web add demo"] },
    });
    expect(isInstalledEntry(plugin, { "demo-helper": "1.0.0" })).toBe(false);
  });
});
