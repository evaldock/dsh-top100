import { type InstalledEntryEvidence } from "../install/install-spec.js";
import type { CatalogCacheStatus, CatalogCategoryDefinition, CatalogItem, CatalogScope, CatalogScopeCounts, InstallAvailability, PluginCategoryDefinition, RankingEntry, RankingsDocument, RankingView, PluginCategoryId } from "../shared/types.js";
export declare const DEFAULT_DATA_URL = "https://www.evaldock.ai/data";
export interface CatalogCache {
    dataUrl: string;
    fetchedAt: number;
    document: RankingsDocument;
}
interface RankingFileReferenceV2 {
    url: string;
    count: number;
    bytes: number;
    sha256: string;
}
interface RankingPageReferenceV2 extends RankingFileReferenceV2 {
    page: number;
}
interface RankingManifestV2 {
    schemaVersion: 2;
    snapshotId: string;
    generatedAt: string;
    snapshotDate: string;
    pageSize: number;
    definitions?: RankingsDocument["definitions"];
    datasets: {
        hot: RankingFileReferenceV2;
        rising: RankingFileReferenceV2;
        skills?: RankingFileReferenceV2;
        search: RankingFileReferenceV2;
        total: {
            count: number;
            skillCount?: number;
            pageSize: number;
            pageCount: number;
            pages: RankingPageReferenceV2[];
        };
    };
    categories: Array<PluginCategoryDefinition & {
        skillCount?: number;
        pageSize: number;
        pageCount: number;
        pages: RankingPageReferenceV2[];
    }>;
}
export declare function normalizeDataUrl(raw: string): string;
export declare function parseRankingManifest(raw: string): RankingManifestV2;
export declare function isRankingView(value: string | null): value is RankingView;
export declare function isCatalogScope(value: string | null): value is CatalogScope;
export declare function isInstallAvailability(value: string | null): value is InstallAvailability;
export declare function matchesQuery(entry: RankingEntry, query: string): boolean;
export declare function catalogScopeCounts(document: RankingsDocument, skillsDocument?: RankingsDocument): CatalogScopeCounts;
export declare function loadCatalogMetadata(dataUrl: string, force?: boolean): Promise<{
    scopeCounts: CatalogScopeCounts;
    pluginCategories: PluginCategoryDefinition[];
}>;
export declare function filterCatalog(document: RankingsDocument, options: {
    view: RankingView;
    category: PluginCategoryId | null;
    query: string;
    offset: number;
    limit: number;
    installed: Record<string, string>;
    installedEvidence?: Record<string, InstalledEntryEvidence>;
    profile?: string;
    excludeSkills?: boolean;
    compatibleOnly?: boolean;
    catalogScope?: CatalogScope;
    installAvailability?: InstallAvailability;
}): {
    total: number;
    excludedSkillCount: number;
    items: CatalogItem[];
};
export declare function filteredCatalogCategories(document: RankingsDocument, options: {
    excludeSkills?: boolean;
    compatibleOnly?: boolean;
    catalogScope?: CatalogScope;
}): CatalogCategoryDefinition[];
export declare function invalidateCatalog(): void;
export declare function describeCatalogFetchError(error: unknown): string;
export declare function isRetryableCatalogFetchError(error: unknown): boolean;
export declare function loadRankingManifest(dataUrl: string, force?: boolean): Promise<RankingManifestV2>;
export declare function parseRankingsDocument(raw: string): RankingsDocument;
export declare function parseRankingViewDocument(raw: string, view: "hot" | "rising"): RankingsDocument;
export declare function parseSkillDirectoryDocument(raw: string): RankingsDocument;
export declare function parseRankingSearchDocument(raw: string): RankingsDocument;
export declare function loadRankings(dataUrl: string, force?: boolean): Promise<RankingsDocument>;
/** Load the compact all-entry index used by total/category/search views. */
export declare function loadSearchRankings(dataUrl: string, force?: boolean): Promise<RankingsDocument>;
/** Load Skills as a separate discovery directory. Skills never participate in Plugin ranks. */
export declare function loadSkillRankings(dataUrl: string, force?: boolean): Promise<RankingsDocument>;
export declare function catalogCacheStatus(dataUrl: string, dataset: CatalogCacheStatus["dataset"], view?: "hot" | "rising"): Promise<CatalogCacheStatus>;
/** Return a last-good full or view cache without ever delaying local management on the network. */
export declare function loadCachedRankings(dataUrl: string): Promise<RankingsDocument | null>;
/** A list locator is only a hint: sources still come from a hash-verified current page. */
export declare class CatalogLookupError extends Error {
    readonly code: "catalog-changed" | "invalid-locator";
    constructor(code: "catalog-changed" | "invalid-locator", message: string);
}
/** Stop this caller promptly without cancelling shared downloads used by other requests. */
export declare function waitForCatalog<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T>;
/** Resolve installation metadata from a current, authoritative catalog snapshot. */
export declare function findPublishedEntry(dataUrl: string, fullName: string, forceManifest?: boolean, locator?: CatalogItem["installLocator"], signal?: AbortSignal): Promise<RankingEntry | undefined>;
/** Load the small published shard used by the initial hot/rising tabs. */
export declare function loadRankingView(dataUrl: string, view: "hot" | "rising", force?: boolean): Promise<RankingsDocument>;
export declare function findEntry(document: RankingsDocument, fullName: string): RankingEntry | undefined;
export {};
