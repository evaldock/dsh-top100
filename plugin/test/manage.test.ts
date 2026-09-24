import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zh } from "../src/client/locales.js";
import { fetchNpmLatest, listManagedPlugins, managedDescriptionZh, matchCatalogEntry, resolveUpdateTarget } from "../src/host/manage.js";
import type { RankingEntry, RankingsDocument } from "../src/shared/types.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("update version refresh", () => {
  it("reports a failed check separately from current and retains the actual cached check time", async () => {
    const directory = mkdtempSync(join(tmpdir(), "managed-status-"));
    vi.stubEnv("DSH_HOME", directory);
    try {
      const name = "status-network-fixture";
      mkdirSync(join(directory, "node_modules", name), { recursive: true });
      writeFileSync(join(directory, "package.json"), JSON.stringify({ dependencies: { [name]: "latest" } }));
      writeFileSync(join(directory, "node_modules", name, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
      const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(new Response(JSON.stringify({ version: "1.0.0" })));
      vi.stubGlobal("fetch", fetcher);
      const failed = (await listManagedPlugins("web", null, directory))[0];
      expect(failed).toMatchObject({ updateStatus: "failed", updateAvailable: false, latest: null, updateCheckedAt: expect.any(Number) });
      const recovered = (await listManagedPlugins("web", null, directory))[0];
      expect(recovered).toMatchObject({ updateStatus: "current", updateAvailable: false, latest: "1.0.0" });
      expect((await listManagedPlugins("web", null, directory))[0].updateCheckedAt).toBe(recovered.updateCheckedAt);
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("lets a recovered network retry immediately after failure", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: "2.0.0" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchNpmLatest("network-retry-fixture")).toBeNull();
    expect(await fetchNpmLatest("network-retry-fixture")).toBe("2.0.0");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes an explicitly requested version without waiting for cached metadata", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ version: "1.0.0" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: "2.0.0" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await fetchNpmLatest("refresh-version-fixture")).toBe("1.0.0");
    expect(await fetchNpmLatest("refresh-version-fixture")).toBe("1.0.0");
    expect(await fetchNpmLatest("refresh-version-fixture", true)).toBe("2.0.0");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("managed plugin updates", () => {
  it("resolves npm and GitHub update targets", () => {
    expect(resolveUpdateTarget("sample-plugin", "^1.0.0")).toBe("sample-plugin@^1.0.0");
    expect(resolveUpdateTarget("sample-plugin", "beta")).toBe("sample-plugin@beta");
    expect(resolveUpdateTarget("sample-plugin", "github:owner/repo#main")).toBe("github:owner/repo#main");
    expect(() => resolveUpdateTarget(
      "sample-plugin",
      `github:owner/repo#${"a".repeat(40)}&path:/packages/sample`,
    )).toThrow("无法确认原更新分支");
    expect(resolveUpdateTarget("sample-plugin", "github:owner/repo#path:/packages/sample"))
      .toBe("github:owner/repo#path:/packages/sample");
    expect(resolveUpdateTarget("sample-plugin", "github:owner/repo#path:packages/sample"))
      .toBe("github:owner/repo#path:/packages/sample");
  });

  it("does not overwrite local source links", () => {
    expect(resolveUpdateTarget("sample-plugin", "link:/tmp/sample")).toBeNull();
    expect(resolveUpdateTarget("sample-plugin", "file:../sample")).toBeNull();
  });
});

function catalogEntry(fullName: string, packageName?: string, repositoryPath?: string): RankingEntry {
  return {
    fullName, name: fullName.split("/")[1], owner: fullName.split("/")[0], rank: 1,
    description: "", descriptionZh: "", stars: 0, dailyStars: null, weeklyStars: null,
    hotScore: null, forks: 0, openIssues: 0, language: null, homepage: null, license: null,
    topics: [], tags: [], type: "cordis-plugin", sources: [], url: `https://github.com/${fullName}`,
    pushedAt: "", createdAt: "", updatedAt: "",
    install: { method: "pnpm-profile", packageName, repositoryPath, target: packageName ?? `github:${fullName}${repositoryPath ? `#path:/${repositoryPath}` : ""}` },
  };
}

function catalog(...entries: RankingEntry[]): RankingsDocument {
  return { schemaVersion: 1, generatedAt: "", snapshotDate: "", rankings: { total: entries, hot: [], rising: [] } };
}

describe("managed catalog identity", () => {
  it("never matches package or repository substrings", () => {
    const document = catalog(catalogEntry("other/git-enhancer", "git-enhancer"));
    expect(matchCatalogEntry(document, "git", "1.0.0", null)).toBeUndefined();
    expect(matchCatalogEntry(document, "unknown", "github:other/git", "other/git")).toBeUndefined();
  });

  it("matches exact npm package names and rejects conflicting repository metadata", () => {
    const entry = catalogEntry("acme/repository", "@acme/widget");
    expect(matchCatalogEntry(catalog(entry), "@acme/widget", "^1.0.0", null)).toBe(entry);
    expect(matchCatalogEntry(catalog(entry), "@acme/widget", "^1.0.0", "other/repository")).toBeUndefined();
  });

  it("matches a repository source and disambiguates monorepo subdirectories", () => {
    const root = catalogEntry("acme/repository");
    expect(matchCatalogEntry(catalog(root), "widget", "github:acme/repository#main", null)).toBe(root);
    const first = catalogEntry("acme/mono", undefined, "packages/first");
    const second = catalogEntry("acme/mono", undefined, "packages/second");
    const document = catalog(first, second);
    expect(matchCatalogEntry(document, "widget", "github:acme/mono", null)).toBeUndefined();
    expect(matchCatalogEntry(document, "widget", "github:acme/mono#path:/packages/second", null)).toBe(second);
    expect(matchCatalogEntry(document, "widget", `github:acme/mono#${"a".repeat(40)}&path:/packages/first`, null)).toBe(first);
  });

  it("does not guess when multiple entries declare the same npm package", () => {
    expect(matchCatalogEntry(catalog(
      catalogEntry("acme/first", "widget"), catalogEntry("acme/second", "widget"),
    ), "widget", "^1.0.0", null)).toBeUndefined();
  });
});

describe("managed plugin Chinese summaries", () => {
  it("prefers an explicit Chinese catalog description", () => {
    expect(managedDescriptionZh({
      kind: "bundle",
      name: "example-plugin",
      descriptionZh: "用于整理知识库的插件",
      descriptions: ["Knowledge base organizer"],
    })).toBe("用于整理知识库的插件");
  });

  it("exposes Chinese management titles, states, kinds, and actions", () => {
    expect(zh.installedManagerTitle).toBe("已安装插件管理");
    expect(zh.enabled).toBe("配置已启用");
    expect(zh.disabled).toBe("配置已停用");
    expect(zh.bundleKind).toContain("插件");
    expect(zh.skillKind).toContain("技能");
    expect([zh.enable, zh.disable, zh.update, zh.uninstall]).toEqual(["启用", "停用", "更新", "卸载"]);
  });

  it("keeps author-supplied Chinese text when descriptionZh is absent", () => {
    expect(managedDescriptionZh({
      kind: "skill",
      name: "daily-report",
      descriptions: ["生成每日项目简报"],
    })).toBe("生成每日项目简报");
  });

  it("uses an honest Chinese inventory fallback instead of translating English", () => {
    expect(managedDescriptionZh({
      kind: "bundle",
      name: "acme-search",
      descriptions: ["Search across private documents"],
    })).toBe("已安装的 DSH 插件：acme-search。暂无中文简介。");
    expect(managedDescriptionZh({
      kind: "skill",
      name: "daily-report",
      descriptions: [],
    })).toBe("已安装的本地技能（Skill）：daily-report。暂无中文简介。");
  });
});

it('managed catalog summaries follow server updates and cannot recover installed stale prose', async () => {
  const directory=mkdtempSync(join(tmpdir(),'managed-description-'));
  vi.stubEnv('DSH_HOME',directory);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({version:'1.0.0'}))));
  const name='managed-description-fixture';
  try {
    mkdirSync(join(directory,'node_modules',name),{recursive:true});
    writeFileSync(join(directory,'package.json'),JSON.stringify({dependencies:{[name]:'1.0.0'}}));
    writeFileSync(join(directory,'node_modules',name,'package.json'),JSON.stringify({name,version:'1.0.0',description:'旧的插件描述会恢复已经撤回的功能。'}));
    const entry={...catalogEntry('fixture/managed',name),descriptionPolicy:'server-v1' as const,descriptionZh:'服务端更新的插件介绍，可读取网页内容。'};
    expect((await listManagedPlugins('web',catalog(entry),directory))[0].descriptionZh).toBe(entry.descriptionZh);
    entry.descriptionZh='';
    expect((await listManagedPlugins('web',catalog(entry),directory))[0].descriptionZh).toBe('中文简介待生成。');
    expect((await listManagedPlugins('web',null,directory))[0].descriptionZh).toContain('暂无中文简介');
    const stale = { ...entry, descriptionZh: '上次已核实的插件介绍。',
      descriptionStatus: { state: 'stale' as const, reviewedAt: '2026-09-16', reason: '来源核查中' } };
    const staleManaged = (await listManagedPlugins('web', catalog(stale), directory))[0].descriptionZh;
    expect(staleManaged).toContain('2026-09-16 核对');
    expect(staleManaged).toContain(stale.descriptionZh);
    const held={...entry,descriptionZh:'已撤回的旧介绍。',descriptionStatus:{state:'review-required' as const,reason:'正在复核'}};
    expect((await listManagedPlugins('web',catalog(held),directory))[0].descriptionZh).toBe('中文简介待复核：正在复核');
  } finally {rmSync(directory,{recursive:true,force:true});}
});
