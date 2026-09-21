import { descriptionDisplayFor } from '../shared/description-rules.js';
/** Model-facing Top100 recommendation Skill and its read-only catalog search tool. */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
import type { SkillCandidate, SkillDefinition, SkillProvider } from "@deepseek-ai/dsh-skill";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { catalogCategories, isPluginCategoryId } from "../shared/categories.js";
import type {
  CatalogItem,
  PluginCategoryId,
  RankingsDocument,
} from "../shared/types.js";
import { filterCatalog, loadSearchRankings } from "./catalog.js";
import type { PluginResolvedConfig } from "./contracts.js";
import { readInstalled } from "./profile.js";

export const RECOMMENDATION_SKILL_NAME = "recommend-dsh-plugins";
export const RECOMMENDATION_TOOL_NAME = "dsh_top100_search";
export const EVALDOCK_CATALOG_URL = "https://www.evaldock.ai/top100/#ranking";
const PROVIDER_NAME = "dsh-top100";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const SKILL_FILE_URL = new URL("../../skills/recommend-dsh-plugins/SKILL.md", import.meta.url);
const RESOURCE_BASE = {
  kind: "directory",
  path: fileURLToPath(new URL("../../skills/recommend-dsh-plugins/", import.meta.url)),
} as const;
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;
const SKILL_DESCRIPTION =
  "Search the EvalDock dsh-Top100 catalog and recommend suitable DeepSeek Harness plugins or Skills. " +
  "Use when the user asks which DSH plugin to install, requests plugin recommendations or comparisons, " +
  "describes a capability they want to add, or asks ‘我该装哪个插件’, ‘推荐几个插件’, or ‘有没有能做某件事的插件’.";

export interface RecommendationItem {
  rank: number;
  fullName: string;
  name: string;
  type: string;
  description: string;
  stars: number;
  dailyStars?: number;
  weeklyStars?: number;
  categories: string[];
  installable: boolean;
  installed: boolean;
  formFactor: string;
  trustLevel: string;
  trustSignals: string[];
  trustCaveat: string;
  repositoryUrl: string;
}

export interface RecommendationSearchResult {
  query: string;
  total: number;
  generatedAt: string;
  catalogUrl: string;
  items: RecommendationItem[];
}

function skillBody(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

async function loadSkillBody(): Promise<string> {
  return skillBody(await readFile(SKILL_FILE_URL, "utf8"));
}

const candidate: SkillCandidate = {
  name: RECOMMENDATION_SKILL_NAME,
  description: SKILL_DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: "bundled",
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_FILE_URL,
};

const provider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve([candidate]),
  async get(): Promise<SkillDefinition> {
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      resourceBase: RESOURCE_BASE,
      content: await loadSkillBody(),
    };
  },
};

function categoryLabels(document: RankingsDocument, item: CatalogItem): string[] {
  const labels = new Map(catalogCategories(document).map((category) => [category.id, category.label]));
  return (item.categories ?? [])
    .map((assignment) => typeof assignment === "string" ? assignment : assignment.id)
    .filter(isPluginCategoryId)
    .map((id) => labels.get(id) ?? id);
}

export function recommendationResult(
  document: RankingsDocument,
  options: {
    query: string;
    limit?: number;
    category?: PluginCategoryId | null;
    installed?: Record<string, string>;
  },
): RecommendationSearchResult {
  const query = options.query.trim();
  if (!query) throw new Error("query must be a non-empty string");
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  const category = options.category ?? null;
  const result = filterCatalog(document, {
    view: "total",
    category,
    query,
    offset: 0,
    limit,
    installed: options.installed ?? {},
    compatibleOnly: true,
  });
  return {
    query,
    total: result.total,
    generatedAt: document.generatedAt,
    catalogUrl: EVALDOCK_CATALOG_URL,
    items: result.items.map((item) => ({
      rank: item.totalRank ?? item.rank,
      fullName: item.fullName,
      name: item.name,
      type: item.type,
      description: descriptionDisplayFor(item),
      stars: item.stars,
      ...(item.dailyStars == null ? {} : { dailyStars: item.dailyStars }),
      ...(item.weeklyStars == null ? {} : { weeklyStars: item.weeklyStars }),
      categories: categoryLabels(document, item),
      installable: item.installable,
      installed: item.installed,
      formFactor: item.evidence.formFactor,
      trustLevel: item.evidence.trustLevel,
      trustSignals: item.evidence.signals,
      trustCaveat: item.evidence.caveat,
      repositoryUrl: item.url,
    })),
  };
}

