import { hasSkillSourceEvidence, restoreKnownSkillSource } from './skills-source-refresh.js';
import { selectedReadmeEvidence } from "./readme-evidence.js";
import { reviewedReadmeSource, summarizeSelectedReadme } from "./reviewed-summary.js";
import { reviewedFunctionEvidence } from "./reviewed-evidence.js";
import { reviewFunctionChanges } from './source-change-review.js';
import { applyFunctionEvidenceCheck } from "./reviewed-evidence-state.js";
import { DEFAULT_MODEL, DEFAULT_MODEL_CONCURRENCY, DEFAULT_MODEL_MAX_TOKENS } from "./model-defaults.js";
import { refreshCachedInstallEvidence } from "./install-cache.js";
import { modelRequestsEnabled, dailySourceChangesOnly, withDailyModelRequest, isDailyBoardRun, isDailySkillsRun } from "./model-requests.js";
import { bindDailySourceJob } from "./daily-model-scope.js";
/**
 * collector 主流程（v2：并发 + 缓存）
 * 扫描 → 去重合并 → 特征检测 → 元数据+README → 实用五维评分 → 输出 data/plugins.json
 *
 * 用法：npm run collect（根目录，自动加载 .env 的 GITHUB_TOKEN）
 * 输出：data/plugins.json（市场数据）、data/report.json（统计报告）
 */

import { mkdirSync, writeFileSync, readFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DshPlugin, DshPack, MarketData } from "@dsh-top100/schema";
import "./env.js"; // 加载仓库根 .env（GITHUB_TOKEN）
import {
  githubFetch,
  assertGithubAuthenticationHealthy,
  isGithubAuthenticationFailure,
  fetchRepoRoot,
  fetchRawFile,
  rejectPrivateRepository,
  redactPrivateRejections,
  type GithubRepo,
} from "./github.js";
import { assertGithubAccess, GithubAccessError, githubAccessCode } from './github-auth.js';
import { takeWeeklyCandidates, acknowledgeWeeklyCandidates, deferWeeklyCandidates } from './weekly-discovery.js';
import { fetchRepositoryUpdates } from "./github-batch.js";
import { fetchAwesomeEntries } from "./sources/awesome.js";
import { scanOrg } from "./sources/github-search.js";
import { discoverRepositories, type DiscoveryMode } from "./sources/discovery.js";
import { fetchSubmissionRepos, fetchPackSubmissionRepos, mergeSubmissionMetadata, type SubmissionMeta } from "./sources/issues.js";
import { detectPlugin, detectNeedsConfig, DISCOVERY_POLICY_VERSION, ReviewedTargetValidationError, type Detection } from "./detect.js";
import { reviewedPluginTargets, matchesReviewedTarget, quarantineUnreviewedTarget } from "./reviewed-targets.js";
import { canRestorePrevious, restoredDiscovery, canReuseDetectionCache } from "./discovery-policy.js";
import { loadSelectedReadme, getCachedSelectedReadme, loadSelectedSkill, SOURCE_DOCUMENT_CACHE_VERSION } from "./selected-readme.js";
import { computePracticalScore, computeP99Stars } from "./scoring.js";
import { cached, cacheGet, cacheSet } from "./cache.js";
import { runPool, collectionConcurrency } from "./pool.js";
import {
  fallbackDescriptionZh,
  isGenericDescriptionZh,
  translateWithDeepSeek,
  buildTranslationRequest,
} from "./llm.js";
import { INSTALL_PARSER_VERSION, parseInstallCommands } from "./install-parse.js";
import { normalizeTags } from "./tag-normalize.js";
import { type DescriptionJob } from "./description-jobs.js";
import { summarizeReadme } from "./summary.js";
import { collectPacks } from "./packs.js";

/** 检测结果缓存（增量核心：repo 未变化时复用，跳过重复检测网络调用） */
interface DetectCache {
  schemaVersion: number;
  checkedAt: string;
  installParserVersion?: number;
  sourceDocumentVersion?: number;
  hostDetectionVersion?: number;
  readmeEvidence?: import("@dsh-top100/schema").ReadmeEvidence;
  pushedAt: string;
  detection: Detection;
  isCordis: boolean;
  needsConfig: boolean;
  readmeSummary: string | null;
  installParsed: { commands: string[]; source: string };
  hasSkillMd: boolean;
  /** 子目录 bundle 的插件子目录路径（如 dsh-pet/），null = 常规根目录插件 */
  subdir: string | null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
const EXCLUDED_REPOS = new Set([
  "deepseek-ai/deepseek-harness", // 官方本体，非插件
  "deepseek-ai/awesome-deepseek-harness",
]);

interface Candidate {
  repo: GithubRepo | null;
  fullName: string;
  sources: string[];
  awesomeName?: string;
  awesomeDescription?: string;
  /** 包含所属仓库的提交 issue，供关联和后续人工回复使用。 */
  submissionIssues?: SubmissionMeta["submissionIssues"];
  /** 作者自述简介（提交 issue 时提供，可选；存到 plugin.introByAuthor） */
  introByAuthor?: string;
}

interface Detected {
  candidate: Candidate;
  plugin: DshPlugin;
  repo: GithubRepo;
  readmeContent: string | null;
  hasSkillMd: boolean;
}

import { type ZhEntry } from "./zh-util.js";
import { atomicOperationJson } from './operation-state.js';
import { carryForwardDailyCategories } from "./daily-categories.js";
import { prepareDailyDescriptions, runDailyDescriptions, updateDailyDescriptionCache } from "./daily-descriptions.js";

interface ZhCache {
  updatedAt: string;
  entries: Record<string, ZhEntry>;
}
const ZH_CACHE_FILE = join(DATA_DIR, "zh-cache.json");

function loadZhCache(): Map<string, ZhEntry> {
  try {
    const raw = JSON.parse(readFileSync(ZH_CACHE_FILE, "utf-8")) as ZhCache;
    if (!raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries)) throw new Error('invalid-cache');
    return new Map(Object.entries(raw.entries));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw new Error('chinese-cache-invalid');
  }
}
function saveZhCache(entries: Map<string, ZhEntry>): void {
  try {
    const out: ZhCache = { updatedAt: new Date().toISOString(), entries: Object.fromEntries(entries) };
    mkdirSync(DATA_DIR, { recursive: true });
    atomicOperationJson(ZH_CACHE_FILE, out);
  } catch {
    throw new Error('chinese-cache-save-failed');
  }
}

