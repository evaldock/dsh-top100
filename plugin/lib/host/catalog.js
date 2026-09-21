import { descriptionStatusFor } from '../shared/description-rules.js';
/** Fetch and filter the published rankings document. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isInstalledEntry, parseInstallSpec, resolveInstallSpec } from "../install/install-spec.js";
import { catalogCategories, categoryDisplayLabel, entryMatchesCategory, isPluginCategoryId } from "../shared/categories.js";
import { createSearchScorer, matchesSearchQuery, tokenizeSearchQuery } from "../shared/search.js";
import { withPublishedDescription } from "../shared/descriptions.js";
import { catalogEvidence } from "../shared/evidence.js";
import { isFeaturedRepository } from "../shared/featured.js";
export const DEFAULT_DATA_URL = "https://www.evaldock.ai/data";
const CACHE_MS = 30 * 60 * 1000;
const FETCH_MS = 15_000;
const WINDOWS_FETCH_MS = 45_000;
const execFileAsync = promisify(execFile);
class CatalogSourceError extends Error {
    fallbackToFull;
    status;
    constructor(message, options = {}) {
        super(message);
        this.name = "CatalogSourceError";
        this.fallbackToFull = options.fallbackToFull ?? false;
        this.status = options.status ?? null;
    }
}
const caches = new Map();
const inFlight = new Map();
const fallbackReasons = new Map();
const manifestCaches = new Map();
const manifestInFlight = new Map();
const diskWrites = new Map();
let cacheGeneration = 0;
function serializeDiskWrite(path, write) {
    const task = (diskWrites.get(path) ?? Promise.resolve()).then(write, write);
    diskWrites.set(path, task);
    void task.finally(() => { if (diskWrites.get(path) === task)
        diskWrites.delete(path); });
    return task;
}
export function normalizeDataUrl(raw) {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("dataUrl must be http or https");
    }
    return raw.replace(/\/+$/, "");
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validFileReference(value) {
    if (!isRecord(value))
        return false;
    return typeof value.url === "string"
        && typeof value.count === "number"
        && Number.isInteger(value.count)
        && typeof value.bytes === "number"
        && Number.isInteger(value.bytes)
        && typeof value.sha256 === "string"
        && /^[a-f0-9]{64}$/.test(value.sha256);
}
function validPageReference(value) {
    const page = isRecord(value) ? value.page : undefined;
    return validFileReference(value)
        && typeof page === "number"
        && Number.isInteger(page)
        && page > 0;
}
function validManifestCategory(value) {
    if (!isRecord(value))
        return false;
    return typeof value.id === "string"
        && isPluginCategoryId(value.id)
        && typeof value.label === "string"
        && typeof value.description === "string"
        && typeof value.count === "number"
        && Number.isInteger(value.count)
        && (value.skillCount === undefined || (typeof value.skillCount === "number"
            && Number.isInteger(value.skillCount)
            && value.skillCount >= 0
            && value.skillCount <= value.count))
        && typeof value.pageSize === "number"
        && Number.isInteger(value.pageSize)
        && typeof value.pageCount === "number"
        && Number.isInteger(value.pageCount)
        && Array.isArray(value.pages)
        && value.pages.every(validPageReference);
}
export function parseRankingManifest(raw) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new CatalogSourceError("榜单 manifest 不是有效 JSON", { fallbackToFull: true });
    }
    if (!isRecord(value)
        || value.schemaVersion !== 2
        || typeof value.snapshotId !== "string"
        || value.snapshotId.length === 0
        || typeof value.generatedAt !== "string"
        || typeof value.snapshotDate !== "string"
        || typeof value.pageSize !== "number"
        || !Number.isInteger(value.pageSize)
        || value.pageSize <= 0) {
        throw new CatalogSourceError("榜单 manifest 版本不受支持", { fallbackToFull: true });
    }
    const datasets = value.datasets;
    if (!isRecord(datasets)
        || !validFileReference(datasets.hot)
        || !validFileReference(datasets.rising)
        || (datasets.skills !== undefined && !validFileReference(datasets.skills))
        || !validFileReference(datasets.search)
        || !isRecord(datasets.total)
        || typeof datasets.total.count !== "number"
        || !Number.isInteger(datasets.total.count)
        || (datasets.total.skillCount !== undefined && (typeof datasets.total.skillCount !== "number"
            || !Number.isInteger(datasets.total.skillCount)
            || datasets.total.skillCount < 0
            || datasets.total.skillCount > datasets.total.count))
        || typeof datasets.total.pageSize !== "number"
        || !Number.isInteger(datasets.total.pageSize)
        || datasets.total.pageSize <= 0
        || typeof datasets.total.pageCount !== "number"
        || !Number.isInteger(datasets.total.pageCount)
        || !Array.isArray(datasets.total.pages)
        || !datasets.total.pages.every(validPageReference)) {
        throw new CatalogSourceError("榜单 manifest 缺少有效的数据引用", { fallbackToFull: true });
    }
    if (!Array.isArray(value.categories) || !value.categories.every(validManifestCategory)) {
        throw new CatalogSourceError("榜单 manifest 缺少分类定义", { fallbackToFull: true });
    }
    return value;
}
function manifestFileUrl(dataUrl, reference) {
    const base = new URL(`${normalizeDataUrl(dataUrl)}/`);
    const resolved = new URL(reference.url, base);
    const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    if (resolved.origin !== base.origin || !resolved.pathname.startsWith(`${basePath}snapshots/`)) {
        throw new CatalogSourceError("榜单 manifest 引用了不受信任的数据地址", { fallbackToFull: true });
    }
    return resolved.toString();
}
function verifySnapshot(raw, reference) {
    const bytes = Buffer.byteLength(raw);
    const digest = createHash("sha256").update(raw).digest("hex");
    if (bytes !== reference.bytes || digest !== reference.sha256) {
        throw new CatalogSourceError("榜单快照完整性校验失败", { fallbackToFull: true });
    }
}
function manifestCategories(manifest) {
    return manifest.categories.map(({ id, label, description, count }) => ({
        id,
        label: categoryDisplayLabel(id, label),
        description,
        count,
    }));
}
function manifestPluginCategories(manifest) {
    return manifest.categories.map(({ id, label, description, count, skillCount = 0 }) => ({
        id,
        label: categoryDisplayLabel(id, label),
        description,
        count: Math.max(0, count - skillCount),
    }));
}
export function isRankingView(value) {
    return value === "hot" || value === "rising" || value === "total";
}
export function isCatalogScope(value) {
    return value === "plugins" || value === "skills" || value === "ecosystem";
}
export function isInstallAvailability(value) {
    return value === "all" || value === "installable" || value === "unavailable";
}
export function matchesQuery(entry, query) {
    return matchesSearchQuery(withPublishedDescription(entry), query);
}
function annotate(entry, installed, profile = "web", evidence) {
    const installSpec = resolveInstallSpec(entry, profile);
    return {
        ...entry,
        installSpec,
        installable: installSpec !== null,
        installed: isInstalledEntry(entry, installed, profile, evidence),
        evidence: catalogEvidence(entry, profile),
    };
}
function entryMatchesCatalogScope(entry, scope) {
    const evidence = catalogEvidence(entry);
    const isSkill = entry.type?.toLowerCase() === "skill";
    if (scope === "plugins")
        return !isSkill && evidence.compatible;
    if (scope === "skills")
        return isSkill;
    return !isSkill && !evidence.compatible;
}
export function catalogScopeCounts(document, skillsDocument) {
    const counts = { plugins: 0, skills: 0, ecosystem: 0 };
    const uniqueEntries = new Map([
        ...document.rankings.total,
        ...(skillsDocument?.rankings.total ?? []),
    ].map((entry) => [entry.fullName.toLowerCase(), entry]));
    for (const entry of uniqueEntries.values()) {
        if (isFeaturedRepository(entry))
            continue;
        if (entryMatchesCatalogScope(entry, "plugins"))
            counts.plugins += 1;
        else if (entryMatchesCatalogScope(entry, "skills"))
            counts.skills += 1;
        else if (entryMatchesCatalogScope(entry, "ecosystem"))
            counts.ecosystem += 1;
    }
    return counts;
}
export async function loadCatalogMetadata(dataUrl, force = false) {
    const baseUrl = normalizeDataUrl(dataUrl);
    try {
        const manifest = await loadRankingManifest(baseUrl, force);
        const mixedSkillCount = manifest.datasets.total.skillCount ?? 0;
        return {
            scopeCounts: {
                plugins: Math.max(0, manifest.datasets.total.count - mixedSkillCount),
                skills: manifest.datasets.skills?.count ?? mixedSkillCount,
                ecosystem: 0,
            },
            pluginCategories: manifestPluginCategories(manifest),
        };
    }
    catch {
        const [pluginResult, skillsResult] = await Promise.allSettled([
            loadSearchRankings(baseUrl, force),
            loadSkillRankings(baseUrl, force),
        ]);
        let reference;
        if (pluginResult.status === "fulfilled")
            reference = pluginResult.value;
        else if (skillsResult.status === "fulfilled")
            reference = skillsResult.value;
        else
            throw pluginResult.reason;
        const pluginDirectory = pluginResult.status === "fulfilled"
            ? pluginResult.value
            : {
                ...reference,
                categories: [],
                rankings: { total: [], hot: [], rising: [] },
            };
        const skillsDirectory = skillsResult.status === "fulfilled"
            ? skillsResult.value
            : {
                ...reference,
                categories: [],
                rankings: { total: [], hot: [], rising: [] },
            };
        return {
            scopeCounts: catalogScopeCounts(pluginDirectory, skillsDirectory),
            pluginCategories: filteredCatalogCategories(pluginDirectory, {
                excludeSkills: true,
                compatibleOnly: true,
                catalogScope: "plugins",
            }),
        };
    }
}
export function filterCatalog(document, options) {
    const hasQuery = tokenizeSearchQuery(options.query).length > 0;
    const scoreEntry = createSearchScorer(options.query);
    const source = hasQuery || options.view === "total"
        ? document.rankings.total
        : document.rankings[options.view] ?? [];
    const scored = source
        // Older snapshots may still contain our editorial #000 project as a ranked entry.
        .filter((entry) => !isFeaturedRepository(entry))
        .map((entry) => withPublishedDescription(entry))
        .filter((entry) => !options.compatibleOnly || catalogEvidence(entry).compatible)
        .filter((entry) => !options.catalogScope || entryMatchesCatalogScope(entry, options.catalogScope))
        .filter((entry) => options.category === null || entryMatchesCategory(entry, options.category))
        .filter((entry) => {
        if (!options.installAvailability || options.installAvailability === "all")
            return true;
        const installable = resolveInstallSpec(entry, options.profile) !== null;
        return options.installAvailability === "installable" ? installable : !installable;
    })
        .map((entry) => ({ entry, score: scoreEntry(entry) }))
        .filter((item) => item.score !== null);
    const excludedSkillCount = options.excludeSkills
        ? scored.filter(({ entry }) => entry.type?.toLowerCase() === "skill").length
        : 0;
    const visible = options.excludeSkills
        ? scored.filter(({ entry }) => entry.type?.toLowerCase() !== "skill")
        : scored;
    if (hasQuery) {
        visible.sort((left, right) => right.score - left.score || left.entry.rank - right.entry.rank);
    }
    const matched = visible.map(({ entry }) => annotate(entry, options.installed, options.profile, options.installedEvidence));
    return {
        total: matched.length,
        excludedSkillCount,
        items: matched.slice(options.offset, options.offset + options.limit),
    };
}
export function filteredCatalogCategories(document, options) {
    const definitions = catalogCategories(document);
    const stats = new Map(definitions.map(({ id }) => [id, { count: 0, excludedSkillCount: 0 }]));
    for (const entry of document.rankings.total) {
        if (isFeaturedRepository(entry))
            continue;
        if (options.compatibleOnly && !catalogEvidence(entry).compatible)
            continue;
        if (options.catalogScope && !entryMatchesCatalogScope(entry, options.catalogScope))
            continue;
        const excluded = Boolean(options.excludeSkills && entry.type?.toLowerCase() === "skill");
        const categoryIds = new Set((entry.categories ?? []).map((assignment) => typeof assignment === "string" ? assignment : assignment?.id));
        for (const categoryId of categoryIds) {
            const category = stats.get(categoryId);
            if (!category)
                continue;
            if (excluded)
                category.excludedSkillCount += 1;
            else
                category.count += 1;
        }
    }
    return definitions.map((definition) => ({
        ...definition,
        ...stats.get(definition.id),
    }));
}
export function invalidateCatalog() {
    cacheGeneration += 1;
    inFlight.clear();
    caches.clear();
    fallbackReasons.clear();
    manifestCaches.clear();
    manifestInFlight.clear();
}
function catalogCacheDirectory() {
    if (process.env.DSH_TOP100_CACHE_DIR?.trim())
        return process.env.DSH_TOP100_CACHE_DIR.trim();
    const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
    return join(dshHome, "cache", "dsh-top100");
}
function catalogCachePath(url) {
    const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
    return join(catalogCacheDirectory(), `${key}.json`);
}
function manifestCachePath(dataUrl) {
    const key = createHash("sha256").update(`${dataUrl}/manifest.json`).digest("hex").slice(0, 24);
    return join(catalogCacheDirectory(), `${key}.manifest.json`);
}
function validDocument(value) {
    if (value === null || typeof value !== "object")
        return false;
    const document = value;
    return Boolean(document.rankings
        && Array.isArray(document.rankings.total)
        && Array.isArray(document.rankings.hot)
        && Array.isArray(document.rankings.rising));
}
async function readDiskCache(url) {
    try {
        const payload = JSON.parse(await readFile(catalogCachePath(url), "utf8"));
        if (payload.schemaVersion !== 2
            || payload.dataUrl !== url
            || !Number.isFinite(payload.fetchedAt)
            || !validDocument(payload.document))
            return null;
        return { dataUrl: url, fetchedAt: Number(payload.fetchedAt), document: payload.document };
    }
    catch {
        return null;
    }
}
async function readManifestDiskCache(dataUrl) {
    try {
        const payload = JSON.parse(await readFile(manifestCachePath(dataUrl), "utf8"));
        if (payload.schemaVersion !== 1
            || payload.dataUrl !== dataUrl
            || !Number.isFinite(payload.fetchedAt)
            || !payload.manifest)
            return null;
        const manifest = parseRankingManifest(JSON.stringify(payload.manifest));
        for (const reference of manifestReferences(manifest))
            manifestFileUrl(dataUrl, reference);
        return { fetchedAt: Number(payload.fetchedAt), manifest };
    }
    catch {
        return null;
    }
}
async function writeDiskCache(value) {
    const path = catalogCachePath(value.dataUrl);
    const generation = cacheGeneration;
    return serializeDiskWrite(path, async () => {
        if (generation !== cacheGeneration)
            return;
        const temporary = `${path}.${process.pid}.tmp`;
        try {
            await mkdir(catalogCacheDirectory(), { recursive: true });
            const payload = { schemaVersion: 2, ...value };
            await writeFile(temporary, `${JSON.stringify(payload)}\n`, "utf8");
            try {
                await rename(temporary, path);
            }
            catch {
                // Windows does not replace an existing destination with rename(). Keep a restorable last-good copy.
                const backup = `${path}.${process.pid}.${Date.now()}.bak`;
                await rename(path, backup);
                try {
                    await rename(temporary, path);
                }
                catch (replacementError) {
                    await rename(backup, path).catch(() => undefined);
                    throw replacementError;
                }
                await rm(backup, { force: true }).catch(() => undefined);
            }
        }
        catch {
            await rm(temporary, { force: true }).catch(() => undefined);
        }
    });
}
async function writeManifestDiskCache(dataUrl, value) {
    const path = manifestCachePath(dataUrl);
    const generation = cacheGeneration;
    return serializeDiskWrite(path, async () => {
        if (generation !== cacheGeneration)
            return;
        const temporary = `${path}.${process.pid}.tmp`;
        try {
            await mkdir(catalogCacheDirectory(), { recursive: true });
            const payload = { schemaVersion: 1, dataUrl, ...value };
            await writeFile(temporary, `${JSON.stringify(payload)}\n`, "utf8");
            try {
                await rename(temporary, path);
            }
            catch {
                const backup = `${path}.${process.pid}.${Date.now()}.bak`;
                await rename(path, backup);
                try {
                    await rename(temporary, path);
                }
                catch (replacementError) {
                    await rename(backup, path).catch(() => undefined);
                    throw replacementError;
                }
                await rm(backup, { force: true }).catch(() => undefined);
            }
        }
        catch {
            await rm(temporary, { force: true }).catch(() => undefined);
        }
    });
}
function fetchCause(error) {
    if (!(error instanceof Error))
        return { message: String(error) };
    const cause = error.cause;
    if (cause instanceof Error) {
        const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
        return { message: cause.message || error.message, code };
    }
    return { message: error.message };
}
export function describeCatalogFetchError(error) {
    const { message, code } = fetchCause(error);
    if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || /certificate|SSL|TLS|CERT_/i.test(`${code ?? ""} ${message}`)) {
        return `证书校验失败${code ? ` (${code})` : ""}`;
    }
    if (/timeout|timed out|aborted due to timeout/i.test(message)) {
        return "榜单请求超时，请检查网络后重试";
    }
    const http = message.match(/^rankings fetch failed:\s*(\d{3})\s*(.*)$/i);
    if (http)
        return `榜单服务器请求失败（HTTP ${http[1]}${http[2] ? ` ${http[2]}` : ""}）`;
    if (/unexpected content-type/i.test(message))
        return "榜单服务器返回了非 JSON 内容";
    if (message === "fetch failed" || /ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(`${code ?? ""} ${message}`)) {
        return "榜单网络连接失败，请检查网络、DNS 或代理设置后重试";
    }
    return message;
}
export function isRetryableCatalogFetchError(error) {
    const { message, code } = fetchCause(error);
    return message === "fetch failed" || /certificate|SSL|TLS|CERT_|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|UNABLE_TO_VERIFY/i.test(`${code ?? ""} ${message}`);
}
async function fetchCatalogText(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
        signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!response.ok) {
        throw new CatalogSourceError(`榜单服务器请求失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}）`, { fallbackToFull: response.status === 404, status: response.status });
    }
    const text = await response.text();
    if (!text.trimStart().startsWith("{")) {
        throw new CatalogSourceError("榜单服务器返回了非 JSON 内容", { fallbackToFull: true });
    }
    return text;
}
function quoteForPowerShell(value) { return `'${value.replace(/'/g, "''")}'`; }
async function fetchCatalogTextWindows(url) {
    const directory = await mkdtemp(join(tmpdir(), "dsh-top100-"));
    const file = join(directory, "rankings.json");
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    try {
        await execFileAsync(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
            [
                "$ProgressPreference = 'SilentlyContinue'",
                "$ErrorActionPreference = 'Stop'",
                `Invoke-WebRequest -Uri ${quoteForPowerShell(url)} -OutFile ${quoteForPowerShell(file)} -UseBasicParsing -TimeoutSec 40`,
            ].join("; "),
        ], { timeout: WINDOWS_FETCH_MS, windowsHide: true });
        const text = await readFile(file, "utf8");
        if (!text.trimStart().startsWith("{"))
            throw new Error("Windows fallback returned non-JSON");
        return text;
    }
    catch (error) {
        throw new Error(`系统网络栈回退失败: ${describeCatalogFetchError(error)}`);
    }
    finally {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
}
function manifestReferences(manifest) {
    return [
        manifest.datasets.hot,
        manifest.datasets.rising,
        ...(manifest.datasets.skills ? [manifest.datasets.skills] : []),
        manifest.datasets.search,
        ...manifest.datasets.total.pages,
        ...manifest.categories.flatMap((category) => category.pages),
    ];
}
async function downloadRankingManifest(baseUrl) {
    const generation = cacheGeneration;
    const url = `${baseUrl}/manifest.json`;
    let raw;
    try {
        raw = await fetchCatalogText(url);
    }
    catch (error) {
        if (process.platform === "win32" && isRetryableCatalogFetchError(error)) {
            raw = await fetchCatalogTextWindows(url);
        }
        else {
            throw error;
        }
    }
    const manifest = parseRankingManifest(raw);
    for (const reference of manifestReferences(manifest))
        manifestFileUrl(baseUrl, reference);
    if (generation !== cacheGeneration)
        throw new Error("榜单缓存已刷新，请重试");
    const current = manifestCaches.get(baseUrl);
    if (current && Date.parse(manifest.generatedAt) < Date.parse(current.manifest.generatedAt)) {
        throw new Error("榜单服务器返回了过期快照");
    }
    const value = { fetchedAt: Date.now(), manifest };
    manifestCaches.set(baseUrl, value);
    await writeManifestDiskCache(baseUrl, value);
    if (generation !== cacheGeneration)
        throw new Error("榜单缓存已刷新，请重试");
    fallbackReasons.delete(url);
    return manifest;
}
function refreshRankingManifest(baseUrl) {
    const pending = manifestInFlight.get(baseUrl);
    if (pending)
        return pending;
    const task = downloadRankingManifest(baseUrl);
    manifestInFlight.set(baseUrl, task);
    const cleanup = () => {
        if (manifestInFlight.get(baseUrl) === task)
            manifestInFlight.delete(baseUrl);
    };
    void task.then(cleanup, cleanup);
    return task;
}
export async function loadRankingManifest(dataUrl, force = false) {
    const baseUrl = normalizeDataUrl(dataUrl);
    const cached = await cachedManifest(baseUrl);
    // Recheck after the disk/memory await: a parallel forced reader may have
    // started a refresh while this reader still holds the previous snapshot.
    const pending = manifestInFlight.get(baseUrl);
    if (pending)
        return pending;
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_MS)
        return cached.manifest;
    return refreshRankingManifest(baseUrl);
}
async function cachedManifest(baseUrl) {
    const memory = manifestCaches.get(baseUrl);
    if (memory)
        return memory;
    const generation = cacheGeneration;
    const disk = await readManifestDiskCache(baseUrl);
    if (generation !== cacheGeneration)
        return cachedManifest(baseUrl);
    const current = manifestCaches.get(baseUrl) ?? disk;
    if (current)
        manifestCaches.set(baseUrl, current);
    return current;
}
/** Offline discovery stays on the last observed snapshot; it never downgrades v2 to legacy. */
async function discoveryManifest(baseUrl, force) {
    try {
        return await loadRankingManifest(baseUrl, force);
    }
    catch (error) {
        const cached = await cachedManifest(baseUrl);
        if (cached) {
            fallbackReasons.set(`${baseUrl}/manifest.json`, describeCatalogFetchError(error));
            return cached.manifest;
        }
        if (error instanceof CatalogSourceError && error.status === 404)
            return null;
        throw error;
    }
}
export function parseRankingsDocument(raw) {
    let document;
    try {
        document = JSON.parse(raw);
    }
    catch {
        throw new Error("rankings.json is not valid JSON");
    }
    if (!document?.rankings || !Array.isArray(document.rankings.total)) {
        throw new Error("rankings.json is missing rankings.total");
    }
    document.rankings.hot = Array.isArray(document.rankings.hot) ? document.rankings.hot : [];
    document.rankings.rising = Array.isArray(document.rankings.rising) ? document.rankings.rising : [];
    return document;
}
export function parseRankingViewDocument(raw, view) {
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        throw new CatalogSourceError(`榜单分片 rankings-${view}.json 不是有效 JSON`, { fallbackToFull: true });
    }
    if (!Array.isArray(payload?.rankings)) {
        throw new CatalogSourceError(`榜单分片 rankings-${view}.json 缺少 rankings`, { fallbackToFull: true });
    }
    const entries = payload.rankings;
    return {
        schemaVersion: payload.schemaVersion,
        generatedAt: payload.generatedAt,
        snapshotDate: payload.snapshotDate,
        definitions: payload.definitions,
        categories: payload.categories,
        rankings: {
            total: entries,
            hot: view === "hot" ? entries : [],
            rising: view === "rising" ? entries : [],
        },
    };
}
export function parseSkillDirectoryDocument(raw) {
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        throw new CatalogSourceError("Skills 目录不是有效 JSON", { fallbackToFull: true });
    }
    if (!Array.isArray(payload?.rankings)) {
        throw new CatalogSourceError("Skills 目录缺少 rankings", { fallbackToFull: true });
    }
    return {
        schemaVersion: payload.schemaVersion,
        generatedAt: payload.generatedAt,
        snapshotDate: payload.snapshotDate,
        definitions: payload.definitions,
        categories: payload.categories,
        rankings: { total: payload.rankings, hot: [], rising: [] },
    };
}
function normalizeSearchEntry(value, index) {
    if (value === null || typeof value !== "object")
        return null;
    const entry = value;
    if (typeof entry.fullName !== "string")
        return null;
    const [owner = "", repositoryName = entry.fullName] = entry.fullName.split("/");
    const parsedTarget = typeof entry.installTarget === "string"
        ? parseInstallSpec(entry.installTarget)
        : null;
    const install = entry.install ?? (parsedTarget || entry.discovery ? {
        method: "manifest-v2",
        packageName: typeof entry.installPackageName === "string" ? entry.installPackageName : undefined,
        target: parsedTarget?.spec,
        repositoryPath: entry.installRepositoryPath,
        discovery: entry.discovery,
        assessment: entry.installAssessment,
        ...(typeof entry.needsConfig === "boolean" ? { needsConfig: entry.needsConfig } : {}),
        commands: parsedTarget ? [`dsh plugin add ${parsedTarget.spec}`] : [],
        commandSource: "manifest-v2",
    } : undefined);
    return {
        rank: Number.isFinite(entry.rank) ? Number(entry.rank) : index + 1,
        totalRank: Number.isFinite(entry.totalRank) ? Number(entry.totalRank) : undefined,
        fullName: entry.fullName,
        name: typeof entry.name === "string" ? entry.name : repositoryName,
        owner: typeof entry.owner === "string" ? entry.owner : owner,
        description: typeof entry.description === "string" ? entry.description : "",
        ...(entry.descriptionPolicy === 'server-v1' ? { descriptionPolicy: entry.descriptionPolicy } : {}),
        descriptionZh: typeof entry.descriptionZh === "string" ? entry.descriptionZh : "",
        ...(entry.descriptionStatus !== undefined ? { descriptionStatus: descriptionStatusFor(entry.descriptionStatus) } : {}),
        ...(typeof entry.readmeSummary === "string" ? { readmeSummary: entry.readmeSummary } : {}),
        stars: Number(entry.stars) || 0,
        dailyStars: typeof entry.dailyStars === "number" && Number.isFinite(entry.dailyStars) ? entry.dailyStars : null,
        weeklyStars: typeof entry.weeklyStars === "number" && Number.isFinite(entry.weeklyStars) ? entry.weeklyStars : null,
        threeDayStars: typeof entry.threeDayStars === "number" && Number.isFinite(entry.threeDayStars) ? entry.threeDayStars : null,
        risingScore: typeof entry.risingScore === "number" && Number.isFinite(entry.risingScore) ? entry.risingScore : null,
        ...(entry.growthBasis ? { growthBasis: {
                daily: entry.growthBasis.daily === "observed" || entry.growthBasis.daily === "historical-estimate" ? entry.growthBasis.daily : null,
                threeDay: entry.growthBasis.threeDay === "observed" || entry.growthBasis.threeDay === "historical-estimate" ? entry.growthBasis.threeDay : null,
                weekly: entry.growthBasis.weekly === "observed" || entry.growthBasis.weekly === "historical-estimate" ? entry.growthBasis.weekly : null,
            } } : {}),
        starsObservedAt: typeof entry.starsObservedAt === "string" ? entry.starsObservedAt : null,
        hotScore: typeof entry.hotScore === "number" && Number.isFinite(entry.hotScore) ? entry.hotScore : null,
        forks: Number(entry.forks) || 0,
        openIssues: Number(entry.openIssues) || 0,
        language: typeof entry.language === "string" ? entry.language : null,
        homepage: typeof entry.homepage === "string" ? entry.homepage : null,
        license: typeof entry.license === "string" ? entry.license : null,
        topics: Array.isArray(entry.topics) ? entry.topics.filter((item) => typeof item === "string") : [],
        tags: Array.isArray(entry.tags) ? entry.tags.filter((item) => typeof item === "string") : [],
        categories: entry.categories,
        type: typeof entry.type === "string" ? entry.type : "candidate",
        install,
        sources: Array.isArray(entry.sources) ? entry.sources.filter((item) => typeof item === "string") : [],
        url: typeof entry.url === "string" ? entry.url : `https://github.com/${entry.fullName}`,
        pushedAt: typeof entry.pushedAt === "string" ? entry.pushedAt : "",
        createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
        updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
    };
}
export function parseRankingSearchDocument(raw) {
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        throw new CatalogSourceError("榜单检索索引不是有效 JSON", { fallbackToFull: true });
    }
    if (!Array.isArray(payload?.rankings)) {
        throw new CatalogSourceError("榜单检索索引缺少 rankings", { fallbackToFull: true });
    }
    const entries = payload.rankings
        .map(normalizeSearchEntry)
        .filter((entry) => entry !== null);
    if (entries.length !== payload.rankings.length) {
        throw new CatalogSourceError("榜单检索索引包含无效条目", { fallbackToFull: true });
    }
    return {
        schemaVersion: payload.schemaVersion,
        generatedAt: payload.generatedAt,
        snapshotDate: payload.snapshotDate,
        definitions: payload.definitions,
        categories: payload.categories,
        rankings: { total: entries, hot: [], rising: [] },
    };
}
function parseSnapshotPayload(raw, manifest, dataset) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new CatalogSourceError("榜单快照不是有效 JSON", { fallbackToFull: true });
    }
    if (!isRecord(value)
        || value.schemaVersion !== 2
        || value.snapshotId !== manifest.snapshotId
        || value.dataset !== dataset
        || !Array.isArray(value.rankings)) {
        throw new CatalogSourceError("榜单快照与 manifest 不匹配", { fallbackToFull: true });
    }
    const rankings = value.rankings
        .map(normalizeSearchEntry)
        .filter((entry) => entry !== null);
    if (rankings.length !== value.rankings.length) {
        throw new CatalogSourceError("榜单快照包含无效条目", { fallbackToFull: true });
    }
    return { rankings };
}
function snapshotDocument(raw, manifest, dataset) {
    const { rankings } = parseSnapshotPayload(raw, manifest, dataset);
    return {
        schemaVersion: 2,
        snapshotId: manifest.snapshotId,
        generatedAt: manifest.generatedAt,
        snapshotDate: manifest.snapshotDate,
        definitions: manifest.definitions,
        categories: manifestCategories(manifest),
        rankings: {
            total: rankings,
            hot: dataset === "hot" ? rankings : [],
            rising: dataset === "rising" ? rankings : [],
        },
    };
}
async function downloadCatalog(url, parser) {
    const generation = cacheGeneration;
    let raw;
    try {
        raw = await fetchCatalogText(url);
    }
    catch (error) {
        if (error instanceof CatalogSourceError)
            throw error;
        if (process.platform === "win32" && isRetryableCatalogFetchError(error)) {
            try {
                raw = await fetchCatalogTextWindows(url);
            }
            catch (fallbackError) {
                throw new Error(`${describeCatalogFetchError(error)}; ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            }
        }
        else {
            throw new Error(describeCatalogFetchError(error));
        }
    }
    const document = parser(raw);
    if (generation !== cacheGeneration)
        throw new Error("榜单缓存已刷新，请重试");
    const current = caches.get(url);
    if (current && Date.parse(document.generatedAt) < Date.parse(current.document.generatedAt)) {
        throw new Error("榜单服务器返回了过期快照");
    }
    fallbackReasons.delete(url);
    const value = { dataUrl: url, fetchedAt: Date.now(), document };
    caches.set(url, value);
    await writeDiskCache(value);
    if (generation !== cacheGeneration)
        throw new Error("榜单缓存已刷新，请重试");
    return document;
}
function refreshCatalog(url, parser) {
    const pending = inFlight.get(url);
    if (pending)
        return pending;
    const task = downloadCatalog(url, parser);
    inFlight.set(url, task);
    const cleanup = () => {
        if (inFlight.get(url) === task)
            inFlight.delete(url);
    };
    void task.then(cleanup, cleanup);
    return task;
}
async function loadCatalogDocument(url, parser, force, fallbackToCache = true) {
    const generation = cacheGeneration;
    const cached = await cachedCatalog(url);
    if (!force && !inFlight.has(url) && cached && Date.now() - cached.fetchedAt < CACHE_MS)
        return cached.document;
    try {
        return await refreshCatalog(url, parser);
    }
    catch (error) {
        if (fallbackToCache) {
            const current = caches.get(url) ?? (generation === cacheGeneration ? cached : null);
            if (current) {
                fallbackReasons.set(url, describeCatalogFetchError(error));
                return current.document;
            }
        }
        throw error;
    }
}
async function loadManifestDataset(dataUrl, manifest, reference, dataset, force = false) {
    const url = manifestFileUrl(dataUrl, reference);
    const document = await loadCatalogDocument(url, (raw) => {
        verifySnapshot(raw, reference);
        return snapshotDocument(raw, manifest, dataset);
    }, force);
    const current = await cachedManifest(normalizeDataUrl(dataUrl));
    if (document.snapshotId !== manifest.snapshotId || (current && current.manifest.snapshotId !== manifest.snapshotId)) {
        throw new Error("榜单快照已更新，请重试");
    }
    return document;
}
export async function loadRankings(dataUrl, force = false) {
    const url = `${normalizeDataUrl(dataUrl)}/rankings.json`;
    return loadCatalogDocument(url, parseRankingsDocument, force);
}
/** Load the compact all-entry index used by total/category/search views. */
export async function loadSearchRankings(dataUrl, force = false) {
    const baseUrl = normalizeDataUrl(dataUrl);
    const url = `${baseUrl}/rankings-search.json`;
    const manifest = await discoveryManifest(baseUrl, force);
    if (manifest)
        return loadManifestDataset(baseUrl, manifest, manifest.datasets.search, "search", force);
    const manifestError = new Error("服务器未提供 manifest，使用旧版目录");
    try {
        const document = await loadCatalogDocument(url, parseRankingSearchDocument, force);
        fallbackReasons.set(url, `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`);
        return document;
    }
    catch (error) {
        try {
            const document = await loadRankings(baseUrl, force);
            const fullUrl = `${baseUrl}/rankings.json`;
            const fullReason = fallbackReasons.get(fullUrl);
            fallbackReasons.set(fullUrl, [
                `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`,
                `轻量检索索引不可用：${describeCatalogFetchError(error)}`,
                fullReason,
            ].filter(Boolean).join("；"));
            return document;
        }
        catch (fallbackError) {
            throw new Error([
                `轻量检索索引不可用：${describeCatalogFetchError(error)}`,
                `完整榜单回退失败：${describeCatalogFetchError(fallbackError)}`,
            ].join("；"));
        }
    }
}
/** Load Skills as a separate discovery directory. Skills never participate in Plugin ranks. */
export async function loadSkillRankings(dataUrl, force = false) {
    const baseUrl = normalizeDataUrl(dataUrl);
    const url = `${baseUrl}/rankings-skills.json`;
    const manifest = await discoveryManifest(baseUrl, force);
    if (manifest?.datasets.skills)
        return loadManifestDataset(baseUrl, manifest, manifest.datasets.skills, "skills", force);
    // Older v2 publications did not include a Skills directory at all.
    const manifestError = new Error(manifest ? "榜单 manifest 尚未提供 Skills 目录" : "服务器未提供 manifest，使用旧版目录");
    try {
        const document = await loadCatalogDocument(url, parseSkillDirectoryDocument, force);
        fallbackReasons.set(url, `manifest v2 Skills 目录不可用：${describeCatalogFetchError(manifestError)}`);
        return document;
    }
    catch (error) {
        const legacy = await loadRankings(baseUrl, force);
        return {
            ...legacy,
            rankings: {
                total: legacy.rankings.total.filter((entry) => entry.type?.toLowerCase() === "skill"),
                hot: [],
                rising: [],
            },
        };
    }
}
export async function catalogCacheStatus(dataUrl, dataset, view) {
    const baseUrl = normalizeDataUrl(dataUrl);
    const manifestCache = await cachedManifest(baseUrl);
    const manifest = manifestCache?.manifest;
    const candidates = [];
    if (manifest && dataset === "view-shard" && view) {
        candidates.push({ url: manifestFileUrl(baseUrl, manifest.datasets[view]), dataset });
    }
    else if (manifest && dataset === "search-index") {
        candidates.push({ url: manifestFileUrl(baseUrl, manifest.datasets.search), dataset });
    }
    else if (manifest && dataset === "skill-directory" && manifest.datasets.skills) {
        candidates.push({ url: manifestFileUrl(baseUrl, manifest.datasets.skills), dataset });
    }
    if (!manifest) {
        if (dataset === "view-shard" && view) {
            candidates.push({ url: `${baseUrl}/rankings-${view}.json`, dataset });
        }
        else if (dataset === "search-index") {
            candidates.push({ url: `${baseUrl}/rankings-search.json`, dataset });
        }
        else if (dataset === "skill-directory") {
            candidates.push({ url: `${baseUrl}/rankings-skills.json`, dataset });
        }
        candidates.push({ url: `${baseUrl}/rankings.json`, dataset: "full-catalog" });
    }
    const manifestReason = fallbackReasons.get(`${baseUrl}/manifest.json`);
    const manifestStale = Boolean(manifestReason) || Boolean(manifestCache && Date.now() - manifestCache.fetchedAt >= CACHE_MS);
    for (const candidate of candidates) {
        const cached = await cachedCatalog(candidate.url);
        if (manifestCaches.get(baseUrl)?.manifest.snapshotId !== manifest?.snapshotId)
            return catalogCacheStatus(dataUrl, dataset, view);
        if (!cached || (manifest && cached.document.snapshotId !== manifest.snapshotId))
            continue;
        const ageMs = Math.max(0, Date.now() - cached.fetchedAt);
        const reason = [manifestReason, fallbackReasons.get(candidate.url)].filter(Boolean).join("；") || null;
        return {
            fetchedAt: cached.fetchedAt,
            ageMs,
            stale: manifestStale || ageMs >= CACHE_MS || Boolean(reason),
            reason,
            source: "network-or-cache",
            dataset: candidate.dataset,
        };
    }
    return { fetchedAt: null, ageMs: null, stale: manifestStale, reason: manifestReason ?? null, source: "unknown", dataset };
}
async function cachedCatalog(url) {
    const memory = caches.get(url);
    if (memory)
        return memory;
    const generation = cacheGeneration;
    const disk = await readDiskCache(url);
    if (generation !== cacheGeneration)
        return cachedCatalog(url);
    const current = caches.get(url) ?? disk;
    if (current)
        caches.set(url, current);
    return current;
}
/** Return a last-good full or view cache without ever delaying local management on the network. */
export async function loadCachedRankings(dataUrl) {
    const baseUrl = normalizeDataUrl(dataUrl);
    const manifestCache = await cachedManifest(baseUrl);
    const manifest = manifestCache?.manifest;
    const urls = manifest ? [
        manifestFileUrl(baseUrl, manifest.datasets.search),
        manifestFileUrl(baseUrl, manifest.datasets.hot),
        manifestFileUrl(baseUrl, manifest.datasets.rising),
        ...(manifest.datasets.skills ? [manifestFileUrl(baseUrl, manifest.datasets.skills)] : []),
    ] : [];
    if (!manifest)
        urls.push(`${baseUrl}/rankings-search.json`, `${baseUrl}/rankings-hot.json`, `${baseUrl}/rankings-rising.json`, `${baseUrl}/rankings.json`);
    let newest = null;
    for (const url of urls) {
        const cached = await cachedCatalog(url);
        if (manifestCaches.get(baseUrl)?.manifest.snapshotId !== manifest?.snapshotId)
            return loadCachedRankings(dataUrl);
        if (!cached || (manifest && cached.document.snapshotId !== manifest.snapshotId))
            continue;
        // All v2 candidates share one publication; prefer the complete search index.
        if (manifest)
            return cached.document;
        if (!newest || catalogSnapshotTime(cached) > catalogSnapshotTime(newest)
            || (catalogSnapshotTime(cached) === catalogSnapshotTime(newest) && cached.fetchedAt > newest.fetchedAt))
            newest = cached;
    }
    return newest?.document ?? null;
}
function catalogSnapshotTime(value) {
    const generatedAt = Date.parse(value.document.generatedAt);
    return Number.isFinite(generatedAt) ? generatedAt : value.fetchedAt;
}
/** A list locator is only a hint: sources still come from a hash-verified current page. */
export class CatalogLookupError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "CatalogLookupError";
    }
}
/** Stop this caller promptly without cancelling shared downloads used by other requests. */
export function waitForCatalog(promise, signal) {
    if (!signal)
        return promise;
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        if (signal.aborted)
            abort();
    });
}
/** Resolve installation metadata from a current, authoritative catalog snapshot. */
export async function findPublishedEntry(dataUrl, fullName, forceManifest = true, locator, signal) {
    signal?.throwIfAborted();
    const baseUrl = normalizeDataUrl(dataUrl);
    let manifest;
    try {
        manifest = await waitForCatalog(loadRankingManifest(baseUrl, forceManifest), signal);
    }
    catch (error) {
        signal?.throwIfAborted();
        // Only a missing manifest identifies the legacy protocol. A network or integrity
        // failure must not silently trigger a much larger, less strict catalog download.
        if (!(error instanceof CatalogSourceError) || error.status !== 404)
            throw error;
        if (locator)
            throw new CatalogLookupError("catalog-changed", "目录版本已变化，请刷新列表后重试");
        fallbackReasons.set(`${baseUrl}/manifest.json`, "目录未提供 manifest，使用旧版目录");
        return findLegacyPublishedEntry(baseUrl, fullName, signal);
    }
    signal?.throwIfAborted();
    let totalRank;
    if (locator) {
        if (!Number.isSafeInteger(locator.totalRank) || locator.totalRank < 1) {
            throw new CatalogLookupError("invalid-locator", "安装目录定位信息无效，请刷新列表后重试");
        }
        if (locator.snapshotId !== manifest.snapshotId || locator.totalRank > manifest.datasets.total.count) {
            throw new CatalogLookupError("catalog-changed", "目录版本已变化，请刷新列表后重试");
        }
        totalRank = locator.totalRank;
    }
    else {
        const search = await waitForCatalog(loadManifestDataset(baseUrl, manifest, manifest.datasets.search, "search"), signal);
        signal?.throwIfAborted();
        const indexed = findEntry(search, fullName);
        if (!indexed) {
            if (!manifest.datasets.skills) {
                // Older v2 publications kept Skills exclusively in the legacy catalog.
                const legacy = await findLegacyPublishedEntry(baseUrl, fullName, signal);
                return legacy?.type.toLowerCase() === "skill" ? legacy : undefined;
            }
            const skills = await waitForCatalog(loadManifestDataset(baseUrl, manifest, manifest.datasets.skills, "skills"), signal);
            return findEntry(skills, fullName);
        }
        totalRank = indexed.totalRank ?? indexed.rank;
    }
    const pageNumber = Math.floor((totalRank - 1) / manifest.datasets.total.pageSize) + 1;
    const pageReference = manifest.datasets.total.pages.find((page) => page.page === pageNumber);
    if (!pageReference)
        throw new CatalogSourceError("榜单 manifest 缺少插件对应的总榜分页");
    signal?.throwIfAborted();
    const page = await waitForCatalog(loadManifestDataset(baseUrl, manifest, pageReference, "total"), signal);
    const entry = findEntry(page, fullName);
    if (!entry)
        throw new CatalogLookupError("catalog-changed", "目录定位与插件不一致，请刷新列表后重试");
    return entry;
}
async function findLegacyPublishedEntry(baseUrl, fullName, signal) {
    const fullUrl = `${baseUrl}/rankings.json`;
    const [full, hot, rising, search] = await Promise.all([
        cachedCatalog(fullUrl),
        cachedCatalog(`${baseUrl}/rankings-hot.json`),
        cachedCatalog(`${baseUrl}/rankings-rising.json`),
        cachedCatalog(`${baseUrl}/rankings-search.json`),
    ]);
    signal?.throwIfAborted();
    const newestShardTime = Math.max(...[hot, rising, search].filter((value) => value !== null).map(catalogSnapshotTime), Number.NEGATIVE_INFINITY);
    if (full
        && Date.now() - full.fetchedAt < CACHE_MS
        && catalogSnapshotTime(full) >= newestShardTime) {
        return findEntry(full.document, fullName);
    }
    signal?.throwIfAborted();
    const current = await waitForCatalog(loadCatalogDocument(fullUrl, parseRankingsDocument, true, false), signal);
    return findEntry(current, fullName);
}
/** Load the small published shard used by the initial hot/rising tabs. */
export async function loadRankingView(dataUrl, view, force = false) {
    const baseUrl = normalizeDataUrl(dataUrl);
    const url = `${baseUrl}/rankings-${view}.json`;
    const manifest = await discoveryManifest(baseUrl, force);
    if (manifest)
        return loadManifestDataset(baseUrl, manifest, manifest.datasets[view], view, force);
    const manifestError = new Error("服务器未提供 manifest，使用旧版目录");
    try {
        const document = await loadCatalogDocument(url, (raw) => parseRankingViewDocument(raw, view), force);
        fallbackReasons.set(url, `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`);
        return document;
    }
    catch (error) {
        if (error instanceof CatalogSourceError && error.fallbackToFull) {
            const document = await loadRankings(baseUrl, force);
            const fullUrl = `${baseUrl}/rankings.json`;
            const fullReason = fallbackReasons.get(fullUrl);
            fallbackReasons.set(fullUrl, [
                `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`,
                `${view} 分片不可用：${describeCatalogFetchError(error)}`,
                fullReason,
            ].filter(Boolean).join("；"));
            return document;
        }
        throw error;
    }
}
export function findEntry(document, fullName) {
    const needle = fullName.toLowerCase();
    return document.rankings.total.find((entry) => entry.fullName.toLowerCase() === needle);
}
