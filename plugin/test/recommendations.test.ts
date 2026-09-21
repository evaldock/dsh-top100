import { describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime from "@deepseek-ai/dsh-tools";
import {
  EVALDOCK_CATALOG_URL,
  formatRecommendationResult,
  installRecommendationCapabilities,
  recommendationResult,
  RECOMMENDATION_SKILL_NAME,
  RECOMMENDATION_TOOL_NAME,
} from "../src/host/recommendations.js";
import type { RankingEntry, RankingsDocument } from "../src/shared/types.js";

function entry(fullName: string, extra: Partial<RankingEntry> = {}): RankingEntry {
  const [owner = "owner", name = fullName] = fullName.split("/");
  return {
    rank: extra.rank ?? 1,
    fullName,
    name,
    owner,
    description: extra.description ?? "English summary",
    descriptionPolicy: 'server-v1',
    descriptionZh: extra.descriptionZh ?? "中文简介",
    stars: extra.stars ?? 10,
    dailyStars: extra.dailyStars ?? 1,
    weeklyStars: extra.weeklyStars ?? 3,
    hotScore: 1,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: extra.topics ?? [],
    tags: extra.tags ?? [],
    categories: extra.categories ?? [],
    type: extra.type ?? "cordis-plugin",
    install: extra.install ?? {
      method: "pnpm-profile",
      commands: [`dsh plugin --profile web add github:${fullName}`],
    },
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
  generatedAt: "2026-08-25T08:00:00.000Z",
  snapshotDate: "2026-08-25",
  categories: [
    { id: "knowledge", label: "知识获取", description: "搜索和研究", count: 1 },
  ],
  rankings: {
    hot: [],
    rising: [],
    total: [
      entry("acme/vision-reader", {
        rank: 8,
        descriptionZh: "识别图片并提取 OCR 文本",
        topics: ["vision", "ocr"],
        stars: 80,
        categories: ["knowledge"],
      }),
      entry("acme/theme", {
        rank: 2,
        descriptionZh: "更换界面主题",
        topics: ["appearance"],
      }),
    ],
  },
};

describe("DSH plugin recommendations", () => {
  it("registers a model-invocable Skill and its search tool with DSH", async () => {
    const ctx = new Context();
    await ctx.plugin(SkillRegistry);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(ToolRuntime);
    installRecommendationCapabilities(ctx, {
      dataUrl: "https://www.evaldock.ai/data",
      profile: "web",
    });

    const listed = await ctx.skills.list();
    expect(listed.find((skill) => skill.name === RECOMMENDATION_SKILL_NAME)).toMatchObject({
      provider: "dsh-top100",
      source: "bundled",
      invocation: { modelInvocable: true, userInvocable: true },
    });
    const loaded = await ctx.skills.get(RECOMMENDATION_SKILL_NAME);
    expect(loaded?.content).toContain(`Call \`${RECOMMENDATION_TOOL_NAME}\``);
    expect(loaded?.content).not.toMatch(/^---/);
    expect(ctx.tools.schemas().map((tool) => tool.name)).toContain(RECOMMENDATION_TOOL_NAME);

  });

  it("uses the shared intelligent search and returns recommendation evidence", () => {
    const result = recommendationResult(document, {
      query: "我想找一个图片 OCR 插件",
      installed: { "vision-reader": "github:acme/vision-reader" },
    });

    expect(result.catalogUrl).toBe(EVALDOCK_CATALOG_URL);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      fullName: "acme/vision-reader",
      rank: 8,
      description: "识别图片并提取 OCR 文本",
      categories: ["知识"],
      installed: true,
      installable: true,
      formFactor: "dsh-bundle",
      trustLevel: "install-source",
      trustSignals: expect.arrayContaining([
        "已进入 DSHEval 索引",
        "命中 DSH Bundle 结构",
        "安装源可解析（github）",
      ]),
    });
  });

  it('keeps the stale qualification in recommendation text and model-readable output', () => {
    const row = entry('acme/vision-reader', { descriptionZh: '识别图片并提取 OCR 文本',
      descriptionStatus: { state: 'stale', reviewedAt: '2026-09-16', reason: '来源核查中' } });
    const result = recommendationResult({ ...document, rankings: { hot: [], rising: [], total: [row] } }, { query: 'ocr' });
    expect(result.items[0].description).toContain('上次核验 2026-09-16');
    expect(result.items[0].description).toContain('简介待更新');
    expect(result.items[0].description).toContain(row.descriptionZh);
    expect(formatRecommendationResult(result)).toContain('上次核验 2026-09-16');
  });

  it("validates input bounds and renders a model-readable result", () => {
    expect(() => recommendationResult(document, { query: "  " })).toThrow(/non-empty/);
    expect(() => recommendationResult(document, { query: "ocr", limit: 11 })).toThrow(/between 1 and 10/);

    const output = formatRecommendationResult(recommendationResult(document, { query: "ocr" }));
    expect(output).toContain("EvalDock Top100 搜索：ocr");
    expect(output).toContain("acme/vision-reader");
    expect(output).toContain("https://github.com/acme/vision-reader");
    expect(output).toContain("形态：dsh-bundle；信任层：install-source");
    expect(output).toContain("注意：这些证据不代表代码已通过安全审核");
    expect(output).toContain(EVALDOCK_CATALOG_URL);
  });

  it("returns an explicit empty result instead of fabricating a plugin", () => {
    const output = formatRecommendationResult(recommendationResult(document, { query: "quantum banana" }));
    expect(output).toContain("没有找到匹配项");
  });

  it("distinguishes unpublished growth metrics from measured zero growth", () => {
    const partialDocument: RankingsDocument = {
      ...document,
      rankings: {
        hot: [],
        rising: [],
        total: [entry("acme/vision-reader", {
          descriptionZh: "OCR 图片识别",
          dailyStars: null,
          weeklyStars: null,
          hotScore: null,
        })],
      },
    };
    const missing = recommendationResult(partialDocument, { query: "ocr" });
    expect(missing.items[0]).not.toHaveProperty("dailyStars");
    expect(missing.items[0]).not.toHaveProperty("weeklyStars");
    expect(formatRecommendationResult(missing)).toContain("日增：未提供；周增：未提供");

    partialDocument.rankings.total[0].dailyStars = 0;
    partialDocument.rankings.total[0].weeklyStars = 0;
    const measured = recommendationResult(partialDocument, { query: "ocr" });
    expect(measured.items[0]).toMatchObject({ dailyStars: 0, weeklyStars: 0 });
    expect(formatRecommendationResult(measured)).toContain("日增：0；周增：0");
  });
});
