/** Read-only profile and rankings diagnostics for the Settings page. */

import type { PluginHost } from "./contracts.js";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATA_URL, loadSearchRankings, normalizeDataUrl } from "./catalog.js";
import { githubRepositoryIdentity } from "../shared/github-source.js";
import { matchCatalogEntry, skillsRoot } from "./manage.js";
import { isInstalledEntry, verifiedInstalledRepository } from "../install/install-spec.js";
import { readBundleProvenance } from "./provenance.js";
import { bundlePatchEntries, isProtectedPackage, readUserPatch, userPatchState, userPatchPath } from "./patch-toggle.js";
import { applyDshPatches, disabledRowIds, insertedRows, type DshPatch } from "./dsh-patch.js";
import { INBOX_BUNDLES, profileDir } from "./profile.js";
import { compareSemver, parseSemver, satisfiesRange } from "./semver.js";
import {
  DIAGNOSTIC_SCHEMA,
  type DiagnosticBundle,
  type DiagnosticFinding,
  type DiagnosticHostDep,
  type DiagnosticMultiVersion,
  type DiagnosticPeer,
  type DiagnosticReport,
  type DiagnosticSkill,
  type RankingsDocument,
} from "../shared/types.js";

const HOST_CORE_RE = /^@deepseek-ai\/(?:dsh|cordis)(?:-|$)/;
const STALE_DAYS = 14;

export interface DiagnoseOptions {
  readRuntime?: PluginHost["readRuntime"];
  profileDir?: string;
  dataUrl?: string;
  document?: RankingsDocument | null;
  fetchCatalog?: boolean;
  now?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJsonFile(path: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return isRecord(value) ? value : null;
  } catch { return null; }
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function pluginVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8")) as { version?: string };
    return manifest.version ?? "0.1.0";
  } catch { return "0.1.0"; }
}

