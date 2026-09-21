/** Config-driven candidate discovery across GitHub Repository Search, Code Search, and npm. */

import discoveryConfig from "../../config/discovery-sources.json";
import { isGithubAuthenticationFailure, type GithubRepo } from "../github.js";
import {
  partitionedRepositorySearch,
  requestGithubRepositories,
  SearchPartialError,
  type PartitionedSearchOptions,
  type PartitionedSearchResult,
} from "./github-partitioned-search.js";
import {
  searchCodeRepositories,
  type CodeSearchOptions,
  type CodeSearchResult,
} from "./github-code-search.js";
import {
  searchNpmRepositories,
  type NpmSearchOptions,
  type NpmSearchResult,
} from "./npm-search.js";

async function fastRepositorySearch(
  query: string,
  options: PartitionedSearchOptions = {}
): Promise<PartitionedSearchResult> {
  const pageLimit = Number(process.env.DSH_INCREMENTAL_REPOSITORY_PAGES ?? "2");
  const perPage = options.perPage ?? 100;
  if (!Number.isInteger(pageLimit) || pageLimit <= 0) {
    throw new Error("DSH_INCREMENTAL_REPOSITORY_PAGES must be a positive integer");
  }
  const repositories = new Map<string, GithubRepo>();
  let requests = 0;
  const snapshot = (): PartitionedSearchResult => ({
    repositories: [...repositories.values()],
    audit: { query, requests, shards: 1, repositories: repositories.size },
  });
  const request = options.request ?? requestGithubRepositories;
  try {
    for (let page = 1; page <= pageLimit; page++) {
      requests++;
      const response = await request(query, page, perPage);
      for (const repository of response.items) {
        repositories.set(repository.node_id ?? String(repository.id), repository);
      }
      if (response.items.length < perPage) break;
    }
    return snapshot();
  } catch (error) {
    throw new SearchPartialError("Incremental Repository Search request failed", snapshot(), { cause: error });
  }
}

export type DiscoveryMode = "full" | "incremental";

export interface DiscoveryCandidate {
  fullName: string;
  repo: GithubRepo | null;
  sources: string[];
}

export interface DiscoverySourceAudit {
  id: string;
  kind: "repository" | "code" | "npm";
  status: "complete" | "partial" | "failed";
  candidates: number;
  requests: number;
  shards?: number;
  message?: string;
}

export interface DiscoveryAudit {
  mode: DiscoveryMode;
  complete: boolean;
  startedAt: string;
  completedAt: string;
  candidates: number;
  sources: DiscoverySourceAudit[];
}

export interface DiscoveryResult {
  candidates: DiscoveryCandidate[];
  audit: DiscoveryAudit;
}

interface QueryConfig {
  id: string;
  query: string;
}

interface DiscoveryConfig {
  repositoryQueries: QueryConfig[];
  codeQueries: QueryConfig[];
  npmQueries: QueryConfig[];
}

export interface DiscoverOptions {
  mode?: DiscoveryMode;
  since?: Date;
  config?: DiscoveryConfig;
  partitionOptions?: PartitionedSearchOptions;
  codeOptions?: CodeSearchOptions;
  npmOptions?: NpmSearchOptions;
  repositorySearch?: (
    query: string,
    options?: PartitionedSearchOptions
  ) => Promise<PartitionedSearchResult>;
  codeSearch?: (query: string, options?: CodeSearchOptions) => Promise<CodeSearchResult>;
  npmSearch?: (query: string, options?: NpmSearchOptions) => Promise<NpmSearchResult>;
}

function identity(repo: GithubRepo | null, fullName: string): string {
  if (repo?.node_id) return `node:${repo.node_id}`;
  if (repo) return `id:${repo.id}`;
  return `name:${fullName.toLowerCase()}`;
}

/** Merge discoveries by immutable repository identity while retaining every source. */
export function mergeDiscoveryCandidates(
  entries: Array<{ fullName: string; repo: GithubRepo | null; source: string }>
): DiscoveryCandidate[] {
  const byIdentity = new Map<string, DiscoveryCandidate>();
  const byName = new Map<string, DiscoveryCandidate>();

  for (const entry of entries) {
    const nameKey = entry.fullName.toLowerCase();
    const identityKey = identity(entry.repo, entry.fullName);
    let candidate = byIdentity.get(identityKey) ?? byName.get(nameKey);
    if (!candidate) {
      candidate = { fullName: entry.fullName, repo: entry.repo, sources: [] };
    }
    if (entry.repo) {
      candidate.repo = entry.repo;
      candidate.fullName = entry.repo.full_name;
    }
    if (!candidate.sources.includes(entry.source)) candidate.sources.push(entry.source);
    byIdentity.set(identityKey, candidate);
    byIdentity.set(identity(candidate.repo, candidate.fullName), candidate);
    byName.set(nameKey, candidate);
    byName.set(candidate.fullName.toLowerCase(), candidate);
  }

  return [...new Set(byIdentity.values())];
}

function incrementalQuery(query: string, mode: DiscoveryMode, since: Date): string {
  if (mode === "full") return query;
  return `${query} pushed:>=${since.toISOString().replace(".000Z", "Z")}`;
}

