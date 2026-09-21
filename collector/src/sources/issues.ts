/**
 * 数据源 4：本仓库提交插件 issue（label: submission）
 * 原理：读取 open issues 正文 → 正则提取 github.com/owner/repo → 并入候选池
 * 不关闭 issue、不评论（纯只读）；最终收录与否由特征检测决定。
 */

import type { SubmissionIssue } from "@dsh-top100/schema";
import { githubFetch, GithubError } from "../github.js";

/** 迁移后的入口优先，旧仓库保留为历史提交来源。 */
const SUBMISSION_REPOS = ["evaldock/dsh-top100", "2BingLing/dsh-market"] as const;
const SELF_REPOS = new Set(SUBMISSION_REPOS.map(repo => repo.toLowerCase()));
const SUBMISSION_LABEL = "submission";

interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels?: Array<{ name?: string }>;
  pull_request?: unknown;
}

/** 从 issue 正文提取 GitHub 仓库地址（兼容多种写法） */
export function extractRepoFromText(text: string): string[] {
  const out: string[] = [];
  // 匹配 github.com/owner/repo（支持 /tree/ /blob/ /issues/ 等后缀）
  const re = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const owner = m[1].toLowerCase();
    const repo = m[2].toLowerCase().replace(/\.git$/, "");
    // 过滤明显非仓库路径（如 github.com 自身、market 仓库自己、GitHub 附件域）
    if (owner === "github" || owner === "user-attachments") continue;
    if (repo === "issues" || repo === "settings" || repo === "marketplace") continue;
    const fn = `${owner}/${repo}`;
    if (!SELF_REPOS.has(fn) && !out.includes(fn)) out.push(fn);
  }
  return out;
}

/** 从 issue 正文提取「作者自述简介」（模板字段：**作者自述简介**：…），取一行
 * 兼容 markdown 加粗（**作者自述**：/ **自定义简介**：）与裸写法（作者自述：） */
export function extractIntroByAuthor(body: string | null): string | undefined {
  if (!body) return undefined;
  // 1) 方括号形式（模板推荐写法，可多行）
  const braced = body.match(
    /(?:作者自述|自定义简介|作者自述简介)\s*\*{0,2}\s*[：:]\*{0,2}\s*\[([\s\S]*?)\]/m
  );
  if (braced) {
    const text = braced[1].trim();
    if (text) return text;
  }
  // 2) 裸写法（单行）
  const plain = body.match(
    /(?:作者自述|自定义简介|作者自述简介)\s*\*{0,2}\s*[：:]\*{0,2}\s*([^\n\r]+)/
  );
  const text = plain?.[1]?.trim();
  return text || undefined;
}

/** 提交插件 issue 的提取结果。仓库和编号一起标识 issue。 */
export interface SubmissionMeta {
  submissionIssues: SubmissionIssue[];
  introByAuthor?: string;
}

/** 搜索/周发现已经加入候选时，仍须合并提交来源和作者自述。 */
export function mergeSubmissionMetadata(
  target: Partial<SubmissionMeta>, source: Partial<SubmissionMeta>,
): void {
  if (source.submissionIssues?.length) {
    const issues = [...(target.submissionIssues ?? [])];
    for (const issue of source.submissionIssues) {
      if (!issues.some(existing => existing.repository.toLowerCase() === issue.repository.toLowerCase()
        && existing.number === issue.number)) issues.push(issue);
    }
    target.submissionIssues = issues;
  }
  target.introByAuthor ??= source.introByAuthor;
}

export async function fetchSubmissionRepos(): Promise<Map<string, SubmissionMeta>> {
  return fetchSubmissionReposBy("plugin");
}

export async function fetchPackSubmissionRepos(): Promise<Map<string, SubmissionMeta>> {
  return fetchSubmissionReposBy("pack");
}

async function fetchSubmissionReposBy(kind: "plugin" | "pack"): Promise<Map<string, SubmissionMeta>> {
  const out = new Map<string, SubmissionMeta>();
  let counted = 0;
  for (const repository of SUBMISSION_REPOS) {
    try {
      for (let page = 1; ; page++) {
        // 不按 label 查询：未打标签的标题提交同样有效。GitHub issues API 也返回 PR。
        const issues = await githubFetch<GithubIssue[]>(
          `/repos/${repository}/issues?state=open&per_page=100&page=${page}`
        );
        for (const issue of issues) {
          if (issue.pull_request || issue.state !== "open") continue;
          const isPack = /^\[(?:提交整合包|submit pack)\]/i.test(issue.title);
          const isPlugin = /^\[(?:提交插件|submit(?: plugin)?)\]/i.test(issue.title);
          const labelled = (issue.labels ?? []).some(label => label.name === SUBMISSION_LABEL);
          if (kind === "pack" ? !isPack : isPack || !(isPlugin || labelled)) continue;
          counted++;
          const source: SubmissionMeta = {
            submissionIssues: [{ repository, number: issue.number,
              url: `https://github.com/${repository}/issues/${issue.number}` }],
            introByAuthor: extractIntroByAuthor(issue.body),
          };
          for (const fullName of extractRepoFromText(`${issue.title}\n${issue.body ?? ""}`)) {
            const meta = out.get(fullName) ?? { submissionIssues: [] };
            mergeSubmissionMetadata(meta, source);
            out.set(fullName, meta);
          }
        }
        if (issues.length < 100) break;
      }
    } catch (error) {
      if (error instanceof GithubError && error.status === 401) throw error;
      // 补充源失败不阻断其他仓库，保留此前已读取的分页。
      console.warn(`  issues scan failed: ${repository}`);
    }
  }
  console.log(`  issues:${kind}-submission -> ${counted} issues, ${out.size} repos`);
  return out;
}