function findDshInstallDir(entry = process.argv[1]): string | null {
  if (!entry) return null;
  let dir = dirname(entry);
  for (let depth = 0; depth < 10; depth += 1) {
    if (readJsonFile(join(dir, "package.json"))?.name === "@deepseek-ai/dsh") return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function resolvePackageDir(profileDirectory: string, name: string, hostDir: string | null): string | null {
  const candidates = [join(profileDirectory, "node_modules", name)];
  if (hostDir) {
    // npm/npx hoists official packages beside DSH, while pnpm may nest them.
    // Enumerate Node's lookup directories without importing any target module.
    try {
      const paths = createRequire(join(hostDir, "package.json")).resolve.paths(name) ?? [];
      candidates.push(...paths.map((directory) => join(directory, name)));
    } catch { candidates.push(join(hostDir, "node_modules", name)); }
  }
  candidates.push(join(dirname(profileDirectory), "node_modules", name));
  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? null;
}

function resolvePeerDirectory(packageDirectory: string, profileDirectory: string, name: string, hostDir: string | null): string | null {
  // pnpm resolves peers beside the plugin's real installation, not necessarily at profile root.
  try {
    const resolve = createRequire(join(realpathSync(packageDirectory), "package.json")).resolve;
    const candidates = (resolve.paths(name) ?? []).map((directory) => join(directory, name));
    const found = candidates.find((directory) => existsSync(join(directory, "package.json")));
    if (found) return found;
  } catch { /* Fall back to the known DSH profile/host locations. */ }
  return resolvePackageDir(profileDirectory, name, hostDir);
}

function patchEntries(directory: string | null, manifest: Record<string, unknown> | null): { path: string | null; ids: string[]; patches: DshPatch[]; error: string | null } {
  if (!directory || !manifest) return { path: null, ids: [], patches: [], error: null };
  const declared = isRecord(manifest.dsh) && isRecord(manifest.dsh.bundle) && typeof manifest.dsh.bundle.patch === "string"
    ? manifest.dsh.bundle.patch : null;
  try { return { ...bundlePatchEntries(directory), error: null }; }
  catch (error) { return { path: declared ? join(directory, declared) : null, ids: [], patches: [], error: error instanceof Error ? error.message : String(error) }; }
}

function listSkills(): DiagnosticSkill[] {
  const root = skillsRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const path = join(root, entry.name, "SKILL.md");
    let description = "";
    try { description = /^description:\s*(.+)$/m.exec(readFileSync(path, "utf8"))?.[1]?.trim() ?? ""; } catch { /* missing */ }
    return { name: entry.name, hasManifest: existsSync(path), description };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function lockfileCoreVersions(directory: string): DiagnosticMultiVersion[] {
  let text = "";
  try { text = readFileSync(join(directory, "pnpm-lock.yaml"), "utf8"); } catch { return []; }
  const found = new Map<string, Set<string>>();
  for (const match of text.matchAll(/(@deepseek-ai\/(?:dsh|cordis)[^@\s'"]*?)@([0-9][^\s:'"()]*)/g)) {
    if (!parseSemver(match[2] ?? "")) continue;
    const versions = found.get(match[1]) ?? new Set<string>();
    versions.add(match[2]);
    found.set(match[1], versions);
  }
  return [...found].map(([name, versions]) => ({ name, versions: [...versions].sort(compareSemver) })).filter((item) => item.versions.length > 1);
}

function daysBetween(from: string, now: number): number | null {
  const stamp = Date.parse(from);
  return Number.isNaN(stamp) ? null : Math.floor((now - stamp) / 86_400_000);
}

export async function buildDiagnosticReport(profile: string, options: DiagnoseOptions = {}): Promise<DiagnosticReport> {
  const now = options.now ?? Date.now();
  const directory = options.profileDir ?? profileDir(profile);
  const findings: DiagnosticFinding[] = [];
  const manifest = readJsonFile(join(directory, "package.json"));
  const dependencies = stringRecord(manifest?.dependencies);
  if (!manifest) findings.push({ severity: "error", code: "profile-missing", subject: profile, message: `profile 目录不可读：${directory}`, parameters: { directory } });

  const declared = isRecord(manifest?.dsh) && isRecord(manifest.dsh.profile) && Array.isArray(manifest.dsh.profile.bundles)
    ? manifest.dsh.profile.bundles.filter((item): item is string => typeof item === "string") : Object.keys(dependencies);
  // Only scan the bundle order declared by this profile. Other inbox bundles may
  // exist on disk for a different profile and must not be reported as loaded.
  const bundleNames = [...new Set(declared)];
  const extraDependencies = Object.keys(dependencies).filter((name) => !declared.includes(name));
  const dataUrl = normalizeDataUrl(options.dataUrl || DEFAULT_DATA_URL);
  const started = Date.now();
  let document = options.document ?? null;
  let catalogError: string | null = null;
  if (!document && options.fetchCatalog !== false) {
    try { document = await loadSearchRankings(dataUrl); } catch (error) { catalogError = error instanceof Error ? error.message : String(error); }
  }
  const catalog = {
    dataUrl,
    ok: document !== null,
    error: catalogError,
    snapshotDate: document?.snapshotDate ?? null,
    generatedAt: document?.generatedAt ?? null,
    fetchedAt: document ? Date.now() : null,
    latencyMs: Date.now() - started,
    counts: { hot: document?.rankings.hot.length ?? 0, rising: document?.rankings.rising.length ?? 0, total: document?.rankings.total.length ?? 0 },
    staleDays: document?.snapshotDate ? daysBetween(document.snapshotDate, now) : null,
  };
  if (!catalog.ok) findings.push({ severity: "error", code: "catalog-unreachable", subject: dataUrl, message: catalog.error ?? "榜单不可用" });
  else if ((catalog.staleDays ?? 0) > STALE_DAYS) findings.push({ severity: "warning", code: "catalog-stale", subject: dataUrl, message: `榜单快照已有 ${catalog.staleDays} 天`, parameters: { days: catalog.staleDays! } });

  const hostDir = findDshInstallDir();
  const bundles: DiagnosticBundle[] = [];
  const peers: DiagnosticPeer[] = [];
  const hostDeps: DiagnosticHostDep[] = [];
  const idLayers = new Map<string, string[]>();
  const patchPath = userPatchPath(profile, directory);
  let userPatches: DshPatch[] = [];
  const bundlePatches: DshPatch[] = [];
  let patchState = { disables: [] as string[], forced: [] as string[] };
  try { userPatches = readUserPatch(patchPath); }
  catch (error) {
    findings.push({ severity: "error", code: "user-patch-invalid", subject: "cordis.patch.yml", message: "用户补丁不可读取或不是有效的 DSH 补丁列表", detail: error instanceof Error ? error.message : String(error) });
  }
  for (const name of bundleNames) {
    const official = INBOX_BUNDLES.has(name) || name.startsWith("@deepseek-ai/");
    const spec = dependencies[name] ?? "(host inbox)";
    const packageDirectory = resolvePackageDir(directory, name, hostDir);
    const packageManifest = packageDirectory ? readJsonFile(join(packageDirectory, "package.json")) : null;
    const patch = patchEntries(packageDirectory, packageManifest);
    bundlePatches.push(...patch.patches);
    const version = typeof packageManifest?.version === "string" ? packageManifest.version : null;
    const local = spec.startsWith("link:") || spec.startsWith("file:");
    let catalogEntry = matchCatalogEntry(document, name, spec, null);
    if (!catalogEntry && packageManifest && !official) {
      try {
        const provenance = readBundleProvenance(name, profile, directory);
        // Recorded installs retain their stronger version/source checks. Repository
        // metadata is a fallback only for packages installed outside this plugin.
        const installedEvidence = { manifest: packageManifest, provenance };
        const repository = provenance ? verifiedInstalledRepository(name, spec, installedEvidence) : githubRepositoryIdentity(packageManifest.repository);
        if (repository) catalogEntry = matchCatalogEntry(document, name, spec, repository);
        const evidence = { [name]: installedEvidence };
        const matches = document?.rankings.total.filter((entry) => isInstalledEntry(entry, { [name]: spec }, profile, evidence)) ?? [];
        if (!catalogEntry && matches.length === 1) catalogEntry = matches[0];
      } catch { /* Missing or unreadable provenance is not proof of a catalog association. */ }
    }
    let error: string | null = null;
    let errorCode: DiagnosticBundle["errorCode"];
    if (!packageDirectory) { error = "包未解析到安装目录"; errorCode = "package-missing"; }
    else if (!packageManifest) { error = "package.json 不可读"; errorCode = "manifest-unreadable"; }
    else if (!official && !isRecord(packageManifest.dsh)) { error = "不是 DSH bundle（缺少 dsh 清单字段）"; errorCode = "not-dsh-bundle"; }
    else if (patch.error) { error = `插件补丁缺失或无效：${patch.error}`; errorCode = "patch-invalid"; }
    const enabled = true; // Computed once below after all bundle layers have composed.
    bundles.push({ name, spec, version, kind: official ? "official" : "community", directory: packageDirectory, patchPath: patch.path, entries: patch.ids, error, ...(errorCode ? { errorCode } : {}), enabled, local, protected: isProtectedPackage(name), catalogName: catalogEntry?.fullName ?? null, latest: null, updateAvailable: false });
    for (const id of patch.ids) idLayers.set(id, [...(idLayers.get(id) ?? []), name]);
    if (error) findings.push({ severity: official && !packageDirectory ? "warning" : "error", code: "bundle-unresolved", subject: name, message: error, detail: spec, ...(errorCode ? { parameters: { reason: errorCode } } : {}) });
    if (local) findings.push({ severity: "info", code: "bundle-local", subject: name, message: "本地 link/file 插件不能从排行页更新", detail: spec });
    if (document && !catalogEntry && !official) findings.push({ severity: "info", code: "bundle-unlisted", subject: name, message: "尚未匹配到榜单条目，不影响插件运行" });
    if (packageManifest && !official) {
      for (const [dependency, range] of Object.entries(stringRecord(packageManifest.peerDependencies))) {
        const resolvedDir = resolvePeerDirectory(packageDirectory!, directory, dependency, hostDir);
        const resolvedManifest = resolvedDir ? readJsonFile(join(resolvedDir, "package.json")) : null;
        const resolved = typeof resolvedManifest?.version === "string" ? resolvedManifest.version : null;
        const satisfied = resolved ? satisfiesRange(resolved, range) : null;
        peers.push({ plugin: name, name: dependency, range, resolved, satisfied });
        const peerMeta = isRecord(packageManifest.peerDependenciesMeta) ? packageManifest.peerDependenciesMeta[dependency] : null;
        const optional = isRecord(peerMeta) && peerMeta.optional === true;
        if (!resolved && !optional) findings.push({ severity: "error", code: "peer-missing", subject: name, message: `缺少必需依赖 ${dependency}（声明 ${range}）`, parameters: { dependency, range } });
        if (satisfied === false) findings.push({ severity: "warning", code: "peer-mismatch", subject: name, message: `${dependency} 声明 ${range}，解析到 ${resolved}`, parameters: { dependency, range, resolved: resolved! } });
      }
      for (const [dependency, range] of Object.entries(stringRecord(packageManifest.dependencies))) {
        if (!HOST_CORE_RE.test(dependency)) continue;
        hostDeps.push({ plugin: name, dependency, range });
        findings.push({ severity: "warning", code: "host-core-dependency", subject: name, message: `把宿主核心包 ${dependency} 写进了 dependencies`, detail: range, parameters: { dependency, range } });
      }
    }
  }

  const baseRows = applyDshPatches(bundlePatches);
  patchState = userPatchState(userPatches, insertedRows([{ insert: baseRows }]));
  const disabled = disabledRowIds(applyDshPatches([...bundlePatches, ...userPatches]));
  for (const bundle of bundles) {
    bundle.enabled = bundle.entries.length === 0 || !bundle.entries.every((id) => disabled.has(id));
    if (!bundle.enabled) findings.push({ severity: "info", code: "bundle-disabled", subject: bundle.name, message: "当前配置已停用该插件的全部加载行" });
  }
  const duplicates = [...idLayers].filter(([, layers]) => layers.length > 1).map(([id, layers]) => ({ id, layers, count: layers.length }));
  for (const item of duplicates) findings.push({ severity: "error", code: "duplicate-entry", subject: item.id, message: `加载 id 出现在 ${item.layers.join(" / ")}`, parameters: { layers: item.layers } });
  const skills = listSkills();
  for (const skill of skills) if (!skill.hasManifest) findings.push({ severity: "warning", code: "skill-manifest-missing", subject: skill.name, message: "Skill 目录缺少 SKILL.md" });
  const multiVersion = lockfileCoreVersions(directory);
  for (const item of multiVersion) findings.push({ severity: "warning", code: "core-multi-version", subject: item.name, message: `锁文件里有多个版本：${item.versions.join(" / ")}`, parameters: { versions: item.versions } });
  const knownIds = new Set(bundles.flatMap((bundle) => bundle.entries));
  const orphans = patchState.disables.filter((id) => !knownIds.has(id));
  for (const id of orphans) findings.push({ severity: "warning", code: "patch-orphan", subject: id, message: "用户补丁停用了一个当前加载层找不到的 id" });
  for (const name of extraDependencies) findings.push({ severity: "info", code: "extra-dependency", subject: name, message: "写在 package.json 里，但不在 dsh.profile.bundles 加载顺序中", detail: dependencies[name] });
  const runtime = options.readRuntime?.(bundles.map((bundle) => ({ name: bundle.name, enabled: bundle.enabled, entryIds: bundle.entries }))) ?? {};
  for (const bundle of bundles) {
    const status = runtime[bundle.name];
    if (!status) continue;
    bundle.runtime = status;
    if (status.state === "missing-services" || status.state === "failed" || status.state === "restart-required") {
      findings.push({ severity: status.state === "restart-required" ? "info" : "error", code: `runtime-${status.state}`, subject: bundle.name,
        message: status.state === "missing-services" ? "宿主入口缺少必需服务；请检查作者要求的配置或配套插件" : status.state === "failed" ? "宿主入口加载失败；请查看 DSH 日志" : "配置已改变，重启 DSH 后刷新验证",
        parameters: { services: status.missingServices ?? [] } });
    }
  }
  findings.sort((left, right) => ({ error: 0, warning: 1, info: 2 })[left.severity] - ({ error: 0, warning: 1, info: 2 })[right.severity]);
  const errors = findings.filter((item) => item.severity === "error");
  const warnings = findings.filter((item) => item.severity === "warning");
  const infos = findings.filter((item) => item.severity === "info");

  return {
    schema: DIAGNOSTIC_SCHEMA,
    profile,
    profileDir: directory,
    scannedAt: now,
    pluginVersion: pluginVersion(),
    summary: { ok: errors.length === 0, errors: errors.length, warnings: warnings.length, infos: infos.length, conflicts: duplicates.length, dependencies: findings.filter((item) => item.code === "peer-missing" || item.code === "peer-mismatch").length + multiVersion.length + hostDeps.length, catalogIssues: findings.filter((item) => item.code.startsWith("catalog-")).length, order: extraDependencies.length },
    catalog,
    inventory: { official: bundles.filter((item) => item.kind === "official").length, community: bundles.filter((item) => item.kind === "community").length, skills: skills.length, enabled: bundles.filter((item) => item.enabled).length, disabled: bundles.filter((item) => !item.enabled).length, protected: bundles.filter((item) => item.protected).length, local: bundles.filter((item) => item.local).length, updates: 0, catalogMatched: bundles.filter((item) => item.catalogName).length, missingOnDisk: bundles.filter((item) => !item.directory).length, extraDependencies },
    bundles,
    skills,
    duplicates,
    peers,
    multiVersion,
    hostDeps,
    patch: { path: patchPath, exists: existsSync(patchPath), disables: patchState.disables, forced: patchState.forced, orphans },
    findings,
  };
}
