/** Category contract mirrored from the www.evaldock.ai rankings document. */
import type { PluginCategoryDefinition, PluginCategoryId, RankingEntry, RankingsDocument } from "./types.js";
export declare const DEFAULT_CATEGORY_DEFINITIONS: readonly Omit<PluginCategoryDefinition, "count">[];
/** Keep older published snapshots consistent with the current category wording. */
export declare function categoryDisplayLabel(id: PluginCategoryId, label: string): string;
export declare function isPluginCategoryId(value: string | null): value is PluginCategoryId;
export declare function entryMatchesCategory(entry: RankingEntry, category: PluginCategoryId): boolean;
export declare function catalogCategories(document: RankingsDocument): PluginCategoryDefinition[];
