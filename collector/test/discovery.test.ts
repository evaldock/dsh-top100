import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubError, type GithubRepo } from "../src/github.js";
import { discoverRepositories } from "../src/sources/discovery.js";

function repo(id: number, fullName: string): GithubRepo {
  const [owner, name] = fullName.split("/");
  return {
    id,
    node_id: `R_${id}`,
    full_name: fullName,
    name,
    owner: { login: owner },
    description: null,
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    pushed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    default_branch: "main",
    archived: false,
    fork: false,
  };
}

describe("discoverRepositories", () => {
  it('aborts authentication failure instead of treating it as partial source coverage', async () => {
    const codeSearch = vi.fn(), npmSearch = vi.fn();
    await expect(discoverRepositories({
      config: { repositoryQueries: [{ id: 'first', query: 'first' }],
        codeQueries: [{ id: 'code', query: 'code' }], npmQueries: [{ id: 'npm', query: 'npm' }] },
      partitionOptions: { request: async () => { throw new GithubError('github-auth-invalid', 401, 'https://api.github.com'); } },
      codeSearch, npmSearch,
    })).rejects.toThrow();
    expect(codeSearch).not.toHaveBeenCalled(); expect(npmSearch).not.toHaveBeenCalled();
  });
  it("merges repository, code, and npm evidence for the same candidate", async () => {
    const result = await discoverRepositories({
      config: {
        repositoryQueries: [{ id: "topic", query: "topic:dsh-plugin" }],
        codeQueries: [{ id: "marker", query: "path:cordis.patch.yml" }],
        npmQueries: [{ id: "npm", query: "dsh-plugin" }],
      },
      repositorySearch: async (query) => ({
        repositories: [repo(1, "one/plugin")],
        audit: { query, requests: 2, shards: 1, repositories: 1 },
      }),
      codeSearch: async () => ({
        repositories: [
          { id: 1, node_id: "R_1", full_name: "one/plugin" },
          { id: 2, node_id: "R_2", full_name: "two/plugin" },
        ],
        requests: 2,
        matches: 2,
        totalMatches: 2,
        complete: true,
      }),
      npmSearch: async () => ({
        repositories: ["ONE/plugin", "three/plugin"],
        packages: 2,
        requests: 1,
        complete: true,
      }),
    });

    expect(result.candidates).toHaveLength(3);
    const first = result.candidates.find(
      (candidate) => candidate.fullName.toLowerCase() === "one/plugin"
    );
    expect(first?.sources).toEqual([
      "github-repository:topic",
      "github-code:marker",
      "npm:npm",
    ]);
    expect(result.audit.complete).toBe(true);
    expect(result.audit.sources).toHaveLength(3);
  });

  it("adds a pushed qualifier in incremental mode", async () => {
    let receivedQuery = "";
    await discoverRepositories({
      mode: "incremental",
      since: new Date("2026-08-20T00:00:00Z"),
      config: { repositoryQueries: [{ id: "x", query: "topic:dsh-plugin" }], codeQueries: [], npmQueries: [] },
      repositorySearch: async (query) => {
        receivedQuery = query;
        return {
          repositories: [],
          audit: { query, requests: 1, shards: 1, repositories: 0 },
        };
      },
    });
    expect(receivedQuery).toContain("pushed:>=2026-08-20T00:00:00Z");
  });
});

