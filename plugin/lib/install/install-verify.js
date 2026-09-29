/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */
import { npmPackageSpec } from "./install-spec.js";
import { githubRepositoryIdentity, parseGitHubSource, githubInstallTarget } from "../shared/github-source.js";
import { eq, maxSatisfying, satisfies, valid } from "semver";
import { parseNpmSelector } from "./npm-selector.js";
const MANIFEST_TIMEOUT_MS = 15_000;
const VERIFICATION_CACHE_MS = 10 * 60 * 1000;
export class InstallVerificationError extends Error {
    fatal;
    status;
    /** A definite manifest failure is separate from installation confirmation policy. */
    reason;
    constructor(message, fatal = false, status = null, reason) {
        super(message);
        this.name = "InstallVerificationError";
        this.fatal = fatal;
        this.status = status;
        this.reason = reason;
    }
}
const verificationCache = new Map();
export function clearInstallVerificationCache() {
    verificationCache.clear();
}
function isBundleManifest(value) {
    if (value === null || typeof value !== "object")
        return false;
    const manifest = value;
    const patch = manifest.dsh?.bundle?.patch;
    const files = typeof patch === "string" ? [patch] : patch;
    return Array.isArray(files) && files.length > 0
        && files.every((file) => typeof file === "string" && file.trim().length > 0);
}
/** Retain only DSH peers, while preserving malformed declarations as unknown. */
function dshPeerDeclarations(peers) {
    if (peers === undefined)
        return {};
    if (!peers || typeof peers !== "object" || Array.isArray(peers))
        return null;
    const entries = Object.entries(peers);
    if (entries.some(([, range]) => typeof range !== "string"))
        return null;
    return Object.fromEntries(entries.filter(([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-")));
}
function lifecycleScriptEvidence(manifest) {
    const names = ["preinstall", "install", "postinstall", "prepare"];
    return names.flatMap((name) => {
        const command = manifest.scripts?.[name];
        return typeof command === "string" && command.trim()
            ? [{ name, command: command.trim() }]
            : [];
    });
}
function repositoryUrl(value) {
    if (typeof value === "string" && value.trim())
        return value.trim();
    if (value !== null && typeof value === "object") {
        const url = value.url;
        return typeof url === "string" && url.trim() ? url.trim() : null;
    }
    return null;
}
function repositoryDirectory(value) {
    if (value === null || typeof value !== "object")
        return null;
    const directory = value.directory;
    return typeof directory === "string" && directory.trim()
        ? directory.trim().replace(/^\.\//, "").replace(/\/+$/, "")
        : null;
}
function normalizedRepositoryPath(value) {
    const normalized = value?.trim().replace(/^\.\//, "").replace(/^\/+|\/+$/g, "") ?? "";
    return normalized || null;
}
function assertExpectedPackage(manifest, options) {
    const actualName = typeof manifest.name === "string" ? manifest.name.trim() : "";
    if (options.expectedPackageName
        && actualName.toLowerCase() !== options.expectedPackageName.trim().toLowerCase()) {
        throw new InstallVerificationError(`安装包名 ${actualName || "未声明"} 与目录选中的插件包 ${options.expectedPackageName} 不一致，已停止安装`, true);
    }
    const expectedPath = normalizedRepositoryPath(options.expectedRepositoryPath);
    const declaredPath = repositoryDirectory(manifest.repository);
    if (expectedPath && declaredPath && declaredPath !== expectedPath) {
        throw new InstallVerificationError(`安装包声明的仓库子目录 ${declaredPath} 与目录选中的插件子目录 ${expectedPath} 不一致，已停止安装`, true);
    }
}
async function npmRepositoryIdentity(url, expectedRepository, signal) {
    if (!expectedRepository)
        return "not-applicable";
    if (!url)
        return "unavailable";
    const actual = githubRepositoryIdentity(url);
    if (!actual)
        return "unavailable";
    if (actual !== expectedRepository.toLowerCase()) {
        // GitHub redirects renamed/transferred repositories. Compare immutable IDs,
        // never accept similar names or an unverified redirect as identity evidence.
        const identities = await Promise.all([actual, expectedRepository.toLowerCase()].map(async (name) => {
            const value = await fetchJson(`https://api.github.com/repos/${name}`, signal);
            return value && typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0
                && typeof value.full_name === "string" ? { id: value.id, name: value.full_name.toLowerCase() } : null;
        }));
        if (identities.some(value => value === null)) {
            throw new InstallVerificationError("安装包声明的仓库名称与目录不同，暂时无法确认是否为同一仓库，已停止安装");
        }
        if (identities[0].id === identities[1].id
            && identities[0].name === identities[1].name)
            return "matched";
        throw new InstallVerificationError(`npm 包声明的仓库 ${actual} 与目录条目 ${expectedRepository.toLowerCase()} 不一致，已停止安装`, true);
    }
    return "matched";
}
function verifiedTarget(requestedTarget, target, manifest, source, resolved = {}) {
    // Published npm packages may legitimately keep workspace-only tooling in
    // devDependencies: pnpm does not install it for a registry dependency.
    const sections = source === "github"
        ? ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
        : ["dependencies", "optionalDependencies", "peerDependencies"];
    const workspaceDeps = [];
    for (const section of sections) {
        for (const [name, range] of Object.entries(manifest[section] ?? {})) {
            if (typeof range === "string" && range.startsWith("workspace:")) {
                workspaceDeps.push(`${name}@${range}`);
            }
        }
    }
    if (workspaceDeps.length > 0) {
        throw new InstallVerificationError(`项目本身问题：该项目依赖 monorepo 内部 workspace 包，尚未提供可独立安装的插件包：${workspaceDeps.slice(0, 3).join("、")}`, true);
    }
    const packageName = typeof manifest.name === "string" && manifest.name.trim() ? manifest.name : null;
    if (!packageName) {
        throw new InstallVerificationError("项目本身问题：插件 package.json 缺少有效的 name", true);
    }
    const lifecycleScripts = lifecycleScriptEvidence(manifest);
    const needsBuildApproval = lifecycleScripts.length > 0;
    const buildApprovalKeys = !needsBuildApproval
        ? []
        : source === "npm"
            ? [packageName]
            : resolved.github === undefined
                ? []
                : [
                    `${packageName}@git+https://github.com/${resolved.github.owner}/${resolved.github.repo}.git`,
                    `${packageName}@https://codeload.github.com/${resolved.github.owner}/${resolved.github.repo}/tar.gz/${resolved.github.sha}`,
                ];
    return {
        requestedTarget,
        target,
        source,
        packageName,
        version: resolved.version ?? (typeof manifest.version === "string" ? manifest.version : null),
        commit: resolved.commit ?? null,
        integrity: resolved.integrity ?? null,
        repositoryUrl: resolved.repositoryUrl ?? null,
        repositoryIdentity: resolved.repositoryIdentity ?? "not-applicable",
        lifecycleScripts,
        dshPeers: dshPeerDeclarations(manifest.peerDependencies),
        verifiedAt: Date.now(),
        needsBuildApproval,
        buildApprovalKeys,
    };
}
async function fetchJson(url, signal) {
    signal?.throwIfAborted();
    const headers = {
        accept: "application/json",
        "user-agent": "dsh-top100-plugin",
    };
    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
    if (token && url.startsWith("https://api.github.com/"))
        headers.authorization = `Bearer ${token}`;
    const response = await fetch(url, {
        headers,
        signal: AbortSignal.any([AbortSignal.timeout(MANIFEST_TIMEOUT_MS), ...(signal ? [signal] : [])]),
    });
    if (!response.ok) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        if ((response.status === 403 || response.status === 429) && remaining === "0") {
            throw new InstallVerificationError("GitHub 安装源验证额度已用尽，请稍后重试；配置 GITHUB_TOKEN 或 GH_TOKEN 可提高额度", true, response.status);
        }
        throw new InstallVerificationError(`安装源验证失败：${response.status} ${response.statusText || "request failed"}`, response.status === 404, response.status);
    }
    const payload = await response.json();
    signal?.throwIfAborted();
    return payload;
}
async function fetchOptionalJson(url, signal) {
    try {
        return await fetchJson(url, signal);
    }
    catch (error) {
        signal?.throwIfAborted();
        if (error instanceof InstallVerificationError && error.status === 404)
            return null;
        throw error;
    }
}
/** Ranges must resolve against the packument; the single-version endpoint only accepts versions/tags. */
export async function fetchNpmManifest(name, requestedSelector = "latest", signal) {
    const selector = parseNpmSelector(requestedSelector);
    if (npmPackageSpec(name)?.name !== name || !selector)
        throw new InstallVerificationError("npm 安装源格式无效", true);
    const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
    const base = `https://registry.npmjs.org/${encoded}`;
    if (selector.kind !== "range")
        return fetchJson(`${base}/${encodeURIComponent(selector.value)}`, signal);
    const packument = await fetchJson(base, signal);
    const versions = packument?.versions;
    if (!versions || typeof versions !== "object" || Array.isArray(versions)) {
        throw new InstallVerificationError("npm registry 缺少可核对的版本列表，无法保留当前更新范围", true);
    }
    const version = maxSatisfying(Object.keys(versions).filter((value) => valid(value)), selector.value);
    if (!version)
        throw new InstallVerificationError(`npm 当前没有满足更新范围 ${selector.value} 的版本`, true);
    const manifest = versions[version];
    if (!manifest || typeof manifest !== "object" || manifest.version !== version) {
        throw new InstallVerificationError("npm registry 版本列表与包元数据不一致，已停止安装", true);
    }
    return manifest;
}
async function verifyNpm(spec, options) {
    const parsed = npmPackageSpec(spec);
    if (!parsed)
        throw new InstallVerificationError("npm 安装源格式无效", true);
    const selector = parseNpmSelector(parsed.selector ?? "latest");
    const manifest = await fetchNpmManifest(parsed.name, selector.value, options.signal);
    if (!isBundleManifest(manifest)) {
        throw new InstallVerificationError("目标 npm 包没有声明 dsh.bundle，不能作为 DSH 插件安装", false, null, "invalid-manifest");
    }
    assertExpectedPackage(manifest, options);
    const manifestName = manifest.name;
    const packageName = typeof manifestName === "string" ? manifestName : parsed.name;
    if (packageName.toLowerCase() !== parsed.name.toLowerCase()) {
        throw new InstallVerificationError(`npm registry 返回的包名 ${packageName} 与请求目标 ${parsed.name} 不一致，已停止安装`, true);
    }
    const version = manifest.version;
    if (typeof version !== "string" || !valid(version)) {
        throw new InstallVerificationError("npm registry 返回的包缺少精确 version，已停止安装", true);
    }
    if ((selector.kind === "version" && !eq(version, selector.value))
        || (selector.kind === "range" && !satisfies(version, selector.value))) {
        throw new InstallVerificationError("npm registry 返回的版本不满足请求的更新范围，已停止安装", true);
    }
    const declaredRepository = repositoryUrl(manifest.repository);
    const integrity = typeof manifest.dist?.integrity === "string"
        ? manifest.dist?.integrity
        : typeof manifest.dist?.shasum === "string"
            ? `sha1-${manifest.dist?.shasum}`
            : null;
    if (!integrity) {
        throw new InstallVerificationError("npm registry 返回的包缺少 integrity/shasum，无法记录可复验摘要", true);
    }
    return verifiedTarget(spec, `${packageName}@${version}`, manifest, "npm", {
        version,
        integrity,
        repositoryUrl: declaredRepository,
        repositoryIdentity: await npmRepositoryIdentity(declaredRepository, options.expectedRepository, options.signal),
    });
}
async function githubCommit(owner, repo, ref, signal) {
    signal?.throwIfAborted();
    if (/^[0-9a-f]{40}$/i.test(ref))
        return ref.toLowerCase();
    const payload = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, signal);
    const sha = payload?.sha;
    return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
}
async function githubDefaultBranch(owner, repo, signal) {
    const repository = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`, signal);
    const branch = repository?.default_branch;
    if (typeof branch !== "string" || !branch.trim()) {
        throw new InstallVerificationError("GitHub 没有返回可核对的默认分支，已停止安装", true);
    }
    return branch;
}
async function githubManifest(owner, repo, packagePath, commit, signal) {
    const encodedPath = packagePath.split("/").map(encodeURIComponent).join("/");
    const payload = await fetchOptionalJson(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(commit)}`, signal);
    const manifest = decodeGitHubManifest(payload);
    return isBundleManifest(manifest) ? manifest : null;
}
function githubTargetAtCommit(target, sha) {
    if (!/^[0-9a-f]{40}$/.test(sha))
        return null;
    const source = parseGitHubSource(target);
    return source ? githubInstallTarget({ ...source, ref: sha }) : null;
}
async function verifiedGitHubTarget(target, manifest, owner, repo, ref, signal) {
    const sha = await githubCommit(owner, repo, ref, signal);
    if (!sha)
        throw new InstallVerificationError("GitHub 安装源无法解析到不可变 commit", true);
    const pinned = githubTargetAtCommit(target, sha);
    if (!pinned)
        throw new InstallVerificationError("GitHub 安装源无法生成不可变安装目标", true);
    const value = verifiedTarget(target, pinned, manifest, "github", {
        commit: sha,
        integrity: `git-sha1-${sha}`,
        repositoryUrl: `https://github.com/${owner}/${repo}`,
        repositoryIdentity: "matched",
        github: { owner, repo, sha },
    });
    if (value.needsBuildApproval && value.buildApprovalKeys.length < 2) {
        throw new InstallVerificationError("GitHub 构建插件无法解析到不可变 commit，已拒绝写入不完整的 allowBuilds", true);
    }
    return value;
}
function decodeGitHubManifest(payload) {
    if (payload === null || typeof payload !== "object" || typeof payload.content !== "string") {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(payload.content, "base64").toString("utf8"));
    }
    catch {
        return null;
    }
}
async function verifyGitHub(spec, options) {
    const source = parseGitHubSource(spec);
    if (!source)
        throw new InstallVerificationError("GitHub 安装源格式无效", true);
    spec = githubInstallTarget(source);
    const [owner, repo] = source.repository.split("/");
    const actualRepository = `${owner}/${repo}`.toLowerCase();
    if (options.expectedRepository && actualRepository !== options.expectedRepository.toLowerCase()) {
        throw new InstallVerificationError(`GitHub 安装源 ${actualRepository} 与目录条目 ${options.expectedRepository.toLowerCase()} 不一致，已停止安装`, true);
    }
    const expectedPath = normalizedRepositoryPath(options.expectedRepositoryPath);
    if (source.path) {
        const requestedPath = source.path;
        if (expectedPath && requestedPath !== expectedPath) {
            throw new InstallVerificationError(`GitHub 安装子目录 ${requestedPath ?? "仓库根目录"} 与目录选中的插件子目录 ${expectedPath ?? "仓库根目录"} 不一致，已停止安装`, true);
        }
        const branch = source.ref ?? await githubDefaultBranch(owner, repo, options.signal);
        const commit = await githubCommit(owner, repo, branch, options.signal);
        if (!commit)
            throw new InstallVerificationError("GitHub 安装源无法解析到不可变 commit", true);
        const packagePath = `${source.path}/package.json`;
        const manifest = await githubManifest(owner, repo, packagePath, commit, options.signal);
        if (!manifest) {
            throw new InstallVerificationError("指定 path 子目录没有 dsh.bundle", true);
        }
        assertExpectedPackage(manifest, options);
        return verifiedGitHubTarget(spec, manifest, owner, repo, commit, options.signal);
    }
    const ref = source.ref;
    const branch = ref ?? await githubDefaultBranch(owner, repo, options.signal);
    const commit = await githubCommit(owner, repo, branch, options.signal);
    if (!commit)
        throw new InstallVerificationError("GitHub 安装源无法解析到不可变 commit", true);
    if (expectedPath) {
        const manifest = await githubManifest(owner, repo, `${expectedPath}/package.json`, commit, options.signal);
        if (!manifest) {
            throw new InstallVerificationError(`目录选中的插件子目录 ${expectedPath} 没有 dsh.bundle`, true);
        }
        assertExpectedPackage(manifest, options);
        return verifiedGitHubTarget(githubInstallTarget({ ...source, path: expectedPath }), manifest, owner, repo, commit, options.signal);
    }
    const rootManifest = await githubManifest(owner, repo, "package.json", commit, options.signal);
    if (rootManifest) {
        assertExpectedPackage(rootManifest, options);
        return verifiedGitHubTarget(spec, rootManifest, owner, repo, commit, options.signal);
    }
    if (ref)
        throw new InstallVerificationError("指定 ref 的仓库根目录没有 dsh.bundle");
    const tree = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(commit)}?recursive=1`, options.signal);
    const treeItems = tree?.tree;
    const candidates = Array.isArray(treeItems)
        ? treeItems
            .filter((item) => {
            return item !== null
                && typeof item === "object"
                && item.type === "blob"
                && typeof item.path === "string";
        })
            .filter((item) => item.path.endsWith("/package.json"))
            .filter((item) => item.path.split("/").length <= 4)
            .filter((item) => /(?:^|\/)(?:dsh[^/]*|[^/]*(?:plugin|bundle|client)[^/]*)(?:\/|$)/i.test(item.path))
            .slice(0, 20)
        : [];
    for (const candidate of candidates) {
        options.signal?.throwIfAborted();
        const packagePath = candidate.path;
        const directory = packagePath.slice(0, -"/package.json".length);
        const manifest = await githubManifest(owner, repo, packagePath, commit, options.signal);
        if (manifest) {
            assertExpectedPackage(manifest, options);
            return verifiedGitHubTarget(`github:${owner}/${repo}#path:/${directory}`, manifest, owner, repo, commit, options.signal);
        }
    }
    throw new InstallVerificationError("仓库根目录及候选子目录均未找到 dsh.bundle");
}
export async function verifyInstallSpec(spec, options = {}) {
    options.signal?.throwIfAborted();
    const key = [
        spec.kind,
        spec.spec,
        options.expectedRepository?.toLowerCase() ?? "",
        options.expectedPackageName?.toLowerCase() ?? "",
        normalizedRepositoryPath(options.expectedRepositoryPath) ?? "",
    ].join(":");
    const cached = verificationCache.get(key);
    if (!options.forceRefresh && cached && Date.now() - cached.verifiedAt < VERIFICATION_CACHE_MS)
        return cached.value;
    const value = spec.kind === "npm" ? await verifyNpm(spec.spec, options) : await verifyGitHub(spec.spec, options);
    options.signal?.throwIfAborted();
    verificationCache.set(key, { value, verifiedAt: Date.now() });
    return value;
}