export function formatRecommendationResult(result: RecommendationSearchResult): string {
  const lines = [
    `EvalDock Top100 搜索：${result.query}`,
    `匹配 ${result.total} 项；数据生成于 ${result.generatedAt}`,
    `市场：${result.catalogUrl}`,
  ];
  if (result.items.length === 0) {
    lines.push("没有找到匹配项。请缩短查询或改用同义词后重试。");
    return lines.join("\n");
  }
  for (const [index, item] of result.items.entries()) {
    const category = item.categories.length > 0 ? item.categories.join("、") : "未分类";
    const install = item.installed ? "已安装" : item.installable ? "支持安装" : "仅提供项目链接";
    lines.push(
      `${index + 1}. ${item.fullName} — ${item.description}`,
      `   类型：${item.type}；分类：${category}；Stars：${item.stars}；日增：${item.dailyStars ?? "未提供"}；周增：${item.weeklyStars ?? "未提供"}；${install}`,
      `   形态：${item.formFactor}；信任层：${item.trustLevel}；证据：${item.trustSignals.join("、")}`,
      `   注意：${item.trustCaveat}`,
      `   ${item.repositoryUrl}`,
    );
  }
  return lines.join("\n");
}

/** Register the bundled Skill and its catalog search tool when both DSH registries are available. */
export function installRecommendationCapabilities(
  ctx: Context,
  config: PluginResolvedConfig,
): void {
  ctx.skills.registerProvider(() => provider);
  ctx.tools.register(defineTool({
    name: RECOMMENDATION_TOOL_NAME,
    description:
      "Search the live EvalDock dsh-Top100 market for DeepSeek Harness plugins and Skills. " +
      "Use after loading recommend-dsh-plugins when selecting or comparing plugins for a user need.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Capability or use-case query, in Chinese or English.",
      },
      category: {
        type: "string",
        enum: ["ai", "appearance", "coding", "knowledge", "tools", "security"],
        description: "Optional EvalDock category filter.",
      },
      limit: {
        type: "integer",
        description: `Optional result count from 1 to ${MAX_LIMIT}; defaults to ${DEFAULT_LIMIT}.`,
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", required: true },
          total: { type: "integer", required: true },
          generatedAt: { type: "string", required: true },
          catalogUrl: { type: "string", required: true },
          items: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                rank: { type: "integer", required: true },
                fullName: { type: "string", required: true },
                name: { type: "string", required: true },
                type: { type: "string", required: true },
                description: { type: "string", required: true },
                stars: { type: "integer", required: true },
                dailyStars: { type: "integer", description: "Daily star growth, omitted when the source dataset did not publish it." },
                weeklyStars: { type: "integer", description: "Weekly star growth, omitted when the source dataset did not publish it." },
                categories: { type: "array", required: true, items: { type: "string" } },
                installable: { type: "boolean", required: true },
                installed: { type: "boolean", required: true },
                formFactor: { type: "string", required: true },
                trustLevel: { type: "string", required: true },
                trustSignals: { type: "array", required: true, items: { type: "string" } },
                trustCaveat: { type: "string", required: true },
                repositoryUrl: { type: "string", required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: "text", text: formatRecommendationResult(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const category = args.category === undefined ? null : args.category;
      const document = await loadSearchRankings(config.dataUrl);
      return recommendationResult(document, {
        query: args.query,
        limit: args.limit,
        category,
        installed: readInstalled(config.profile, config.profileDirectory),
      });
    },
  }));
}