/* ===== B2：已收录延续性——读取上次完整插件记录（id → plugin）===== */
function loadPreviousPlugins(): Map<string, DshPlugin> {
  try {
    const raw = readFileSync(join(DATA_DIR, "plugins.json"), "utf-8");
    const prev = JSON.parse(raw) as MarketData;
    if (!Array.isArray(prev.plugins) || !prev.plugins.length) throw new Error('invalid-baseline');
    return new Map(prev.plugins.map((p) => [p.id.toLowerCase(), p]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw new Error('collector-baseline-invalid');
  }
}

async function main() {
  const concurrency = collectionConcurrency();
  await assertGithubAccess();

  console.log("=== DSH Market collector v2 ===");
  console.log("[1/5] 扫描数据源...");

  // 1. awesome 列表（人工策展）
  const awesomeEntries = await fetchAwesomeEntries(async (o, r, p) => {
    for (const branch of ["main", "master"]) {
      const res = await fetch(
        `https://raw.githubusercontent.com/${o}/${r}/${branch}/${p}`,
        { headers: { "User-Agent": "dsh-market-collector" } }
      );
      if (res.ok) return res.text();
    }
    return null;
  });
  const awesomeByFullName = new Map(
    awesomeEntries.map((e) => [e.fullName, e])
  );
  console.log(`  awesome lists -> ${awesomeByFullName.size} entries`);

  // 2. GitHub 分片搜索 + 代码标记 + npm 补漏 + 组织
  const discoveryMode: DiscoveryMode =
    process.env.DSH_DISCOVERY_MODE === "incremental" ? "incremental" : "full";
  const configuredSince = process.env.DSH_DISCOVERY_SINCE
    ? new Date(process.env.DSH_DISCOVERY_SINCE)
    : undefined;
  if (configuredSince && Number.isNaN(configuredSince.getTime())) {
    throw new Error("DSH_DISCOVERY_SINCE must be an ISO-8601 date");
  }
  const discovery = await discoverRepositories({
    mode: discoveryMode,
    since: configuredSince,
  });
  assertGithubAuthenticationHealthy();
  const orgRepos = await scanOrg();

  // 2.5 提交插件 issue（人工提交的仓库，并入候选池走相同检测流程）
  // fullName(lower) -> 带仓库的 issue 关联与作者自述
  const issueRepos = await fetchSubmissionRepos();
  const weekly = process.env.DSH_DAILY_UPDATE === '1'
    ? await takeWeeklyCandidates(DATA_DIR, 200) : { candidates: [], receipt: [] };

  // 3. 合并去重
  const candidates = new Map<string, Candidate>();
  const addCandidate = (
    fullName: string,
    repo: GithubRepo | null,
    source: string,
    meta?: { name?: string; description?: string } & Partial<SubmissionMeta>
  ) => {
    const key = fullName.toLowerCase();
    if (EXCLUDED_REPOS.has(key)) return;
    const existing = candidates.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      if (!existing.repo && repo) existing.repo = repo;
      if (meta) mergeSubmissionMetadata(existing, meta);
      return;
    }
    candidates.set(key, {
      repo,
      fullName,
      sources: [source],
      awesomeName: meta?.name,
      awesomeDescription: meta?.description,
      submissionIssues: meta?.submissionIssues,
      introByAuthor: meta?.introByAuthor,
    });
  };
  for (const fn of awesomeByFullName.keys()) {
    const e = awesomeByFullName.get(fn)!;
    addCandidate(fn, null, e.source, { name: e.name, description: e.description });
  }
  for (const candidate of discovery.candidates) {
    for (const source of candidate.sources) {
      addCandidate(candidate.fullName, candidate.repo, source);
    }
  }
  for (const r of orgRepos) addCandidate(r.full_name, r, "org");
  for (const candidate of weekly.candidates) {
    for (const source of candidate.sources) addCandidate(candidate.fullName, null, source);
  }
  for (const [fn, meta] of issueRepos) {
    addCandidate(fn, null, "issue-submission", {
      submissionIssues: meta.submissionIssues,
      introByAuthor: meta.introByAuthor,
    });
  }

  // Keep the small explicitly reviewed cohort eligible for current validation,
  // including repositories outside the incremental discovery window.
  for (const fullName of Object.keys(reviewedPluginTargets)) addCandidate(fullName, null, "reviewed-package");

  const all = [...candidates.values()];
  console.log(`  candidates: ${all.length}`);

  console.log(`[2/5] 特征检测 + 元数据抓取（并发 ${concurrency}，带缓存）...`);
  const detected: Detected[] = [];
  const rejected: { fullName: string; reason: string }[] = [];
  const definitiveRejections = new Set<string>();
  const knownPrivateIds = new Set<string>();
  const invalidReviewedTargets = new Set<string>();
  let checkedCandidates = 0;

  await runPool(all, async (candidate) => {
    try {
      assertGithubAuthenticationHealthy();
      // repo 元数据（缓存 24h）
      let repo = candidate.repo;
      if (!repo) {
        repo = await cached<GithubRepo>("repos", candidate.fullName, () =>
          githubFetch<GithubRepo>(`/repos/${candidate.fullName}`)
        );
      }
      const privateRejection = rejectPrivateRepository(repo, candidate.fullName, definitiveRejections, knownPrivateIds);
      if (privateRejection) {
        rejected.push(privateRejection);
        return;
      }
      if (repo.fork || repo.archived) {
        definitiveRejections.add(candidate.fullName.toLowerCase());
        definitiveRejections.add(repo.full_name.toLowerCase());
        rejected.push({ fullName: candidate.fullName, reason: "fork/archived" });
        return;
      }

      // ===== 检测结果缓存（增量核心）：repo 未变化则复用，跳过全部检测网络调用 =====
      const DETECT_TTL = 7 * 24 * 3600_000;
      const cachedDetect = cacheGet<DetectCache>("detect", candidate.fullName, DETECT_TTL);
      const reviewedTarget = reviewedPluginTargets[candidate.fullName.toLowerCase()];
      let detection: Awaited<ReturnType<typeof detectPlugin>>;
      let isCordis: boolean;
      let needsConfig: boolean;
      let readmeSummary: string | null;
      let installParsed: { commands: string[]; source: string };
      let hasSkillMd: boolean;
      let readmeContent: string | null;
      let subdir: string | null = null;
      let checkedAt = new Date().toISOString();
      const readmeProof = () => readmeContent !== null && readmeSummary !== null && !hasSkillMd
        ? selectedReadmeEvidence(repo!.full_name, detection.packageName, detection.pluginPath, repo!.pushed_at, readmeContent, readmeSummary)
        : cachedDetect?.readmeEvidence;

      if (cachedDetect && (cachedDetect.detection.kind !== "host" || cachedDetect.hostDetectionVersion === 1) && matchesReviewedTarget(cachedDetect.detection, reviewedTarget)
        && canReuseDetectionCache(cachedDetect, repo.pushed_at, INSTALL_PARSER_VERSION)) {
        checkedAt = cachedDetect.checkedAt;
        // 命中：仓库未变化，直接复用检测产物（零网络调用）
        detection = cachedDetect.detection;
        isCordis = cachedDetect.isCordis;
        needsConfig = cachedDetect.needsConfig;
        readmeSummary = cachedDetect.readmeSummary;
        installParsed = cachedDetect.installParsed;
        hasSkillMd = cachedDetect.hasSkillMd;
        subdir = cachedDetect.subdir ?? null;
        readmeContent = null; // 评分用：下面从 readmes 缓存取（24h 内必有）
        if (!detection.isPlugin) {
          definitiveRejections.add(candidate.fullName.toLowerCase());
          definitiveRejections.add(repo.full_name.toLowerCase());
          rejected.push({ fullName: candidate.fullName, reason: "no plugin markers (cached)" });
          return;
        }
      } else {
        // 未命中/仓库变化：完整检测流程
        // 根目录文件列表（缓存 24h）
        const rootItems = await cached(
          "roots",
          `${candidate.fullName}:${repo.pushed_at}`,
          () => fetchRepoRoot(repo!.full_name, repo!.default_branch)
        );

        // 特征检测（只基于文件列表）
        detection = await detectPlugin(candidate.fullName, rootItems, repo!.default_branch, { primaryOnly: true, reviewedTarget });
        if (!detection.isPlugin) {
          definitiveRejections.add(candidate.fullName.toLowerCase());
          definitiveRejections.add(repo.full_name.toLowerCase());
          rejected.push({ fullName: candidate.fullName, reason: "no validated plugin package" });
          return;
        }
        subdir = detection.pluginPath;
        isCordis = detection.type === "cordis-plugin";

        // 所选子包缺少文档时保留未知，不把根产品 README 当作子包功能或安装证据。
        readmeContent = await loadSelectedReadme(candidate.fullName, subdir, repo.pushed_at, repo!.default_branch);

        // skill 型：抓 SKILL.md 做摘要
        let skillMd: string | null = null;
        if (detection.skillFiles.length > 0) {
          skillMd = await loadSelectedSkill(candidate.fullName, detection.skillFiles[0], repo.pushed_at, repo.default_branch);
        }

        needsConfig = detectNeedsConfig(readmeContent);
        readmeSummary = skillMd
          ? `SKILL.md: ${summarizeReadme(skillMd, 700)}${readmeContent ? ` README: ${summarizeReadme(readmeContent, 420)}` : ""}`
          : readmeContent ? summarizeSelectedReadme(candidate.fullName, { packageName: detection.packageName, repositoryPath: subdir }, readmeContent) : null;
        installParsed = parseInstallCommands(readmeContent);
        hasSkillMd = detection.skillFiles.length > 0;

        // 写入检测缓存（含派生产物）
        cacheSet<DetectCache>("detect", candidate.fullName, {
          schemaVersion: DISCOVERY_POLICY_VERSION,
          checkedAt,
          installParserVersion: INSTALL_PARSER_VERSION,
          sourceDocumentVersion: SOURCE_DOCUMENT_CACHE_VERSION, hostDetectionVersion: 1, readmeEvidence: readmeProof(),
          pushedAt: repo.pushed_at,
          detection,
          isCordis,
          needsConfig,
          readmeSummary,
          installParsed,
          hasSkillMd,
          subdir,
        });
      }

      // 检测缓存命中时只补取同一个所选目录的文档，不跨回仓库根目录。
      if (readmeContent === null) {
        readmeContent = getCachedSelectedReadme(candidate.fullName, subdir, repo.pushed_at, repo.default_branch);
      }

      const selectedIdentity = { packageName: detection.packageName, repositoryPath: subdir };
      const reviewedReadme = reviewedReadmeSource(candidate.fullName, selectedIdentity);
      if (reviewedReadme && readmeContent === null && readmeSummary !== reviewedReadme.sourceReadme) {
        readmeContent = await loadSelectedReadme(candidate.fullName, subdir, repo.pushed_at, repo.default_branch);
      }
      if (reviewedReadme && readmeContent !== null) {
        const normalized = summarizeSelectedReadme(candidate.fullName, selectedIdentity, readmeContent);
        if (readmeSummary !== normalized) {
          readmeSummary = normalized;
          cacheSet<DetectCache>("detect", candidate.fullName, {
            schemaVersion: DISCOVERY_POLICY_VERSION, checkedAt, installParserVersion: INSTALL_PARSER_VERSION,
            sourceDocumentVersion: SOURCE_DOCUMENT_CACHE_VERSION, hostDetectionVersion: 1, readmeEvidence: readmeProof(), pushedAt: repo.pushed_at,
            detection, isCordis, needsConfig, readmeSummary, installParsed, hasSkillMd, subdir,
          });
        }
      }
      const installIdentity = { fullName: candidate.fullName, ...selectedIdentity };
      let refreshedInstall = refreshCachedInstallEvidence(installIdentity, installParsed, readmeContent);
      if (refreshedInstall.needsReadmeRefresh) {
        // Only the audited stale installation record needs a document fetch.
        try { readmeContent = await loadSelectedReadme(candidate.fullName, subdir, repo.pushed_at, repo.default_branch); }
        catch { /* Keep its untrusted commands withheld; metadata collection can continue. */ }
        refreshedInstall = refreshCachedInstallEvidence(installIdentity, refreshedInstall.installParsed, readmeContent);
      }
      if (JSON.stringify(installParsed) !== JSON.stringify(refreshedInstall.installParsed)) {
        installParsed = refreshedInstall.installParsed;
        cacheSet<DetectCache>("detect", candidate.fullName, {
          schemaVersion: DISCOVERY_POLICY_VERSION, checkedAt, installParserVersion: INSTALL_PARSER_VERSION,
          sourceDocumentVersion: SOURCE_DOCUMENT_CACHE_VERSION, hostDetectionVersion: 1, readmeEvidence: readmeProof(), pushedAt: repo.pushed_at,
          detection, isCordis, needsConfig, readmeSummary, installParsed, hasSkillMd, subdir,
        });
      }
      const installCommands =
        installParsed.commands.length > 0 ? installParsed.commands : undefined;
      const installMethod = detection.installMethod!;

      const plugin: DshPlugin = {
        id: repo!.full_name,
        type: detection.type!,
        name: candidate.awesomeName ?? repo!.name,
        owner: repo!.owner.login,
        repo: repo!.name,
        fullName: repo!.full_name,
        stars: repo!.stargazers_count,
        starsObservedAt: repo!.starsObservedAt,
        forks: repo!.forks_count,
        openIssues: repo!.open_issues_count,
        language: repo!.language,
        description: candidate.awesomeDescription ?? repo!.description ?? "",
        descriptionZh: null, // M3: DeepSeek 生成
        tags: [...repo!.topics],
        curated: false,
        homepage: repo!.homepage,
        license: repo!.license?.spdx_id ?? null,
        topics: repo!.topics,
        pushedAt: repo!.pushed_at,
        createdAt: repo!.created_at,
        updatedAt: repo!.updated_at,
        readmeSummary,
        introByAuthor: candidate.introByAuthor,
        submissionIssue: candidate.submissionIssues?.[0]?.number,
        submissionIssues: candidate.submissionIssues,
        install: {
          method: installMethod,
          discovery: {
            status: "verified",
            kind: detection.kind!,
            evidence: detection.evidence,
            checkedAt,
            policyVersion: DISCOVERY_POLICY_VERSION,
            sourceRevision: repo.pushed_at,
            ...(readmeProof() ? { readme: readmeProof() } : {}),
          },
          target: detection.type === "skill" ? "~/.agents/skills" : undefined,
          repositoryPath: detection.pluginPath ?? undefined,
          packageName: detection.packageName ?? undefined,
          needsConfig,
          commands: installCommands,
          commandSource: installParsed.source === "template" ? undefined : installParsed.source,
        },
        score: undefined as unknown as DshPlugin["score"],
        sources: candidate.sources,
        lastCheckedAt: checkedAt,
      };
      detected.push({
        candidate,
        plugin,
        repo: repo!,
        readmeContent,
        hasSkillMd: detection.skillFiles.length > 0,
      });
    } catch (err) {
      if (isGithubAuthenticationFailure(err)) throw err;
      if (err instanceof ReviewedTargetValidationError) invalidReviewedTargets.add(candidate.fullName.toLowerCase());
      rejected.push({
        fullName: candidate.fullName,
        reason: `error: ${(err as Error).message.slice(0, 80)}`,
      });
    } finally {
      checkedCandidates++;
      if (checkedCandidates % 250 === 0 || checkedCandidates === all.length) {
        console.log(`  checked: ${checkedCandidates}/${all.length}, detected: ${detected.length}, rejected: ${rejected.length}`);
      }
    }
  }, concurrency, isGithubAuthenticationFailure);

  assertGithubAuthenticationHealthy();
  // Only actual validation or a definitive exclusion acknowledges queued work.
  // Later baseline restoration after a transient error must not count as completion.
  const handledWeeklyIds = new Set([
    ...detected.map(item => item.candidate.fullName.toLowerCase()), ...definitiveRejections, ...EXCLUDED_REPOS,
  ]);

  console.log(`  detected: ${detected.length}, rejected: ${rejected.length}`);

  // 去重：GitHub 仓库转移会让同一仓库从多个旧路径进入，full_name 归一化后 id 相同
  {
    const byId = new Map<string, Detected>();
    for (const d of detected) {
      const existing = byId.get(d.plugin.id);
      if (existing) {
        for (const s of d.plugin.sources) {
          if (!existing.plugin.sources.includes(s)) existing.plugin.sources.push(s);
        }
        continue;
      }
      byId.set(d.plugin.id, d);
    }
    const deduped = [...byId.values()];
    if (deduped.length !== detected.length) {
      console.log(`  dedup: ${detected.length} -> ${deduped.length} (repo transfers)`);
    }
    detected.length = 0;
    detected.push(...deduped);
  }

  // [B2] 已收录延续性：上次收录但本次未扫描到的仓库，repos API 单独确认后补回
  // 明确拒绝不恢复；网络失败或未扫描保留旧记录并标记待复核，不伪造验证时间。
  const prevPlugins = loadPreviousPlugins();
  const currentIds = new Set(detected.map((d) => d.plugin.id.toLowerCase()));
  const missing = [...prevPlugins.keys()].filter((id) => !currentIds.has(id) && canRestorePrevious(id, definitiveRejections));
  let restored = 0;
  let filteredOut = 0;
  let unresolved = 0;
  if (missing.length > 0) {
    console.log(
      `  [B2] 上次收录 ${prevPlugins.size}，本次扫描未出现 ${missing.length}，GraphQL 批量刷新中...`
    );
    const updates = await fetchRepositoryUpdates(missing, {
      batchSize: 25,
      onProgress: (completed, total) => {
        if (completed === total || completed % 250 === 0) {
          console.log(`    [B2] 已刷新 ${completed}/${total}`);
        }
      },
    });
    for (const id of missing) {
      const prev = prevPlugins.get(id)!;
      const update = updates.get(id);
      const privateRejection = update && rejectPrivateRepository(update, id, definitiveRejections, knownPrivateIds);
      if (privateRejection) {
        rejected.push(privateRejection);
        filteredOut++;
        continue;
      }
      if (update?.fork || update?.archived) {
        filteredOut++;
        continue;
      }
      if (!update) unresolved++;
      const canonicalFullName = update?.fullName ?? prev.fullName;
      const canonicalId = canonicalFullName.toLowerCase();
      if (!canRestorePrevious(canonicalId, definitiveRejections)) { filteredOut++; continue; }
      if (canonicalId !== id && currentIds.has(canonicalId)) {
        continue;
      }
      const [owner, repoName] = canonicalFullName.split("/", 2);
      const repo: GithubRepo = {
        id: 0,
        full_name: canonicalFullName,
        name: repoName ?? prev.repo,
        owner: { login: owner ?? prev.owner },
        description: prev.description,
        stargazers_count: update?.stars ?? prev.stars,
        forks_count: update?.forks ?? prev.forks,
        open_issues_count: update?.openIssues ?? prev.openIssues,
        language: prev.language,
        homepage: prev.homepage,
        license: prev.license ? { spdx_id: prev.license } : null,
        topics: prev.topics,
        pushed_at: update?.pushedAt ?? prev.pushedAt,
        created_at: prev.createdAt,
        updated_at: update?.updatedAt ?? prev.updatedAt,
        default_branch: null,
        archived: false,
        fork: false,
      };
      detected.push({
        candidate: { fullName: canonicalFullName, repo, sources: ["restore"] },
        plugin: quarantineUnreviewedTarget({
          ...prev,
          id: canonicalId,
          fullName: canonicalFullName,
          owner: owner ?? prev.owner,
          repo: repoName ?? prev.repo,
          stars: update?.stars ?? prev.stars,
          starsObservedAt: update ? update.starsObservedAt : prev.starsObservedAt,
          forks: update?.forks ?? prev.forks,
          openIssues: update?.openIssues ?? prev.openIssues,
          pushedAt: update?.pushedAt ?? prev.pushedAt,
          updatedAt: update?.updatedAt ?? prev.updatedAt,
          lastCheckedAt: prev.lastCheckedAt,
          install: { ...prev.install, discovery: restoredDiscovery(prev) },
        }, reviewedPluginTargets[id] ?? reviewedPluginTargets[canonicalId], invalidReviewedTargets.has(id) || invalidReviewedTargets.has(canonicalId)),
        repo,
        readmeContent: null,
        hasSkillMd: false,
      });
      currentIds.add(canonicalId);
      restored++;
    }
    console.log(`  [B2] 补回 ${restored}，过滤私有/fork/归档 ${filteredOut}，刷新失败保留 ${unresolved}`);
  }

  // Verify the small source-reviewed cohort independently from README/detection caches.
  for (const item of detected) {
    if (!reviewedFunctionEvidence[item.plugin.fullName.toLowerCase()]) continue;
    let refPromise: Promise<string> | undefined;
    const check = await reviewFunctionChanges(item.plugin.fullName, item.plugin.install, async path => {
      // Resolve one commit, so all file hashes describe a single repository state.
      refPromise ??= (async () => {
        const head = await githubFetch<{ sha: string }>(`/repos/${item.plugin.fullName}/commits/${encodeURIComponent(item.repo.default_branch ?? "HEAD")}`);
        if (!/^[a-f0-9]{40}$/.test(head.sha)) throw new Error("Missing source commit");
        return head.sha;
      })();
      return fetchRawFile(item.plugin.fullName, path, await refPromise);
    }, (path, baseline) => fetchRawFile(item.plugin.fullName, path, baseline));
    if (check.sourceReview && refPromise) check.sourceReview.sourceRevision = await refPromise;
    item.plugin = applyFunctionEvidenceCheck(item.plugin, prevPlugins.get(item.plugin.fullName.toLowerCase()), check);
  }
  // Preserve selected Skill evidence across the collector's legacy mixed-summary cache.
  // This only revisits already-proven identities, never enrolls unreviewed catalog rows.
  for (const item of detected) {
    const previous = prevPlugins.get(item.plugin.fullName.toLowerCase());
    if (!previous || !hasSkillSourceEvidence(previous) || item.plugin.type !== 'skill') continue;
    const path = previous.install.discovery!.skill!.path;
    try {
      const document = await loadSelectedSkill(item.plugin.fullName, path, item.repo.pushed_at, item.repo.default_branch);
      if (document !== null) restoreKnownSkillSource(item.plugin, previous, path, document);
      else item.plugin.install.discovery = { ...item.plugin.install.discovery!, status: 'review-required',
        skill: { ...previous.install.discovery!.skill! } };
    } catch {
      item.plugin.install.discovery = { ...item.plugin.install.discovery!, status: 'review-required',
        skill: { ...previous.install.discovery!.skill! } };
    }
  }
  // The historical fallback path also passes the targeted stale-command guard.
  for (const { plugin, readmeContent } of detected) {
    const parsed = refreshCachedInstallEvidence({ fullName: plugin.fullName,
      packageName: plugin.install.packageName, repositoryPath: plugin.install.repositoryPath },
      { commands: plugin.install.commands ?? [], source: plugin.install.commandSource ?? "template" }, readmeContent).installParsed;
    plugin.install.commands = parsed.commands.length ? parsed.commands : undefined;
    plugin.install.commandSource = parsed.source === "template" ? undefined : parsed.source;
  }
  assertGithubAuthenticationHealthy();
  console.log("[3/5] 实用五维评分...");
  const p99 = computeP99Stars(detected.map((d) => d.repo.stargazers_count));
  for (const d of detected) {
    if (d.candidate.sources.includes("restore")) continue; // B2 补回项保留上次评分（readme 未重抓，避免分数失真）
    d.plugin.score = computePracticalScore(
      {
        stars: d.repo.stargazers_count,
        forks: d.repo.forks_count,
        openIssues: d.repo.open_issues_count,
        pushedAt: d.repo.pushed_at,
        hasDescription: Boolean(d.repo.description),
        hasLicense: Boolean(d.repo.license),
        hasHomepage: Boolean(d.repo.homepage),
        topics: d.repo.topics,
        readmeContent: d.readmeContent,
        hasSkillMd: d.hasSkillMd,
        needsConfig: d.plugin.install.needsConfig,
      },
      p99
    );
  }
  console.log(`  p99 stars = ${p99}`);

  console.log("[3.5/5] 中文化（DeepSeek 增量翻译）...");
  const zhCache = loadZhCache();
  const jobsPath = join(DATA_DIR, "description-jobs.json");
  let previousJobs: Record<string, DescriptionJob> = {};
  try {
    previousJobs = JSON.parse(readFileSync(jobsPath, "utf-8")).jobs;
    if (!previousJobs || typeof previousJobs !== "object" || Array.isArray(previousJobs)) throw new Error("Invalid daily description job state");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const priority = new Set<string>();
  // Prioritize the first 100 entries from both the plugin Stars and Skills lists.
  for (const type of ["cordis-plugin", "skill"]) {
    for (const d of detected.filter(d => d.plugin.type === type).sort((a, b) => b.plugin.stars - a.plugin.stars).slice(0, 100)) priority.add(d.plugin.id.toLowerCase());
  }
  // Include the last published hot/rising lists; use the same published rankings as the UI.
  try {
    const publicDir = process.env.PUBLIC_DATA_DIR ?? join(__dirname, "../../runtime/public-data");
    const published = JSON.parse(readFileSync(join(publicDir, "rankings.json"), "utf-8"));
    for (const list of [published.rankings?.hot, published.rankings?.rising]) {
      for (const entry of (list ?? []).slice(0, 100)) priority.add(String(entry.fullName).toLowerCase());
    }
  } catch { /* first publication has no growth history */ }
  const now = Date.now();
  carryForwardDailyCategories(detected.map(d => d.plugin), prevPlugins);
  const descriptionPlan = prepareDailyDescriptions(detected.map(d => d.plugin), prevPlugins, zhCache, previousJobs, priority, now);
  const { jobs } = descriptionPlan;
  const dailyScope = dailySourceChangesOnly();
  const ready = dailyScope ? descriptionPlan.ready.filter(p => bindDailySourceJob(p, prevPlugins, previousJobs[p.id], jobs[p.id])) : descriptionPlan.ready;
  if (dailyScope) console.log(`  日常付费范围：${ready.length} 个新增或资料变化任务；其余存量不进入付费队列`);
  const saveDescriptionJobs = () => {
    mkdirSync(DATA_DIR, { recursive: true });
    const temporary = `${jobsPath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ updatedAt: new Date().toISOString(), jobs }));
    renameSync(temporary, jobsPath);
  };
  saveDescriptionJobs();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const modelsEnabled = modelRequestsEnabled() && !!apiKey;
  if (!modelsEnabled) console.log("  模型请求已暂停；保留同源已有内容并继续更新目录");
  const baseURL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const summaryBatchSize = Number(process.env.DEEPSEEK_SUMMARY_BATCH_SIZE ?? "300");
  const summaryConcurrency = Number(process.env.DEEPSEEK_SUMMARY_CONCURRENCY ?? DEFAULT_MODEL_CONCURRENCY);
  if (!Number.isInteger(summaryBatchSize) || summaryBatchSize < 0 || summaryBatchSize > 3000) throw new Error("DEEPSEEK_SUMMARY_BATCH_SIZE must be an integer from 0 to 3000");
  if (!Number.isInteger(summaryConcurrency) || summaryConcurrency < 1 || summaryConcurrency > 10) throw new Error("DEEPSEEK_SUMMARY_CONCURRENCY must be an integer from 1 to 10");
  const knownTags = [...new Set(detected.flatMap(d => d.plugin.tags.filter(t => /[\u4e00-\u9fff]/.test(t))))].slice(0, 40);
  const summaryResult = await runDailyDescriptions(detected.map(d => d.plugin), { jobs, ready }, {
    limit: modelsEnabled && !isDailyBoardRun() && !isDailySkillsRun() ? summaryBatchSize : 0, concurrency: summaryConcurrency, onProgress: saveDescriptionJobs,
    worker: p => {
      const input = { name: p.fullName, type: p.type, packageName: p.install?.packageName, repositoryPath: p.install?.repositoryPath,
        description: p.description, readmeSummary: p.readmeSummary, topics: p.topics, knownTags };
      const run = () => translateWithDeepSeek(input,
        { apiKey: apiKey!, baseURL, model, maxTokens: DEFAULT_MODEL_MAX_TOKENS, maxAttempts: 1, retryDelayMs: 0, timeoutMs: 45_000, thinking: "disabled" });
      return dailyScope ? withDailyModelRequest(buildTranslationRequest(input, model), run) : run();
    },
  });
  updateDailyDescriptionCache(detected.map(d => d.plugin), zhCache, jobs);
  saveZhCache(zhCache);
  saveDescriptionJobs();
  console.log(`  summaries: ${summaryResult.attempted} attempted, ${ready.length - summaryResult.attempted} deferred; retry state saved`);
  if (isDailyBoardRun() || isDailySkillsRun()) console.log("  中文生成移至当天榜单计算之后，先处理热榜和涨榜前 100，再处理其他日常任务");

  console.log("[3.6/5] 标签归一化（合并同义词 + 移除宽泛标签）...");
  if (modelsEnabled && !dailyScope) {
    // 读取历史 alias（持久化复用，避免 LLM 输出波动导致合并丢失）
    let prevAlias: Record<string, string> = {};
    try {
      prevAlias = JSON.parse(readFileSync(join(DATA_DIR, "tag-alias.json"), "utf-8")).alias ?? {};
    } catch {
      prevAlias = {};
    }
    // 1) 先应用历史 alias
    const allPlugins = detected.map((d) => d.plugin);
    let histMerged = 0;
    for (const p of allPlugins) {
      const next: string[] = [];
      for (const t of p.tags) {
        const target = prevAlias[t];
        if (target && target !== t) {
          histMerged++;
          if (!next.includes(target)) next.push(target);
        } else {
          next.push(t);
        }
      }
      p.tags = next;
    }
    // 2) 再跑 LLM 归一化（针对剩余标签，含宽泛移除）
    const norm = await normalizeTags(allPlugins, { apiKey: apiKey!, baseURL, model });
    const aliasEntries = Object.entries(norm.alias);
    console.log(
      `  历史 alias 应用 ${histMerged} 处 · 新 LLM 合并 ${aliasEntries.length} 组（${norm.mergedCount} 处）· 移除宽泛标签 ${norm.removedGeneric} 处`
    );
    // 3) 持久化合并后的 alias
    const mergedAlias = { ...prevAlias, ...norm.alias };
    writeFileSync(
      join(DATA_DIR, "tag-alias.json"),
      JSON.stringify({ updatedAt: new Date().toISOString(), alias: mergedAlias }, null, 2),
      "utf-8"
    );
  } else {
    console.log("  跳过（模型请求已暂停、未配置 API key，或日常付费范围不包含全库标签归一化）");
  }

  console.log("[3.7/5] 整合包收集...");
  // 产品决策（2026-08-16）：生态尚无标准协议与工具，自动扫描暂缓。
  // 基础设施（schema v2 / Web 分区 / 插件端 Tab / 提交 issue 通道）已就绪，
  // 设环境变量 DSH_PACK_SCAN=1 启用扫描（协议 dsh.pack.json 与 dsh-bundler 落地后默认开启）。
  const packs: DshPack[] =
    process.env.DSH_PACK_SCAN === "1"
      ? await (async () => {
          const packIssueRepos = await fetchPackSubmissionRepos();
          return collectPacks(
            detected.map((d) => ({ id: d.plugin.id, fullName: d.plugin.fullName })),
            p99,
            [...packIssueRepos.keys()]
          );
        })()
      : [];
  if (process.env.DSH_PACK_SCAN === "1") {
    console.log(`  整合包扫描已启用：${packs.length} 个`);
  } else {
    console.log("  整合包扫描暂缓（设 DSH_PACK_SCAN=1 启用；收到人工提交时见 data/packs.json 手工通道）");
  }
  // 整合包中文化（增量：复用上次结果，packs 少直接顺序翻译）
  if (packs.length > 0) {
    let prevPacks: DshPack[] = [];
    try {
      prevPacks = JSON.parse(readFileSync(join(DATA_DIR, "packs.json"), "utf-8")).packs ?? [];
    } catch {
      prevPacks = [];
    }
    const prevZh = new Map(prevPacks.map((p) => [p.id, p.descriptionZh]));
    const knownPackTags = [
      ...new Set(packs.flatMap((p) => p.tags.filter((t) => /[\u4e00-\u9fff]/.test(t)))),
    ].slice(0, 30);
    let translated = 0;
    for (const pack of packs) {
      const prev = prevZh.get(pack.id);
      if (prev) {
        pack.descriptionZh = prev;
        continue;
      }
      const result = modelsEnabled ? await translateWithDeepSeek(
        {
          name: pack.name,
          description: pack.description,
          readmeSummary: pack.readmeSummary,
          topics: pack.tags,
          knownTags: knownPackTags,
        },
        { apiKey: apiKey!, baseURL, model }
      ) : null;
      if (result) {
        pack.descriptionZh = result.descriptionZh;
        for (const t of result.tagsZh) {
          if (!pack.tags.includes(t)) pack.tags.push(t);
        }
        translated++;
        console.log(`    ✓ pack ${pack.id} -> ${result.descriptionZh.slice(0, 40)}`);
      }
      pack.descriptionZh ??= fallbackDescriptionZh({
        name: pack.name,
        description: pack.description,
        readmeSummary: pack.readmeSummary,
        topics: pack.tags,
      });
    }
    console.log(`  packs translated: ${translated}`);
  }

  assertGithubAuthenticationHealthy();
  console.log("[4/5] 生成数据文件...");
  const market: MarketData = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    plugins: detected.map((d) => d.plugin),
    packs,
  };
  mkdirSync(DATA_DIR, { recursive: true });
  atomicOperationJson(join(DATA_DIR, "plugins.json"), market);
  // 独立 packs 数据文件（Web 单独加载，schemaVersion 1）：
  // 扫描关闭时不覆盖——data/packs.json 由人工通道（scripts/pack-add.ts）维护，
  // 每日管道只负责把已提交的文件同步到 web/public 并部署。
  if (process.env.DSH_PACK_SCAN === "1") {
    writeFileSync(
      join(DATA_DIR, "packs.json"),
      JSON.stringify({ schemaVersion: 1, generatedAt: market.generatedAt, packs }, null, 2),
      "utf-8"
    );
  } else {
    console.log("  保留人工 data/packs.json（扫描关闭，不覆盖人工收录的整合包）");
  }
  const publicRejections = redactPrivateRejections(rejected, knownPrivateIds);
  writeFileSync(join(DATA_DIR, "discovery-review.json"), JSON.stringify({
    generatedAt: market.generatedAt,
    rejected: publicRejections.map(entry => ({ ...entry, status: entry.reason === "private repository" || definitiveRejections.has(entry.fullName.toLowerCase()) ? "rejected" : "review-required" })),
    retained: market.plugins.filter(plugin => plugin.install.discovery?.status === "review-required")
      .map(plugin => ({ fullName: plugin.fullName, discovery: plugin.install.discovery })),
  }, null, 2));
  writeFileSync(
    join(DATA_DIR, "report.json"),
    JSON.stringify(
      {
        generatedAt: market.generatedAt,
        discovery: discovery.audit,
        metadataRefresh: { attempted: missing.length, failed: unresolved },
        total: market.plugins.length,
        byType: market.plugins.reduce<Record<string, number>>((acc, p) => {
          acc[p.type] = (acc[p.type] ?? 0) + 1;
          return acc;
        }, {}),
        bySource: Object.entries(
          market.plugins.reduce<Record<string, number>>((acc, p) => {
            for (const s of p.sources) acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {})
        ),
        packs: packs.map((p) => ({
          id: p.id,
          entries: p.entryStats.total,
          ok: p.entryStats.ok,
          inMarket: p.entryStats.inMarket,
          score: p.score.total,
        })),
        p99Stars: p99,
        top10: [...market.plugins]
          .sort((a, b) => b.score.total - a.score.total)
          .slice(0, 10)
          .map((p) => ({
            id: p.id,
            score: p.score.total,
            stars: p.stars,
            explanation: p.score.explanation,
          })),
        rejectedCount: rejected.length,
        rejected: publicRejections.slice(0, 30),
      },
      null,
      2
    ),
    "utf-8"
  );

  // 只生成待回复清单，不发评论或关闭 issue。按仓库分组避免同号串仓库。
  const issueReplies = detected.flatMap(d => {
    const issues = d.candidate.submissionIssues ?? [];
    return [...new Set(issues.map(issue => issue.repository))].map(repository => ({
      repository,
      issueNumbers: issues.filter(issue => issue.repository === repository).map(issue => issue.number),
      issueUrls: issues.filter(issue => issue.repository === repository).map(issue => issue.url),
      fullName: d.plugin.fullName,
      type: d.plugin.type,
      stars: d.plugin.stars,
      score: d.plugin.score?.total ?? null,
    }));
  });
  // 空结果也覆盖旧清单，避免把历史待回复记录误当成本轮结果。
  writeFileSync(
    join(DATA_DIR, "issue-replies.json"),
    JSON.stringify({ generatedAt: market.generatedAt, replies: issueReplies }, null, 2),
    "utf-8"
  );
  console.log(`  issue-replies: ${issueReplies.length} 条（待人工复核）`);

  console.log("[5/5] 完成");
  const top5 = [...market.plugins]
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5)
    .map((p) => `${p.id}(${p.score.total})`)
    .join(", ");
  console.log(`  plugins.json: ${market.plugins.length} plugins`);
  console.log(`  top5: ${top5}`);
  // Keep queue receipts pending until the durable source output and reports succeeded.
  await acknowledgeWeeklyCandidates(DATA_DIR, weekly.receipt.filter(item => handledWeeklyIds.has(item.id)));
  await deferWeeklyCandidates(DATA_DIR, weekly.receipt.filter(item => !handledWeeklyIds.has(item.id)));
}

main().catch((err) => {
  if (err instanceof GithubAccessError || isGithubAuthenticationFailure(err)) {
    const code = githubAccessCode(err);
    console.error(`collector stopped: ${code}`);
    process.exit(code === 'github-preflight-unavailable' ? 1 : 78);
  }
  console.error("collector failed:", err);
  process.exit(1);
});