/** Run every configured discovery source and return a unified candidate pool plus coverage audit. */
export async function discoverRepositories(
  options: DiscoverOptions = {}
): Promise<DiscoveryResult> {
  const startedAt = new Date().toISOString();
  const mode = options.mode ?? "full";
  const since = options.since ?? new Date(Date.now() - 72 * 3600_000);
  const config = options.config ?? (discoveryConfig as DiscoveryConfig);
  const usesFastRepositoryWindow = mode === "incremental" && !options.repositorySearch;
  const repositorySearch =
    options.repositorySearch ??
    (usesFastRepositoryWindow ? fastRepositorySearch : partitionedRepositorySearch);
  const codeSearch = options.codeSearch ?? searchCodeRepositories;
  const npmSearch = options.npmSearch ?? searchNpmRepositories;
  const entries: Array<{ fullName: string; repo: GithubRepo | null; source: string }> = [];
  const sources: DiscoverySourceAudit[] = [];

  for (const source of config.repositoryQueries) {
    const query = incrementalQuery(source.query, mode, since);
    const sourceId = `github-repository:${source.id}`;
    try {
      const result = await repositorySearch(query, options.partitionOptions);
      for (const repo of result.repositories) {
        entries.push({ fullName: repo.full_name, repo, source: sourceId });
      }
      sources.push({
        id: sourceId,
        kind: "repository",
        status: usesFastRepositoryWindow ? "partial" : "complete",
        candidates: result.repositories.length,
        requests: result.audit.requests,
        shards: result.audit.shards,
        message: usesFastRepositoryWindow
          ? "Daily mode collected the first Star-sorted repository window"
          : undefined,
      });
      console.log(
        `  ${sourceId} -> ${result.repositories.length} repos, ${result.audit.shards} shards`
      );
    } catch (error) {
      if (isGithubAuthenticationFailure(error)) throw error;
      const partial = error instanceof SearchPartialError
        ? error.partial as PartitionedSearchResult | undefined
        : undefined;
      for (const repo of partial?.repositories ?? []) {
        entries.push({ fullName: repo.full_name, repo, source: sourceId });
      }
      sources.push({
        id: sourceId,
        kind: "repository",
        status: partial?.repositories.length ? "partial" : "failed",
        candidates: partial?.repositories.length ?? 0,
        requests: partial?.audit.requests ?? 0,
        shards: partial?.audit.shards,
        message: error instanceof SearchPartialError ? error.message : "Repository Search failed",
      });
      console.warn(`  ${sourceId} incomplete; retained ${partial?.repositories.length ?? 0} repositories`);
    }
  }

  for (const source of config.codeQueries) {
    const sourceId = `github-code:${source.id}`;
    try {
      const result = await codeSearch(source.query, {
        ...options.codeOptions,
        maxItems:
          options.codeOptions?.maxItems ?? (mode === "incremental" ? 100 : undefined),
      });
      for (const repo of result.repositories) {
        entries.push({ fullName: repo.full_name, repo: null, source: sourceId });
      }
      sources.push({
        id: sourceId,
        kind: "code",
        status: result.complete ? "complete" : "partial",
        candidates: result.repositories.length,
        requests: result.requests,
        message: result.complete
          ? undefined
          : `GitHub exposes only the first ${result.matches} of ${result.totalMatches} code matches`,
      });
      console.log(
        `  ${sourceId} -> ${result.repositories.length} repos from ${result.matches}/${result.totalMatches} matches${result.complete ? "" : " (partial)"}`
      );
    } catch (error) {
      if (isGithubAuthenticationFailure(error)) throw error;
      const partial = error instanceof SearchPartialError
        ? error.partial as CodeSearchResult | undefined
        : undefined;
      for (const repo of partial?.repositories ?? []) {
        entries.push({ fullName: repo.full_name, repo: null, source: sourceId });
      }
      sources.push({
        id: sourceId,
        kind: "code",
        status: partial?.repositories.length ? "partial" : "failed",
        candidates: partial?.repositories.length ?? 0,
        requests: partial?.requests ?? 0,
        message: error instanceof SearchPartialError ? error.message : "Code Search failed",
      });
      console.warn(`  ${sourceId} incomplete; retained ${partial?.repositories.length ?? 0} repositories`);
    }
  }

  for (const source of config.npmQueries) {
    const sourceId = `npm:${source.id}`;
    try {
      const result = await npmSearch(source.query, {
        ...options.npmOptions,
        maxPages:
          options.npmOptions?.maxPages ?? (mode === "incremental" ? 2 : undefined),
      });
      for (const fullName of result.repositories) {
        entries.push({ fullName, repo: null, source: sourceId });
      }
      sources.push({
        id: sourceId,
        kind: "npm",
        status: result.complete ? "complete" : "partial",
        candidates: result.repositories.length,
        requests: result.requests,
        message: result.complete
          ? undefined
          : `npm returned ${result.packages} packages before the configured page limit`,
      });
      console.log(
        `  ${sourceId} -> ${result.repositories.length} repos${result.complete ? "" : " (partial)"}`
      );
    } catch (error) {
      const partial = error instanceof SearchPartialError
        ? error.partial as NpmSearchResult | undefined
        : undefined;
      for (const fullName of partial?.repositories ?? []) {
        entries.push({ fullName, repo: null, source: sourceId });
      }
      sources.push({
        id: sourceId,
        kind: "npm",
        status: partial?.repositories.length ? "partial" : "failed",
        candidates: partial?.repositories.length ?? 0,
        requests: partial?.requests ?? 0,
        message: error instanceof SearchPartialError ? error.message : "npm Search failed",
      });
      console.warn(`  ${sourceId} incomplete; retained ${partial?.repositories.length ?? 0} repositories`);
    }
  }

  const candidates = mergeDiscoveryCandidates(entries);
  return {
    candidates,
    audit: {
      mode,
      complete: sources.every((source) => source.status === "complete"),
      startedAt,
      completedAt: new Date().toISOString(),
      candidates: candidates.length,
      sources,
    },
  };
}