describe("discovery partial recovery", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("retains partial results from all engines and runs every subsequent source", async () => {
    const repositoryRequest = vi.fn(async (query: string) => ({
      total_count: query.startsWith("short") ? 2 : 1,
      incomplete_results: false,
      items: [repo(query.startsWith("short") ? 1 : 2, query.startsWith("short") ? "partial/repository" : "later/repository")],
    }));
    const codeRequest = vi.fn(async (query: string, page: number) => {
      if (query === "timeout-code" && page === 2) throw new Error("timeout");
      return {
        total_count: query === "timeout-code" ? 2 : 1,
        incomplete_results: false,
        items: [{ repository: { id: query === "timeout-code" ? 3 : 4,
          full_name: query === "timeout-code" ? "partial/code" : "later/code" } }],
      };
    });
    const npmFetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const failedSource = url.searchParams.get("text") === "timeout-npm";
      if (failedSource && url.searchParams.get("from") === "1") throw new Error("timeout");
      return new Response(JSON.stringify({ total: failedSource ? 2 : 1, objects: [
        { package: { name: "plugin", links: { repository: failedSource ? "github:partial/npm" : "github:later/npm" } } },
      ] }), { status: 200 });
    });
    const result = await discoverRepositories({
      config: {
        repositoryQueries: [{ id: "short", query: "short" }, { id: "later", query: "later" }],
        codeQueries: [{ id: "timeout", query: "timeout-code" }, { id: "later", query: "later-code" }],
        npmQueries: [{ id: "timeout", query: "timeout-npm" }, { id: "later", query: "later-npm" }],
      },
      partitionOptions: { request: repositoryRequest, semanticRetries: 0 },
      codeOptions: { request: codeRequest, perPage: 1, semanticRetries: 0 },
      npmOptions: { fetchImpl: npmFetch as typeof fetch, pageSize: 1, maxPages: 2 },
    });
    expect(result.candidates.map((candidate) => candidate.fullName)).toEqual([
      "partial/repository", "later/repository", "partial/code", "later/code", "partial/npm", "later/npm",
    ]);
    expect(result.candidates[0].repo).toEqual(repo(1, "partial/repository"));
    expect(result.audit.complete).toBe(false);
    expect(result.audit.sources.map(({ id, status, candidates, requests }) => ({ id, status, candidates, requests }))).toEqual([
      { id: "github-repository:short", status: "partial", candidates: 1, requests: 2 },
      { id: "github-repository:later", status: "complete", candidates: 1, requests: 2 },
      { id: "github-code:timeout", status: "partial", candidates: 1, requests: 3 },
      { id: "github-code:later", status: "complete", candidates: 1, requests: 2 },
      { id: "npm:timeout", status: "partial", candidates: 1, requests: 2 },
      { id: "npm:later", status: "complete", candidates: 1, requests: 1 },
    ]);
  });

  it("reports empty initial failures accurately while still attempting later sources", async () => {
    const result = await discoverRepositories({
      config: {
        repositoryQueries: [{ id: "failure", query: "failure" }],
        codeQueries: [{ id: "failure", query: "failure" }],
        npmQueries: [{ id: "failure", query: "failure" }, { id: "later", query: "later" }],
      },
      partitionOptions: { request: async () => { throw new Error("timeout"); } },
      codeOptions: { request: async () => { throw new Error("timeout"); } },
      npmOptions: { fetchImpl: (async (input) => {
        if (new URL(String(input)).searchParams.get("text") === "failure") throw new Error("timeout");
        return new Response(JSON.stringify({ total: 0, objects: [] }), { status: 200 });
      }) as typeof fetch },
    });
    expect(result.candidates).toEqual([]);
    expect(result.audit.complete).toBe(false);
    expect(result.audit.sources.map(({ status, requests, candidates }) => ({ status, requests, candidates }))).toEqual([
      { status: "failed", requests: 1, candidates: 0 },
      { status: "failed", requests: 1, candidates: 0 },
      { status: "failed", requests: 1, candidates: 0 },
      { status: "complete", requests: 1, candidates: 0 },
    ]);
  });

  it.each(["partial", "failed"] as const)("includes a %s npm source in overall completeness", async (status) => {
    const result = await discoverRepositories({
      config: {
        repositoryQueries: [{ id: "empty", query: "empty" }], codeQueries: [],
        npmQueries: [{ id: "npm", query: "npm" }],
      },
      partitionOptions: { request: async () => ({ total_count: 0, incomplete_results: false, items: [] }) },
      npmOptions: {
        maxPages: 1, pageSize: 1,
        fetchImpl: (async () => {
          if (status === "failed") throw new Error("timeout");
          return new Response(JSON.stringify({ total: 2, objects: [{ package: { name: "one" } }] }), { status: 200 });
        }) as typeof fetch,
      },
    });
    expect(result.audit.sources[0].status).toBe("complete");
    expect(result.audit.sources[1].status).toBe(status);
    expect(result.audit.complete).toBe(false);
  });

  it("retains a successful incremental page when the next page fails", async () => {
    vi.stubEnv("DSH_INCREMENTAL_REPOSITORY_PAGES", "2");
    const result = await discoverRepositories({
      mode: "incremental",
      config: { repositoryQueries: [{ id: "window", query: "window" }], codeQueries: [], npmQueries: [] },
      partitionOptions: {
        perPage: 1,
        request: async (_query, page) => {
          if (page === 2) throw new Error("timeout");
          return { total_count: 2, incomplete_results: false, items: [repo(1, "first/plugin")] };
        },
      },
    });
    expect(result.candidates.map((candidate) => candidate.fullName)).toEqual(["first/plugin"]);
    expect(result.audit.sources[0]).toMatchObject({ status: "partial", candidates: 1, requests: 2 });
    expect(result.audit.complete).toBe(false);
  });
});
