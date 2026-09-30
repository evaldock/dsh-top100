import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeCatalogFetchError,
  catalogScopeCounts,
  filterCatalog,
  filteredCatalogCategories,
  findPublishedEntry,
  invalidateCatalog,
  isRetryableCatalogFetchError,
  loadCatalogMetadata,
  loadCachedRankings,
  loadRankingManifest,
  loadRankingView,
  loadRankings,
  loadSearchRankings,
  loadSkillRankings,
  matchesQuery,
  parseRankingViewDocument,
  parseRankingSearchDocument,
  parseRankingManifest,
  parseRankingsDocument,
} from "../src/host/catalog.js";
import type { InstallProvenance, RankingEntry, RankingsDocument } from "../src/shared/types.js";

function entry(fullName: string, extra: Partial<RankingEntry> = {}): RankingEntry {
  return {
    rank: extra.rank ?? 1,
    fullName,
    name: fullName.split("/")[1] ?? fullName,
    owner: fullName.split("/")[0] ?? "owner",
    description: extra.description ?? "English summary",
    descriptionPolicy: 'server-v1',
    descriptionZh: extra.descriptionZh ?? "中文简介",
    stars: extra.stars ?? 10,
    dailyStars: 0,
    weeklyStars: extra.weeklyStars ?? 0,
    hotScore: 1,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: extra.topics ?? [],
    tags: extra.tags ?? [],
    type: extra.type ?? "skill",
    sources: [],
    url: `https://github.com/${fullName}`,
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const document: RankingsDocument = {
  schemaVersion: 1,
  generatedAt: "2026-08-22T00:00:00.000Z",
  snapshotDate: "2026-08-22",
  rankings: {
    hot: [entry("acme/hot-one", {
      rank: 1,
      type: "cordis-plugin",
      install: { method: "pnpm-profile", packageName: "@acme/hot-one", commands: ["dsh plugin --profile web add @acme/hot-one"] },
    })],
    rising: [entry("acme/rise-one", { rank: 1, tags: ["memory"] })],
    total: [
      entry("acme/hot-one", {
        rank: 2,
        type: "cordis-plugin",
        install: { method: "pnpm-profile", packageName: "@acme/hot-one", commands: ["dsh plugin --profile web add @acme/hot-one"] },
      }),
      entry("acme/rise-one", { rank: 3, tags: ["memory"] }),
      entry("other/search-me", { rank: 4, descriptionZh: "检索助手" }),
    ],
  },
};

function json(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function reference(url: string, raw: string, count: number, page?: number) {
  return {
    ...(page === undefined ? {} : { page }),
    url,
    count,
    bytes: Buffer.byteLength(raw),
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function v2Publication() {
  const snapshotId = "2026-08-22-0123456789abcdef";
  const prefix = `/data/snapshots/${snapshotId}`;
  const base = {
    schemaVersion: 2,
    snapshotId,
    generatedAt: document.generatedAt,
    snapshotDate: document.snapshotDate,
  };
  const hotRaw = json({ ...base, dataset: "hot", total: 1, rankings: document.rankings.hot });
  const risingRaw = json({ ...base, dataset: "rising", total: 1, rankings: document.rankings.rising });
  const skillRankings = [entry("acme/skill-only", { rank: 1, type: "skill", categories: ["tools"] })];
  const skillsRaw = json({ ...base, dataset: "skills", total: 1, rankings: skillRankings });
  const searchRankings = document.rankings.total.map((item) => ({
    rank: item.rank,
    fullName: item.fullName,
    name: item.name,
    description: item.description,
    descriptionZh: item.descriptionZh,
    stars: item.stars,
    tags: item.tags,
    categories: item.categories ?? [],
    type: item.type,
    ...(item.install?.commands?.[0] ? {
      installTarget: item.install.commands[0].split(" ").at(-1),
      installPackageName: item.install.packageName,
    } : {}),
  }));
  const searchRaw = json({ ...base, dataset: "search", total: searchRankings.length, rankings: searchRankings });
  const totalRaw = json({
    ...base,
    dataset: "total",
    page: 1,
    pageSize: 100,
    pageCount: 1,
    total: document.rankings.total.length,
    rankings: document.rankings.total,
  });
  const manifest = {
    ...base,
    pageSize: 100,
    definitions: { total: "stars", rising: "growth", hot: "composite" },
    datasets: {
      hot: reference(`${prefix}/hot.json`, hotRaw, 1),
      rising: reference(`${prefix}/rising.json`, risingRaw, 1),
      skills: reference(`${prefix}/skills.json`, skillsRaw, 1),
      search: reference(`${prefix}/search.json`, searchRaw, searchRankings.length),
      total: {
        count: document.rankings.total.length,
        skillCount: document.rankings.total.filter((item) => item.type === "skill").length,
        pageSize: 100,
        pageCount: 1,
        pages: [reference(`${prefix}/total/page-001.json`, totalRaw, document.rankings.total.length, 1)],
      },
    },
    categories: [],
  };
  const manifestRaw = json(manifest);
  const responses = new Map<string, string>([
    ["https://catalog.example/data/manifest.json", manifestRaw],
    [`https://catalog.example${prefix}/hot.json`, hotRaw],
    [`https://catalog.example${prefix}/rising.json`, risingRaw],
    [`https://catalog.example${prefix}/skills.json`, skillsRaw],
    [`https://catalog.example${prefix}/search.json`, searchRaw],
    [`https://catalog.example${prefix}/total/page-001.json`, totalRaw],
  ]);
  return { manifest, manifestRaw, responses };
}

function fetchPublication(publication: ReturnType<typeof v2Publication>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const raw = publication.responses.get(url);
    return raw === undefined
      ? new Response("not found", { status: 404, statusText: "Not Found" })
      : new Response(raw, { status: 200, headers: { "content-type": "application/json" } });
  });
}

const temporaryCaches: string[] = [];
const originalCacheDirectory = process.env.DSH_TOP100_CACHE_DIR;

afterEach(async () => {
  invalidateCatalog();
  vi.unstubAllGlobals();
  if (originalCacheDirectory === undefined) delete process.env.DSH_TOP100_CACHE_DIR;
  else process.env.DSH_TOP100_CACHE_DIR = originalCacheDirectory;
  await Promise.all(temporaryCaches.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("catalog filter", () => {
  it("excludes our project from legacy snapshot views, search and category/scope counts", () => {
    const own = entry("DSHEval/DSH-Top100", { type: "cordis-plugin", categories: ["tools"] });
    const peer = entry("other/dsh-top100", { type: "cordis-plugin", categories: ["tools"] });
    const legacy = { ...document, rankings: { total: [own, peer], hot: [own, peer], rising: [own, peer] } };
    for (const view of ["total", "hot", "rising"] as const) {
      for (const query of ["", "dsh-top100"]) {
        const result = filterCatalog(legacy, { view, query, category: null, offset: 0, limit: 100, installed: {} });
        expect(result.items.map(({ fullName }) => fullName)).toEqual([peer.fullName]);
        expect(result.total).toBe(1);
      }
    }
    expect(catalogScopeCounts(legacy)).toEqual(catalogScopeCounts({ ...legacy, rankings: { ...legacy.rankings, total: [peer] } }));
    expect(filteredCatalogCategories(legacy, {}).find(({ id }) => id === "tools")?.count).toBe(1);
    expect(legacy.rankings.total).toEqual([own, peer]);
  });

  it("shows a compact Git source as installed after a verified npm installation of that catalog entry", () => {
    const plugin = entry("acme/theme-repo", { type: "cordis-plugin", install: { commands: ["dsh plugin add github:acme/theme-repo"] } });
    const provenance: InstallProvenance = { source: "npm", requestedTarget: "@acme/theme", resolvedTarget: "@acme/theme@0.5.0", packageName: "@acme/theme", version: "0.5.0", commit: null, integrity: "sha512-test", verifiedAt: 1, repositoryIdentity: "matched", repositoryUrl: "https://github.com/acme/theme-repo" };
    const scoped = { ...document, rankings: { total: [plugin], hot: [plugin], rising: [] } };
    const result = filterCatalog(scoped, { view: "total", category: null, query: "", offset: 0, limit: 10, installed: { "@acme/theme": "0.5.0" }, installedEvidence: { "@acme/theme": { manifest: { name: "@acme/theme", version: "0.5.0", repository: provenance.repositoryUrl }, provenance } } });
    expect(result.items[0].installed).toBe(true);
  });
  it("keeps availability, source evidence and annotations consistent with the actual Profile", () => {
    const plugin = entry("acme/demo", { type: "cordis-plugin", install: { packageName: "demo", commands: ["dsh plugin --profile research add demo"] } });
    const scoped = { ...document, rankings: { total: [plugin], hot: [plugin], rising: [] } };
    const options = { view: "total" as const, category: null, query: "", offset: 0, limit: 10, installed: { demo: "1.0.0" }, installAvailability: "installable" as const };
    expect(filterCatalog(scoped, options).total).toBe(0);
    const result = filterCatalog(scoped, { ...options, profile: "research" });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ installable: true, installed: true, installSpec: { kind: "npm", spec: "demo" } });
    expect(result.items[0].evidence?.signalCodes).toContain("install-source");
  });
  it("offers Web-documented plugins in the Desktop installable filter", () => {
    const result = filterCatalog(document, { view: "hot", category: null, query: "", offset: 0, limit: 10, installed: {}, profile: "desktop", installAvailability: "installable" });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ fullName: "acme/hot-one", installable: true, installSpec: { kind: "npm", spec: "@acme/hot-one" } });
  });
  it("returns the selected view when there is no query", () => {
    const result = filterCatalog(document, {
      view: "hot",
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.total).toBe(1);
    expect(result.items[0]?.fullName).toBe("acme/hot-one");
    expect(result.items[0]?.installable).toBe(true);
  });

  it("searches the full catalog once a query is present", () => {
    const result = filterCatalog(document, {
      view: "hot",
      category: null,
      query: "检索",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["other/search-me"]);
  });

  it("does not advertise one-click install without an explicit trusted add target", () => {
    const result = filterCatalog({
      ...document,
      rankings: { ...document.rankings, hot: [entry("acme/browse-only", { type: "cordis-plugin" })] },
    }, {
      view: "hot",
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items[0]?.installable).toBe(false);
    expect(result.items[0]?.installSpec).toBeNull();
  });

  it("can hide Skill entries without changing the category taxonomy", () => {
    const result = filterCatalog(document, {
      view: "total",
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
      excludeSkills: true,
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/hot-one"]);
    expect(result.total).toBe(1);
    expect(result.excludedSkillCount).toBe(2);
  });

  it("partitions project type independently from installation availability", () => {
    const scoped: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/installable", {
            type: "cordis-plugin",
            install: { method: "pnpm-profile", packageName: "@acme/installable", commands: ["dsh plugin --profile web add @acme/installable"] },
          }),
          entry("acme/skill", { type: "skill" }),
          entry("acme/no-source", { type: "cordis-plugin" }),
          entry("acme/ecosystem", { type: "project", description: "Desktop companion for DSH" }),
        ],
      },
    };
    const common = {
      view: "total" as const,
      category: null,
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    };

    expect(filterCatalog(scoped, { ...common, catalogScope: "plugins" }).items.map(({ fullName }) => fullName))
      .toEqual(["acme/installable", "acme/no-source"]);
    expect(filterCatalog(scoped, { ...common, catalogScope: "skills" }).items.map(({ fullName }) => fullName))
      .toEqual(["acme/skill"]);
    expect(filterCatalog(scoped, { ...common, catalogScope: "ecosystem" }).items.map(({ fullName }) => fullName))
      .toEqual(["acme/ecosystem"]);
    expect(catalogScopeCounts(scoped)).toEqual({ plugins: 2, skills: 1, ecosystem: 1 });
    expect(filterCatalog(scoped, {
      ...common,
      catalogScope: "plugins",
      installAvailability: "installable",
    }).items.map(({ fullName }) => fullName)).toEqual(["acme/installable"]);
    expect(filterCatalog(scoped, {
      ...common,
      catalogScope: "plugins",
      installAvailability: "unavailable",
    }).items.map(({ fullName }) => fullName)).toEqual(["acme/no-source"]);
  });

  it("keeps category counts inside the active marketplace scope", () => {
    const scoped: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/installable", {
            type: "cordis-plugin",
            categories: ["ai"],
            install: { method: "pnpm-profile", packageName: "@acme/installable", commands: ["dsh plugin --profile web add @acme/installable"] },
          }),
          entry("acme/ecosystem", { type: "cordis-plugin", categories: ["ai"] }),
        ],
      },
    };
    const categories = filteredCatalogCategories(scoped, {
      compatibleOnly: true,
      catalogScope: "plugins",
    });
    expect(categories.find(({ id }) => id === "ai")?.count).toBe(2);
  });

  it("keeps category counts aligned with Skill and compatibility filters", () => {
    const categorized: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/plugin", { type: "cordis-plugin", categories: ["ai"] }),
          entry("acme/skill", { type: "skill", categories: ["ai", "knowledge"] }),
          entry("acme/app", { type: "project", description: "Desktop companion", categories: ["ai"] }),
        ],
      },
    };
    const categories = filteredCatalogCategories(categorized, {
      excludeSkills: true,
      compatibleOnly: true,
    });
    expect(categories.find(({ id }) => id === "ai")).toMatchObject({
      count: 1,
      excludedSkillCount: 1,
    });
    expect(categories.find(({ id }) => id === "knowledge")).toMatchObject({
      count: 0,
      excludedSkillCount: 1,
    });
  });

  it("keeps ecosystem candidates out of the default compatible scope", () => {
    const scoped: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/plugin", { type: "cordis-plugin" }),
          entry("acme/desktop", { type: "project", description: "Electron desktop app for DSH" }),
        ],
      },
    };
    const result = filterCatalog(scoped, {
      view: "total", category: null, query: "", offset: 0, limit: 10, installed: {}, compatibleOnly: true,
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/plugin"]);
    expect(result.items[0]?.evidence).toMatchObject({ formFactor: "dsh-bundle", trustLevel: "structured" });
  });

  it("paginates and marks installed github specs", () => {
    const result = filterCatalog(document, {
      view: "total",
      category: null,
      query: "",
      offset: 1,
      limit: 1,
      installed: { "rise-one": "github:acme/rise-one" },
    });
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(matchesQuery(document.rankings.total[1], "memory")).toBe(true);
  });

  it("uses the same category assignments as the published website data", () => {
    const categorized: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/agent", { categories: [{ id: "ai", confidence: 0.9, evidence: "Agent", source: "deepseek" }] }),
          entry("acme/tool", { categories: [{ id: "tools", confidence: 0.8, evidence: "Workflow", source: "deepseek" }] }),
        ],
      },
    };
    const result = filterCatalog(categorized, {
      view: "total",
      category: "tools",
      query: "",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/tool"]);
  });

  it("keeps an explicit category filter while searching", () => {
    const categorized: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/browser", {
            descriptionZh: "浏览器网页自动化",
            categories: [{ id: "tools", confidence: 0.9, evidence: "Browser", source: "deepseek" }],
          }),
          entry("acme/security", {
            descriptionZh: "依赖安全扫描",
            categories: [{ id: "security", confidence: 0.9, evidence: "Security", source: "deepseek" }],
          }),
        ],
      },
    };
    const result = filterCatalog(categorized, {
      view: "total",
      category: "security",
      query: "security",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual(["acme/security"]);
  });

  it("ranks exact name matches above summary-only matches", () => {
    const ranked: RankingsDocument = {
      ...document,
      rankings: {
        ...document.rankings,
        total: [
          entry("acme/general-tool", { rank: 1, descriptionZh: "提供项目搜索能力" }),
          entry("acme/search", { rank: 90, descriptionZh: "通用插件" }),
        ],
      },
    };
    const result = filterCatalog(ranked, {
      view: "total",
      category: null,
      query: "search",
      offset: 0,
      limit: 10,
      installed: {},
    });
    expect(result.items.map((item) => item.fullName)).toEqual([
      "acme/search",
      "acme/general-tool",
    ]);
    expect(result.items[0]?.rank).toBe(90);
  });

  it("understands natural-language filler, bilingual synonyms, and a typo", () => {
    const vision = entry("acme/visual-reader", {
      description: "Extract OCR evidence from images",
      topics: ["vision"],
    });
    expect(matchesQuery(vision, "我想找一个图片处理插件")).toBe(true);
    expect(matchesQuery(entry("acme/search-tool"), "serach")).toBe(true);
  });
});

