/**
 * DSH Market 共享数据类型（schema 包）
 * collector 生成、web 与 plugin 消费，三端必须遵守同一份定义。
 */

/** 插件形态 */
export type PluginType = "skill" | "cordis-plugin";

/** 目录筛选使用的受控分类；一个仓库可以同时属于多个分类。 */
export type PluginCategoryId =
  | "ai"
  | "appearance"
  | "coding"
  | "knowledge"
  | "security"
  | "tools";

export type PluginCategorySource = "deepseek" | "rule-fallback" | "manual";

export interface PluginCategoryAssignment {
  id: PluginCategoryId;
  /** 分类置信度 0-1。 */
  confidence: number;
  /** 来自 README、描述或 topics 的简短依据。 */
  evidence: string;
  source: PluginCategorySource;
  model?: string;
  classifiedAt?: string;
  sourceHash?: string;
  policyVersion?: number;
}

/** 一键安装方式 */
export type InstallMethod =
  | "skills-add" // git clone 到 ~/.agents/skills（skill 型）
  | "pnpm-profile" // 在目标 profile 中 pnpm add + patch（cordis 插件型）
  | "git-clone"; // 通用 clone（暂未细分）

/** 实用五维评分明细 */
export interface PracticalScoreBreakdown {
  /** 维护活跃 0-100 */
  maintain: number;
  /** 实用度 0-100 */
  practical: number;
  /** 生态热度 0-100 */
  popularity: number;
  /** 便捷度 0-100 */
  ease: number;
  /** 信号质量 0-100 */
  signal: number;
}

export interface PracticalScore {
  /** 融合后的总分 0-100 */
  total: number;
  breakdown: PracticalScoreBreakdown;
  /** 数据置信度 0-1（字段不全/样本少时降权） */
  confidence: number;
  /** 解释层："为什么推荐"的自然语言理由 */
  explanation: string;
}

export interface ReadmeEvidence {
  fullName: string;
  packageName: string | null;
  path: string;
  sourceRevision: string;
  documentSha256: string;
  summarySha256: string;
}

export interface DiscoveryEvidence {
  /** Automatic comparison against an immutable human-reviewed file baseline. */
  functionReview?: {
    policy: 'syntax-equivalence-v1'; decision: 'equivalent' | 'held'; baselineCommit: string;
    expectedFingerprint: string; currentFingerprint: string | null; sourceRevision?: string;
    files: { path: string; beforeSha256: string; afterSha256: string | null;
      outcome: 'equivalent' | 'changed' | 'missing' | 'unavailable' | 'baseline-unverified';
      signals?: ('imports-changed' | 'environment-writes-changed' | 'source-change-needs-review')[] }[];
  };
  readme?: ReadmeEvidence;
  /** A single selected Skill, checked at one immutable commit. Collections need explicit review. */
  skill?: {
    policy: 'selected-skill-v1'; fullName: string; path: string; name: string;
    sourceRevision: string; documentSha256: string; summarySha256: string;
  };
  /** Bounded static facts from this exact package, never root/sibling marketing text. */
  sourceFiles?: {
    kind: 'static-package-facts-v1'; fullName: string; packageName: string; repositoryPath: string;
    sourceRevision: string; summarySha256: string; files: { path: string; sha256: string }[];
  };
  status: "verified" | "review-required";
  kind: "bundle" | "client" | "host" | "skill";
  evidence: string[];
  checkedAt: string;
  policyVersion: number;
  sourceRevision?: string;
}

/** Source checks do not assert host compatibility, installation or runtime success. */
export interface InstallSourceAssessment {
  sourceKey: string;
  status: "verified" | "invalid" | "unavailable";
  checkedAt: string;
  resolvedTarget?: string;
  integrity?: string;
  reason: string;
}

export interface InstallInfo {
  discovery?: DiscoveryEvidence;
  assessment?: InstallSourceAssessment;
  method: InstallMethod;
  /** skill 型：~/.agents/skills；cordis 型：profile 名 */
  target?: string;
  /** GitHub 仓库内被验证为主插件的相对目录；根目录插件省略。 */
  repositoryPath?: string;
  /** 被选中插件目录的 package.json name，用于核对安装源身份。 */
  packageName?: string;
  /** 是否需要 token / API key 等额外配置 */
  needsConfig: boolean;
  /** 从 README 安装章节解析出的真实安装命令（精确命令优先于模板） */
  commands?: string[];
  /** 命令来源（README 安装章节 / 模板兜底） */
  commandSource?: string;
}

