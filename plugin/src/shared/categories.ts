/** Category contract mirrored from the www.evaldock.ai rankings document. */

import type { PluginCategoryDefinition, PluginCategoryId, RankingEntry, RankingsDocument } from "./types.js";

export const DEFAULT_CATEGORY_DEFINITIONS: readonly Omit<PluginCategoryDefinition, "count">[] = [
  { id: "ai", label: "Agent 增强", description: "模型能力、提示词、记忆、上下文、多 Agent 协作与智能体增强。" },
  { id: "appearance", label: "外观", description: "主题、皮肤、界面组件、桌面体验、图标与可视化面板。" },
  { id: "coding", label: "编程", description: "代码生成、调试、测试、代码审查、终端、Git 与开发辅助。" },
  { id: "knowledge", label: "知识", description: "联网搜索、浏览器检索、RAG、知识库、文档问答与研究。" },
  { id: "tools", label: "工具", description: "自动化、工作流、连接器、文件处理、通知与效率工具。" },
  { id: "security", label: "安全", description: "权限、沙箱、审计、认证、隐私、密钥与安全防护。" },
] as const;

const CATEGORY_IDS = new Set<string>(DEFAULT_CATEGORY_DEFINITIONS.map(({ id }) => id));

/** Keep older published snapshots consistent with the current category wording. */
export function categoryDisplayLabel(id: PluginCategoryId, label: string): string {
  return id === "knowledge" && label === "知识获取" ? "知识" : label;
}

export function isPluginCategoryId(value: string | null): value is PluginCategoryId {
  return value !== null && CATEGORY_IDS.has(value);
}

export function entryMatchesCategory(entry: RankingEntry, category: PluginCategoryId): boolean {
  return (entry.categories ?? []).some((assignment) =>
    (typeof assignment === "string" ? assignment : assignment?.id) === category
  );
}

export function catalogCategories(document: RankingsDocument): PluginCategoryDefinition[] {
  const published = new Map(
    (document.categories ?? [])
      .filter((definition) => isPluginCategoryId(definition?.id ?? null))
      .map((definition) => [definition.id, definition]),
  );

  return DEFAULT_CATEGORY_DEFINITIONS.map((fallback) => {
    const remote = published.get(fallback.id);
    const computedCount = document.rankings.total.filter((entry) => entryMatchesCategory(entry, fallback.id)).length;
    return {
      id: fallback.id,
      label: categoryDisplayLabel(fallback.id, remote?.label || fallback.label),
      description: remote?.description || fallback.description,
      count: Number.isFinite(remote?.count) ? Number(remote?.count) : computedCount,
    };
  });
}
