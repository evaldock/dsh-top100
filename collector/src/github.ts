/**
 * GitHub API 客户端（轻量 fetch 封装）
 * - 自动带 token（GITHUB_TOKEN 环境变量）
 * - 简单重试（429/5xx）
 * - 返回 typed 数据
 */

import { createHash } from 'node:crypto';
import { GithubRateLimitGate, githubResource } from './github-rate-limit.js';

const API_BASE = "https://api.github.com";
let rateLimitCredential: string | undefined;
let rateLimitGate = new GithubRateLimitGate();
function currentRateLimitGate(): GithubRateLimitGate {
  const fingerprint = createHash('sha256').update(process.env.GITHUB_TOKEN ?? '').digest('hex');
  if (fingerprint !== rateLimitCredential) {
    rateLimitCredential = fingerprint;
    rateLimitGate = new GithubRateLimitGate();
  }
  return rateLimitGate;
}

// A revoked credential is a run-wide failure, never a missing repository/file.
// The credential is compared only in memory; neither it nor provider bodies are logged.
let rejectedCredential: string | undefined;
export function assertGithubAuthenticationHealthy(): void {
  if (rejectedCredential && rejectedCredential === process.env.GITHUB_TOKEN) {
    throw new GithubError('github-auth-invalid', 401, API_BASE);
  }
}
export function isGithubAuthenticationFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    seen.add(error);
    if (error instanceof GithubError && error.status === 401) return true;
    error = (error as { cause?: unknown }).cause;
  }
  return false;
}

export class GithubError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string
  ) {
    super(message);
  }
}

/** Private metadata is usable only to suppress publication, never as report content. */
export function rejectPrivateRepository(
  repository: { private?: boolean; visibility?: string; full_name?: string; fullName?: string },
  requestedFullName: string,
  definitiveRejections: Set<string>,
  knownPrivateIds: Set<string>,
): { fullName: string; reason: string } | null {
  if (repository.private !== true && repository.visibility !== "private") return null;
  definitiveRejections.add(requestedFullName.toLowerCase());
  knownPrivateIds.add(requestedFullName.toLowerCase());
  const canonical = repository.full_name ?? repository.fullName;
  if (canonical) {
    definitiveRejections.add(canonical.toLowerCase());
    knownPrivateIds.add(canonical.toLowerCase());
  }
  return { fullName: "[private repository]", reason: "private repository" };
}

/** A later private refresh also redacts failures recorded earlier in this run. */
export function redactPrivateRejections(
  records: ReadonlyArray<{ fullName: string; reason: string }>, knownPrivateIds: ReadonlySet<string>,
): Array<{ fullName: string; reason: string }> {
  return records.map(record => knownPrivateIds.has(record.fullName.toLowerCase())
    ? { fullName: "[private repository]", reason: "private repository" }
    : { ...record });
}

/** Stamp only freshly received repository metadata; cached responses retain this time. */
export function stampRepositoryObservations<T>(payload: T, at = new Date().toISOString()): T {
  const stamp = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const repo = value as Record<string, unknown>;
    if (typeof repo.full_name === "string" && Number.isSafeInteger(repo.stargazers_count)
      && (repo.stargazers_count as number) >= 0) repo.starsObservedAt = at;
  };
  if (Array.isArray(payload)) payload.forEach(stamp);
  else if (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items))
    ((payload as unknown as { items: unknown[] }).items).forEach(stamp);
  else stamp(payload);
  return payload;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  accept?: string; // 例如 raw 用于 README
}