export interface GeneratedDescriptionVersion {
  id: string;
  policy: 'source-bound-model-v1';
  generatedAt: string;
  descriptionZh: string;
  sourceHash: string;
  source: Pick<DshPlugin, 'fullName' | 'type' | 'description' | 'readmeSummary' | 'install'>;
}

export interface SubmissionIssue {
  repository: string;
  number: number;
  url: string;
}

export interface DshPlugin {
  /** Bounded history of source-bound model outputs, not human-reviewed prose. */
  descriptionHistory?: GeneratedDescriptionVersion[];
  descriptionHistoryHold?: string;
  /** 唯一标识 owner/repo（同仓库多技能时用 owner/repo@skill-name） */
  id: string;
  type: PluginType;
  name: string;
  owner: string;
  repo: string;
  fullName: string;
  stars: number;
  /** Successful GitHub metadata response time; omitted for unverified legacy values. */
  starsObservedAt?: string;
  forks: number;
  openIssues: number;
  language: string | null;
  description: string;
  descriptionZh: string | null;
  /** 功能标签（LLM 打标 + 关键词兜底） */
  tags: string[];
  /** README 语义分类；允许一个仓库进入多个分类筛选结果。 */
  categories?: PluginCategoryAssignment[];
  /** 人工精选标记 */
  curated: boolean;
  /** 精选推荐理由（人工填写） */
  curatedReason?: string;
  homepage: string | null;
  license: string | null;
  topics: string[];
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
  /** README 摘要（截断，供详情页展示） */
  readmeSummary: string | null;
  /** 作者自述简介（插件提交时提供，可选；Web 详情页 C 位展示，区分于自动简介） */
  introByAuthor?: string;
  /** 首个提交 issue 的兼容编号；关联链接应使用 submissionIssues，不能推断仓库。 */
  submissionIssue?: number;
  /** 提交来源及讨论链接，保留跨仓库同号 issue。 */
  submissionIssues?: SubmissionIssue[];
  /** 安装相关信息 */
  install: InstallInfo;
  /** 实用五维评分 */
  score: PracticalScore;
  /** 数据源（awesome/topic/org/user-submit） */
  sources: string[];
  lastCheckedAt: string;
}

/** 整合包条目类型（协议 v0.1 语义：skill/cordis/bundle/pack） */
export type PackEntryType = "skill" | "cordis" | "bundle" | "pack";

/** 整合包条目（包内一个插件/技能/子包） */
export interface PackEntry {
  /** owner/repo | npm 包名 | bundle id */
  id: string;
  type: PackEntryType;
  /** latest / semver 范围 / 日期锚点 / commit（协议 v0.1） */
  version: string;
  /** 条目解析状态（市场侧每日校验产物） */
  resolved?: {
    ok: boolean;
    /** 是否已在 plugins.json 收录 */
    inMarket: boolean;
    /** 命中市场里的插件 id */
    matchId?: string;
    reason?: string;
  };
}

/** 整合包（市场收录视图） */
export interface DshPack {
  /** 唯一标识 owner/repo */
  id: string;
  name: string;
  description: string;
  descriptionZh: string | null;
  /** GitHub 语义作者 */
  author: string;
  /** 协议版本（校验用） */
  schemaVersion: number;
  /** 包形态：dsh-pack（协议清单）/ loose-pack（README 信号，宽松收录）/ 协议自定义值 */
  kind: string;
  entries: PackEntry[];
  entryStats: {
    total: number;
    ok: number;
    failed: number;
    inMarket: number;
  };
  tags: string[];
  stars: number;
  curated: boolean;
  curatedReason?: string;
  homepage: string | null;
  license: string | null;
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
  readmeSummary: string | null;
  /** 实用五维评分（包维度输入） */
  score: PracticalScore;
  /** 数据源（pack-search / pack-known / user-submit） */
  sources: string[];
  lastCheckedAt: string;
}

export interface MarketData {
  schemaVersion: number;
  generatedAt: string;
  plugins: DshPlugin[];
  /** 整合包通道（v2 新增；旧数据缺省为空数组） */
  packs?: DshPack[];
}

/** v2 静态榜单协议的可按需加载数据集。 */
export type RankingSnapshotDataset =
  | "hot"
  | "rising"
  | "skills"
  | "total"
  | "category"
  | "search";

/**
 * 榜单页的精简条目。
 *
 * 分类证据、README、forks 等不参与首页展示的字段不进入静态分片。
 */