describe("catalog transport", () => {
  it("recognizes certificate failures that Windows may retry", () => {
    const cause = Object.assign(new Error("unable to verify the first certificate"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
    const error = new Error("fetch failed", { cause });
    expect(isRetryableCatalogFetchError(error)).toBe(true);
    expect(describeCatalogFetchError(error)).toContain("证书校验失败");
  });

  it("turns transport failures into actionable Chinese messages", () => {
    expect(describeCatalogFetchError(new Error("The operation was aborted due to timeout")))
      .toContain("榜单请求超时");
    expect(describeCatalogFetchError(new Error("rankings fetch failed: 502 Bad Gateway")))
      .toBe("榜单服务器请求失败（HTTP 502 Bad Gateway）");
    expect(describeCatalogFetchError(new Error("fetch failed"))).toContain("网络连接失败");
  });

  it("validates downloaded rankings JSON before caching it", () => {
    expect(parseRankingsDocument(JSON.stringify(document)).rankings.total).toHaveLength(3);
    expect(() => parseRankingsDocument("<html>bad gateway</html>")).toThrow("not valid JSON");
    expect(() => parseRankingsDocument("{}")).toThrow("rankings.total");
  });

  it("preserves per-window historical estimate labels in compact catalogs", () => {
    const result = parseRankingSearchDocument(JSON.stringify({schemaVersion:2, rankings:[{
      rank:1,fullName:"acme/estimate",threeDayStars:10,weeklyStars:20,risingScore:1.25,
      growthBasis:{threeDay:"historical-estimate",weekly:"observed"},
    }]}));
    expect(result.rankings.total[0]).toMatchObject({threeDayStars:10,weeklyStars:20,
      growthBasis:{threeDay:"historical-estimate",weekly:"observed"}});
  });

  it("normalizes a small published view shard into the catalog shape", () => {
    const shard = parseRankingViewDocument(JSON.stringify({
      ...document,
      rankings: document.rankings.hot,
    }), "hot");
    expect(shard.rankings.hot).toHaveLength(1);
    expect(shard.rankings.total).toBe(shard.rankings.hot);
    expect(shard.rankings.rising).toEqual([]);
  });

  it("normalizes the compact search index without requiring full ranking fields", () => {
    const search = parseRankingSearchDocument(JSON.stringify({
      schemaVersion: 2,
      generatedAt: document.generatedAt,
      snapshotDate: document.snapshotDate,
      rankings: [{ rank: 1, fullName: "acme/compact", descriptionZh: "轻量检索", type: "skill" }],
    }));
    expect(search.rankings.total[0]).toMatchObject({
      fullName: "acme/compact",
      description: "",
      descriptionZh: "轻量检索",
      stars: 0,
    });
  });

  it("retains configuration requirements without inventing them for legacy indexes", () => {
    const search = parseRankingSearchDocument(JSON.stringify({
      schemaVersion: 2,
      rankings: [true, false, undefined, "true"].map((needsConfig, index) => ({
        rank: index + 1, fullName: "acme/demo", installTarget: "github:acme/demo", needsConfig,
      })),
    }));
    expect(search.rankings.total.map((item) => item.install?.needsConfig)).toEqual([true, false, undefined, undefined]);
  });

  it("validates manifest v2 and refuses cross-origin snapshot references", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    expect(parseRankingManifest(publication.manifestRaw).snapshotId).toBe(publication.manifest.snapshotId);
    const unsafe = {
      ...publication.manifest,
      datasets: {
        ...publication.manifest.datasets,
        search: { ...publication.manifest.datasets.search, url: "https://evil.example/search.json" },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(json(unsafe), { status: 200 })));
    await expect(loadRankingManifest("https://catalog.example/data", true))
      .rejects.toThrow("不受信任的数据地址");
  });

  it("accepts an older manifest v2 that predates the separate Skills dataset", () => {
    const publication = v2Publication();
    const { skills: _skills, ...legacyDatasets } = publication.manifest.datasets;
    const legacyManifest = { ...publication.manifest, datasets: legacyDatasets };

    expect(parseRankingManifest(json(legacyManifest)).datasets.skills).toBeUndefined();
  });

  it("falls back to the mixed legacy catalog when an older snapshot has no Skills dataset", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    const { skills: _skills, ...legacyDatasets } = publication.manifest.datasets;
    const legacyManifest = { ...publication.manifest, datasets: legacyDatasets };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://legacy.example/data/manifest.json") {
        return new Response(json(legacyManifest), { status: 200 });
      }
      if (url === "https://legacy.example/data/rankings.json") {
        return new Response(json(document), { status: 200 });
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }));

    const result = await loadSkillRankings("https://legacy.example/data");

    expect(result.rankings.total.map((item) => item.fullName)).toEqual([
      "acme/rise-one",
      "other/search-me",
    ]);
  });

  it("locates install metadata through the compact index and one immutable total page", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    const fetchMock = fetchPublication(publication);
    vi.stubGlobal("fetch", fetchMock);

    await expect(findPublishedEntry("https://catalog.example/data", "acme/hot-one"))
      .resolves.toMatchObject({
        fullName: "acme/hot-one",
        install: { packageName: "@acme/hot-one", commands: ["dsh plugin --profile web add @acme/hot-one"] },
      });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
      `https://catalog.example${publication.manifest.datasets.search.url}`,
      `https://catalog.example${publication.manifest.datasets.total.pages[0]?.url}`,
    ]);
  });

  it("uses the compact search index for all-entry search", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    const fetchMock = fetchPublication(publication);
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadSearchRankings("https://catalog.example/data");
    expect(result).toMatchObject({ snapshotDate: document.snapshotDate });
    expect(result.rankings.total[0]?.install?.commands).toEqual([
      "dsh plugin add @acme/hot-one",
    ]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
      `https://catalog.example${publication.manifest.datasets.search.url}`,
    ]);
  });

  it("loads Skills from their separate directory dataset", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    const fetchMock = fetchPublication(publication);
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadSkillRankings("https://catalog.example/data");

    expect(result.rankings.total.map((item) => item.fullName)).toEqual(["acme/skill-only"]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
      `https://catalog.example${publication.manifest.datasets.skills.url}`,
    ]);
  });

  it.each([
    { id: "tools", label: "工具", displayLabel: "工具" },
    { id: "knowledge", label: "知识获取", displayLabel: "知识" },
  ] as const)("reads category counts and current labels from manifest metadata only ($id)", async ({ id, label, displayLabel }) => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    publication.manifest.categories = [{
      id,
      label,
      description: "效率工具",
      count: 3,
      skillCount: 2,
      pageSize: 100,
      pageCount: 0,
      pages: [],
    }];
    publication.manifestRaw = json(publication.manifest);
    publication.responses.set("https://catalog.example/data/manifest.json", publication.manifestRaw);
    const fetchMock = fetchPublication(publication);
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadCatalogMetadata("https://catalog.example/data")).resolves.toEqual({
      scopeCounts: { plugins: 1, skills: 1, ecosystem: 0 },
      pluginCategories: [{ id, label: displayLabel, description: "效率工具", count: 1 }],
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
    ]);
  });

  it("falls back to the full catalog when the compact index is temporarily unavailable", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503, statusText: "Unavailable" }))
      .mockResolvedValueOnce(new Response(JSON.stringify(document), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadSearchRankings("https://catalog.example/data"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
      "https://catalog.example/data/rankings-search.json",
      "https://catalog.example/data/rankings.json",
    ]);
  });

  it("coalesces initial shard downloads and reuses the persistent cache", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const publication = v2Publication();
    const fetchMock = fetchPublication(publication);
    vi.stubGlobal("fetch", fetchMock);

    const [left, right] = await Promise.all([
      loadRankingView("https://catalog.example/data", "hot"),
      loadRankingView("https://catalog.example/data", "hot"),
    ]);
    expect(left.rankings.hot).toHaveLength(1);
    expect(right.rankings.hot).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
      `https://catalog.example${publication.manifest.datasets.hot.url}`,
    ]);

    invalidateCatalog();
    const offlineFetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", offlineFetch);
    await expect(loadCachedRankings("https://catalog.example/data"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    await expect(loadRankingView("https://catalog.example/data", "hot"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(offlineFetch).not.toHaveBeenCalled();
  });

  it("falls back to the full catalog when a view shard is not JSON", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response("<html>upstream warning</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(document), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadRankingView("https://catalog.example/data", "hot"))
      .resolves.toMatchObject({ snapshotDate: document.snapshotDate });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://catalog.example/data/manifest.json",
      "https://catalog.example/data/rankings-hot.json",
      "https://catalog.example/data/rankings.json",
    ]);
  });

  it("treats a newer full catalog omission as authoritative for installation", async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), "dsh-top100-catalog-test-"));
    temporaryCaches.push(cacheDirectory);
    process.env.DSH_TOP100_CACHE_DIR = cacheDirectory;
    const target = document.rankings.hot[0];
    const oldShard = { ...document, generatedAt: "2026-08-21T00:00:00.000Z", rankings: [target] };
    const newFull = {
      ...document,
      generatedAt: "2026-08-22T00:00:00.000Z",
      rankings: { hot: [], rising: [], total: document.rankings.total.filter((entry) => entry.fullName !== target.fullName) },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404, statusText: "Not Found" }))
      .mockResolvedValueOnce(new Response(JSON.stringify(oldShard), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(newFull), { status: 200 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404, statusText: "Not Found" }));
    vi.stubGlobal("fetch", fetchMock);

    await loadRankingView("https://catalog.example/data", "hot", true);
    await loadRankings("https://catalog.example/data", true);
    await expect(findPublishedEntry("https://catalog.example/data", target.fullName))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