export async function githubFetch<T>(
  path: string,
  opts: RequestOptions = {},
  maxRetries = 3
): Promise<T> {
  assertGithubAuthenticationHealthy();
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const limits = currentRateLimitGate();
  const resource = githubResource(url);
  // Scheduler probes must return promptly so its persisted retry policy stays in control.
  if (maxRetries === 1 && limits.retryAt(resource) > Date.now()) {
    throw new GithubError('github-rate-limited', 429, API_BASE);
  }
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await limits.wait(resource, assertGithubAuthenticationHealthy);
      const headers: Record<string, string> = {
        "User-Agent": "dsh-market-collector",
        Accept: opts.accept ?? "application/vnd.github+json",
      };
      const token = process.env.GITHUB_TOKEN;
      if (token) headers.Authorization = `token ${token}`;
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method: opts.method ?? "GET",
        signal: AbortSignal.timeout(30_000),
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });

      if (res.status === 401) {
        rejectedCredential = process.env.GITHUB_TOKEN;
        throw new GithubError('github-auth-invalid', 401, API_BASE);
      }

      if (await limits.observe(res, resource, attempt)) {
        lastError = new GithubError(`GitHub API ${res.status}`, res.status, url);
        if (!res.bodyUsed) await res.body?.cancel();
        // Wait at the next dispatch, sharing the full server cooldown across workers.
        // A one-attempt preflight records the cooldown but returns without blocking.
        if (attempt + 1 === maxRetries) break;
        continue;
      }

      if (!res.ok) {
        throw new GithubError(`GitHub API ${res.status}`, res.status, url);
      }

      if (res.status === 204) return undefined as T;
      return stampRepositoryObservations((await res.json()) as T);
    } catch (err) {
      lastError = err as Error;
      if (err instanceof GithubError && err.status < 500 && err.status !== 429) {
        throw err; // 4xx 不重试
      }
      // 网络错误/5xx：指数退避重试
      await sleep(1000 * Math.pow(2, attempt));
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}

/** 拉取仓库指定目录的文件列表（用于特征检测） */
export async function fetchRepoRoot(
  fullName: string,
  branch?: string | null,
  dirPath = ""
): Promise<RepoContentItem[]> {
  const dir = dirPath ? `/${dirPath}` : "";
  const path = `/repos/${fullName}/contents${dir}${branch ? `?ref=${branch}` : ""}`;
  try {
    const items = await githubFetch<RepoContentItem[]>(path);
    return Array.isArray(items) ? items : [];
  } catch (err) {
    if (err instanceof GithubError && err.status === 404) return [];
    throw err;
  }
}

/** 拉取 raw 文件内容（README/SKILL.md/package.json 等，限 1MB） */
export async function fetchRawFile(
  fullName: string,
  filePath: string,
  branch?: string | null
): Promise<string | null> {
  assertGithubAuthenticationHealthy();
  const url = `https://raw.githubusercontent.com/${fullName}/${branch ? branch : "HEAD"}/${filePath}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "dsh-market-collector" },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubError(`GitHub raw ${res.status}`, res.status, url);
  const text = await res.text();
  return text.length > 1_000_000 ? text.slice(0, 1_000_000) : text;
}

/** 通过 contents API 读取小文件；可固定到与目录探测相同的分支。 */
export async function fetchFileViaApi(
  fullName: string,
  filePath: string,
  branch?: string | null
): Promise<{ content: string; sha: string } | null> {
  try {
    const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
    const data = await githubFetch<{ content: string; sha: string }>(
      `/repos/${fullName}/contents/${filePath}${ref}`
    );
    if (!data?.content) return null;
    return { content: Buffer.from(data.content, "base64").toString("utf-8"), sha: data.sha };
  } catch (error) {
    if (isGithubAuthenticationFailure(error)) throw error;
    return null;
  }
}

/** 分页遍历 */
export async function paginate<T>(
  path: string,
  perPage = 100,
  maxPages = 10
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const items = await githubFetch<T[]>(`${path}${sep}per_page=${perPage}&page=${page}`);
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- 类型 ----------

export interface RepoContentItem {
  name: string;
  path: string;
  type: "file" | "dir" | "submodule" | "symlink";
  size: number;
}

export interface GithubRepo {
  starsObservedAt?: string;
  private?: boolean;
  visibility?: string;
  id: number;
  node_id?: string;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  homepage: string | null;
  license: { spdx_id: string | null } | null;
  topics: string[];
  pushed_at: string;
  created_at: string;
  updated_at: string;
  default_branch: string | null;
  archived: boolean;
  fork: boolean;
}

export interface GithubSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GithubRepo[];
}

export interface GithubCodeRepository {
  id: number;
  node_id?: string;
  full_name: string;
}

export interface GithubCodeSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: Array<{ repository: GithubCodeRepository }>;
}