export interface RankingSummaryEntry {
  /** 当前数据集内的连续名次。 */
  rank: number;
  /** 在 GitHub Stars 总榜中的名次。 */
  totalRank: number;
  fullName: string;
  name: string;
  description: string;
  descriptionZh?: string;
  descriptionPolicy?: 'server-v1';
  descriptionStatus?: { state: 'pending' | 'review-required' | 'missing-source' | 'retry' | 'stale'; reason: string; reviewedAt?: string; origin?: 'model'; generatedAt?: string };
  /** README-derived excerpt, loaded only with a ranked page rather than the search index. */
  readmeSummary?: string;
  stars: number;
  dailyStars: number | null;
  weeklyStars: number | null;
  hotScore: number | null;
  threeDayStars?: number | null;
  risingScore?: number | null;
  growthBasis?: { daily?: "observed" | "historical-estimate" | null; threeDay: "observed" | "historical-estimate" | null; weekly: "observed" | "historical-estimate" | null };
  starsObservedAt?: string | null;
  openIssues: number;
  language: string | null;
  homepage: string | null;
  license: string | null;
  topics: string[];
  tags: string[];
  categories: PluginCategoryId[];
  type: string;
  install: InstallInfo;
  url: string;
  pushedAt: string;
}

/** 全量搜索索引条目，只保留检索和结果摘要所需字段。 */
export interface RankingSearchEntry {
  rank: number;
  fullName: string;
  name: string;
  description: string;
  descriptionZh?: string;
  descriptionPolicy?: 'server-v1';
  descriptionStatus?: { state: 'pending' | 'review-required' | 'missing-source' | 'retry' | 'stale'; reason: string; reviewedAt?: string; origin?: 'model'; generatedAt?: string };
  stars: number;
  tags: string[];
  categories: PluginCategoryId[];
  type: string;
  /** Repository-matched GitHub target or npm command matching the selected package name. */
  installTarget?: string;
  /** Selected plugin's package.json name; required to offer an npm target. Not publisher verification. */
  installPackageName?: string;
  installRepositoryPath?: string;
  discovery?: DiscoveryEvidence;
  installAssessment?: InstallSourceAssessment;
  /** Omitted for legacy indexes or unknown configuration requirements. */
  needsConfig?: boolean;
}

export interface RankingSnapshotBase {
  schemaVersion: 2;
  snapshotId: string;
  generatedAt: string;
  snapshotDate: string;
  dataset: RankingSnapshotDataset;
}

/** Top 100 或新锐榜的单文件快照。 */
export interface RankingListSnapshot extends RankingSnapshotBase {
  dataset: "hot" | "rising" | "skills";
  total: number;
  rankings: RankingSummaryEntry[];
}

/** 总榜或分类筛选结果的 100 条分页快照。 */
export interface RankingPageSnapshot extends RankingSnapshotBase {
  dataset: "total" | "category";
  category?: PluginCategoryId;
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  rankings: RankingSummaryEntry[];
}

/** 全量紧凑搜索索引快照。 */
export interface RankingSearchSnapshot extends RankingSnapshotBase {
  dataset: "search";
  total: number;
  rankings: RankingSearchEntry[];
}

/** manifest 中可校验的不可变文件引用。 */
export interface RankingFileReference {
  /** 从站点根开始的公开 URL。 */
  url: string;
  count: number;
  bytes: number;
  sha256: string;
}

export interface RankingPageReference extends RankingFileReference {
  page: number;
}

export interface RankingPaginatedDatasetManifest {
  count: number;
  /** Number of Skill repositories included in count; absent on older v2 manifests. */
  skillCount?: number;
  pageSize: number;
  pageCount: number;
  pages: RankingPageReference[];
}

export interface RankingCategoryManifest extends RankingPaginatedDatasetManifest {
  id: PluginCategoryId;
  label: string;
  description: string;
}

/**
 * `/data/manifest.json` 协议。manifest 本身短缓存，其引用的 snapshotId
 * 路径内文件均为不可变内容。
 */
export interface RankingManifestV2 {
  schemaVersion: 2;
  snapshotId: string;
  generatedAt: string;
  snapshotDate: string;
  pageSize: number;
  definitions: {
    total: string;
    rising: string;
    hot: string;
  };
  datasets: {
    hot: RankingFileReference;
    rising: RankingFileReference;
    /** Skill directory ordered for stable browsing; entries are not Plugin ranks. */
    skills: RankingFileReference;
    search: RankingFileReference;
    total: RankingPaginatedDatasetManifest;
  };
  categories: RankingCategoryManifest[];
}
