/** Host HTTP routes for catalog, install, and status. */
import { prepareRestart, trustedRestartRequest } from "./restart.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_DATA_URL, filterCatalog, filteredCatalogCategories, findPublishedEntry, CatalogLookupError, catalogCacheStatus, invalidateCatalog, isRankingView, isCatalogScope, isInstallAvailability, loadCachedRankings, loadCatalogMetadata, loadRankingView, loadSearchRankings, loadSkillRankings, normalizeDataUrl, } from "./catalog.js";
import { cancelActive, progress, runDshPlugin, runDshProfileCheck, } from "../install/dsh-cli.js";
import { queryOf, readJsonBody, sameOrigin, sendJson } from "./http.js";
import { FULL_NAME_RE, isInstalledEntry, resolveInstallSpec } from "../install/install-spec.js";
import { allowPackageBuild } from "../install/allow-builds.js";
import { classifyInstallFailure, withPnpmRecovery } from "../install/pnpm-compat.js";
import { dropFromManifest, INBOX_BUNDLES, isDshProfileName, profileDir, readInstalled, readInstalledManifest, readProfileManifestSnapshot, restoreProfileManifest, } from "./profile.js";
import { buildDiagnosticReport } from "./diagnose.js";
import { cleanupAfterUninstall, listManagedPlugins } from "./manage.js";
import { backupSkill, inspectSkill, withSkillMutationLock } from "./skill-management.js";
import { preflightSourceMigration, applySourceMigration } from "./source-migration.js";
import { parseNpmSelector } from "../install/npm-selector.js";
import { isProtectedPackage, parseDshPatchText, rowIdsForPackage, setPackageEnabled, userPatchPackageReferences, userPatchPath, } from "./patch-toggle.js";
import { installSkill, rollbackInstalledSkill } from "../install/skill-install.js";
import { consumeInstallApproval, createInstallPreflight, validateInstallApprovals } from "./install-preflight.js";
import { createUpdatePreflight, validateUpdateApprovals, assertUpdateUnchanged, discardUpdateApprovals, UpdateNotAvailableError, startUpdatePreflightSession, finalizeUpdatePreflightSession, discardUpdatePreflightSession } from "./update-preflight.js";
import { assertProvenanceLedgerReadable, recordInstallProvenance, readSkillProvenance, readBundleProvenance } from "./provenance.js";
import { MAX_UPDATE_BATCH_SIZE } from "../shared/types.js";
import { isPluginCategoryId } from "../shared/categories.js";
const BOOT_ID = `${process.pid}-${Math.floor((Date.now() - process.uptime() * 1000) / 1000)}`;
let restartPending = false;
let activeMutations = 0;
const MAX_BATCH_SIZE = 20;
// Twenty scoped npm names plus their approval records can exceed the small-route default.
const MAX_BATCH_BODY_BYTES = 32 * 1024;
const MAX_UPDATE_BODY_BYTES = 128 * 1024;
const MAX_SKILL_CONCURRENCY = 3;
const TERMINAL_PHASES = ["installed", "failed", "cancelled"];
function hasLegacyTagSources(config) {
    const path = join(profileDir(config.profile, config.profileDirectory), "package.json");
    if (!existsSync(path))
        return false;
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        throw new Error("Profile package.json 不可读取，请先修复配置");
    }
    return ["dependencies", "devDependencies", "optionalDependencies"].some((field) => {
        const entries = manifest[field];
        return entries !== null && typeof entries === "object" && Object.values(entries).some((spec) => typeof spec === "string" && parseNpmSelector(spec)?.kind === "tag");
    });
}
function assertFixedDependencySources(config) {
    if (hasLegacyTagSources(config))
        throw Object.assign(new Error("检测到旧版可变频道依赖；pnpm 可能顺带更新其他插件。请先到“已安装”页确认“固定当前版本并保留频道”，再重新操作。"), { code: "source-migration-required" });
}
class SubmissionError extends Error {
    status = 409;
}
const submissions = new Map();
const SUBMISSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function submissionKey(config, submissionId) {
    if (typeof submissionId !== "string" || !SUBMISSION_ID_RE.test(submissionId)) {
        throw new SubmissionError("提交编号无效，请重新检查任务状态");
    }
    return JSON.stringify([config.profile, resolve(profileDir(config.profile, config.profileDirectory)), submissionId]);
}
function canonicalBody(value) {
    if (Array.isArray(value))
        return value.map(canonicalBody);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalBody(child)]));
    return value;
}
function prepareSubmission(config, path, body) {
    if (body.submissionId === undefined)
        return null; // Older clients remain supported.
    const key = submissionKey(config, body.submissionId);
    const fingerprint = createHash("sha256").update(JSON.stringify([path, canonicalBody(body)])).digest("hex");
    const receipt = submissions.get(key);
    if (receipt?.fingerprint && receipt.fingerprint !== fingerprint)
        throw new SubmissionError("同一提交编号不能用于不同操作");
    if (receipt?.cancelled && !receipt.batchId)
        throw new SubmissionError("此提交已取消，迟到请求不会执行");
    return { key, fingerprint, replay: receipt?.batchId ? batchSnapshot(receipt.batchId) : null };
}
function acceptedSubmission(response, submission, batch) {
    // Remember acceptance before writing the response; a lost connection must not
    // lose the ability to reconcile a running or already completed operation.
    if (submission)
        submissions.set(submission.key, { fingerprint: submission.fingerprint, batchId: batch.batchId, cancelled: false });
    sendJson(response, 202, batch);
}
function submissionErrorStatus(error, fallback = 400) {
    return error instanceof SubmissionError ? error.status : fallback;
}
const jobs = new Map();
const batches = new Map();
const profileQueues = new Map();
const activeProfileJobs = new Map();
const skillQueue = [];
let activeSkills = 0;
let nextId = 0;
function pluginVersion() {
    try {
        const manifestPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        return manifest.version ?? "0.1.0";
    }
    catch {
        return "0.1.0";
    }
}
async function safeLoad(config) {
    return loadSearchRankings(config.dataUrl || DEFAULT_DATA_URL);
}
function installFailure(result) {
    const failure = classifyInstallFailure(result);
    const detail = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n").slice(-2400);
    return failure ? `[${failure.code}] ${failure.message}\n${detail}` : detail || "install failed";
}
function runProfilePlugin(config, args, fullName, commandRuntime) {
    return withPnpmRecovery((profile, recoveredArgs) => (commandRuntime?.runPlugin ?? runDshPlugin)(profile, recoveredArgs, { fullName }), config.profile, args, config.profileDirectory);
}
function fileProfileCheck(config) {
    try {
        const directory = profileDir(config.profile, config.profileDirectory);
        const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
        const bundles = manifest.dsh?.profile?.bundles;
        if (bundles !== undefined && (!Array.isArray(bundles) || bundles.some((name) => typeof name !== "string"))) {
            throw new Error("dsh.profile.bundles 必须是字符串数组");
        }
        for (const name of Array.isArray(bundles) ? bundles : []) {
            // DSH template bundles are host-provided and deliberately absent from
            // the profile dependency map. Desktop owns their resolution surface.
            if (manifest.dependencies?.[name] === undefined) {
                if (INBOX_BUNDLES.has(name))
                    continue;
                throw new Error(`${name} 未声明在 dependencies 中`);
            }
            const candidates = [
                join(directory, "node_modules", name),
                join(dirname(directory), "node_modules", name),
            ];
            const packageDirectory = candidates.find((candidate) => existsSync(join(candidate, "package.json")));
            if (!packageDirectory)
                throw new Error(`${name} 未安装在 profile 可见的 node_modules 中`);
            const bundle = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
            const patch = bundle.dsh?.bundle?.patch;
            if (typeof patch !== "string" || !patch.trim() || !existsSync(join(packageDirectory, patch))) {
                throw new Error(`${name} 缺少可加载的 dsh.bundle patch`);
            }
            if (parseDshPatchText(readFileSync(join(packageDirectory, patch), "utf8")) === null) {
                throw new Error(`${name} 的 dsh.bundle patch 不是有效的 DSH 补丁列表`);
            }
        }
        return { exitCode: 0, timedOut: false, stdout: "", stderr: "", cancelled: false };
    }
    catch (error) {
        return { exitCode: 1, timedOut: false, stdout: "", stderr: error instanceof Error ? error.message : String(error), cancelled: false };
    }
}
function checkProfile(config, commandRuntime) {
    if (commandRuntime?.checkProfile)
        return commandRuntime.checkProfile(config.profile);
    if (config.profileDirectory === undefined)
        return runDshProfileCheck(config.profile);
    return Promise.resolve(fileProfileCheck(config));
}
function id(prefix) {
    nextId += 1;
    return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`;
}
function publicJob(job) {
    const skillBackups = job.skillBackups?.filter((backup) => existsSync(backup.path));
    return {
        id: job.id,
        batchId: job.batchId,
        fullName: job.fullName,
        profile: job.profile,
        profileDirectory: job.profileDirectory,
        recovery: job.recovery,
        action: job.action,
        kind: job.kind,
        phase: job.phase,
        lastLine: job.lastLine,
        ...(skillBackups?.length ? { skillBackups } : {}),
        error: job.error,
        message: job.message,
        requiresRestart: job.requiresRestart,
        activationState: job.activationState,
        provenance: job.provenance,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        cancelRequested: job.cancelRequested,
    };
}
function dependencySnapshot(config, targetPackage) {
    const manifest = readProfileManifestSnapshot(config.profile, config.profileDirectory);
    const packages = new Map();
    for (const name of new Set([...Object.keys(manifest.dependencies), ...(targetPackage ? [targetPackage] : [])])) {
        const installed = readInstalledManifest(config.profile, name, config.profileDirectory);
        packages.set(name, installed ? { name: installed.name, version: installed.version } : null);
    }
    return { manifest, packages };
}
/** Both install and update keep their profile queue lock throughout strict recovery. */
async function recoverDependencyOperation(job, config, before, error, commandRuntime) {
    const action = job.action === "update" ? "更新" : "安装";
    const detail = error instanceof Error ? error.message : String(error);
    // Cancelling the original operation must not interrupt its recovery command.
    updateJob(job, "validating", { lastLine: `正在恢复${action}前的依赖，请等待恢复完成` });
    try {
        restoreProfileManifest(config.profile, before.manifest, config.profileDirectory);
        if (!isDeepStrictEqual(readProfileManifestSnapshot(config.profile, config.profileDirectory), before.manifest)) {
            throw new Error("无法恢复操作前的配置或锁文件");
        }
        // Never let automatic pnpm workarounds recalculate the saved lockfile.
        const restored = await (commandRuntime?.runPlugin ?? runDshPlugin)(config.profile, ["install", "--frozen-lockfile"], { fullName: job.fullName });
        if (restored.exitCode !== 0 || restored.timedOut || restored.cancelled)
            throw new Error(installFailure(restored));
        for (const [name, expected] of before.packages) {
            const installed = readInstalledManifest(config.profile, name, config.profileDirectory);
            const actual = installed ? { name: installed.name, version: installed.version } : null;
            if (!isDeepStrictEqual(actual, expected))
                throw new Error(`恢复后的依赖 ${name} 与操作前不一致`);
        }
        const checked = await checkProfile(config, commandRuntime);
        if (checked.exitCode !== 0 || checked.timedOut || checked.cancelled)
            throw new Error(installFailure(checked));
        invalidateCatalog();
        updateJob(job, job.cancelRequested ? "cancelled" : "failed", {
            recovery: "restored",
            error: `${detail}；已自动回滚到${action}前版本`,
            lastLine: `${action}${job.cancelRequested ? "已取消" : "失败"}，原有依赖已恢复`,
            activationState: "restart-required", requiresRestart: true,
        });
    }
    catch (recoveryError) {
        updateJob(job, "failed", {
            recovery: "failed",
            error: `${detail}；自动恢复失败，需要手动检查：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
            lastLine: `${action}未完成且自动恢复失败，需要修复`, activationState: "broken", requiresRestart: true,
        });
    }
}
/** Keep the profile queue locked until either the update or its recovery finishes. */
async function runApprovedUpdate(job, config, approval, commandRuntime) {
    let before = null;
    let mutationStarted = false;
    try {
        assertFixedDependencySources(config);
        assertUpdateUnchanged(approval, config.profile, config.profileDirectory);
        assertProvenanceLedgerReadable(config);
        updateJob(job, "validating", { lastLine: "正在检查更新前的 DSH 配置" });
        const baseline = await checkProfile(config, commandRuntime);
        if (baseline.cancelled)
            job.cancelRequested = true;
        if (baseline.exitCode !== 0 || baseline.timedOut || baseline.cancelled) {
            throw new Error(`当前 DSH 配置存在问题，更新已停止：${installFailure(baseline)}`);
        }
        job.controller.signal.throwIfAborted();
        assertUpdateUnchanged(approval, config.profile, config.profileDirectory);
        before = dependencySnapshot(config, approval.name);
        assertFixedDependencySources(config);
        mutationStarted = true;
        if (approval.bundleTarget.needsBuildApproval) {
            if (approval.bundleTarget.buildApprovalKeys.length === 0)
                throw new Error("更新缺少可验证的构建授权键");
            allowPackageBuild(config.profile, approval.bundleTarget.buildApprovalKeys, config.profileDirectory);
        }
        updateJob(job, "installing", { lastLine: "正在更新到已确认的精确版本" });
        const result = await runProfilePlugin(config, ["add", approval.bundleTarget.target], approval.name, commandRuntime);
        if (result.cancelled)
            job.cancelRequested = true;
        if (result.exitCode !== 0 || result.timedOut || result.cancelled)
            throw new Error(installFailure(result));
        job.controller.signal.throwIfAborted();
        const installed = readInstalledManifest(config.profile, approval.name, config.profileDirectory);
        if (installed?.name !== approval.bundleTarget.packageName
            || (approval.bundleTarget.version !== null && installed?.version !== approval.bundleTarget.version)) {
            throw new Error("更新后的包名或版本与已确认来源不一致");
        }
        updateJob(job, "validating", { lastLine: "正在验证更新后的 DSH 配置" });
        const checked = await checkProfile(config, commandRuntime);
        if (checked.cancelled)
            job.cancelRequested = true;
        if (checked.exitCode !== 0 || checked.timedOut || checked.cancelled) {
            throw new Error(`插件更新后未通过 DSH 配置验证：${installFailure(checked)}`);
        }
        job.controller.signal.throwIfAborted();
        recordInstallProvenance(config, approval.preflight);
        invalidateCatalog();
        updateJob(job, "installed", {
            requiresRestart: true, activationState: "restart-required", message: "updated",
            provenance: approval.preflight.provenance, lastLine: "更新完成，已记录精确来源；重启后验证运行状态",
        });
    }
    catch (error) {
        if (!mutationStarted || !before) {
            failJob(job, error);
            return;
        }
        await recoverDependencyOperation(job, config, before, error, commandRuntime);
    }
}
function enqueueManageJob(batch, config, action, name, kind, commandRuntime, allowUnreadablePatch = false, updateApproval) {
    const job = {
        profileDirectory: resolve(profileDir(config.profile, config.profileDirectory)),
        id: id("job"), batchId: batch.id, fullName: name, profile: config.profile, action, kind,
        phase: "queued", lastLine: action === "update" ? "等待更新" : "等待卸载",
        error: null, message: null, requiresRestart: false, cancelRequested: false,
        activationState: "pending", provenance: null,
        controller: new AbortController(), createdAt: Date.now(), startedAt: null, finishedAt: null,
    };
    jobs.set(job.id, job);
    batch.jobIds.push(job.id);
    if (kind === "skill") {
        void (async () => {
            try {
                if (action !== "uninstall")
                    throw new Error("Skill 不支持从排行页更新");
                updateJob(job, "installing", { lastLine: "正在移除 Skill" });
                const removed = await withSkillMutationLock(() => backupSkill(name), job.controller.signal);
                updateJob(job, "installed", { message: "uninstalled", requiresRestart: false, activationState: "not-applicable", skillBackups: [{ name, path: removed.backupPath }], lastLine: `已从所有 Profile 移除；完整内容已保留在 ${removed.backupPath}` });
            }
            catch (error) {
                failJob(job, error);
            }
        })();
        return;
    }
    updateJob(job, "waiting-profile-lock", { lastLine: "等待 profile 安装队列" });
    enqueueProfile(config.profile, job, async () => {
        if (job.cancelRequested) {
            updateJob(job, "cancelled");
            return;
        }
        if (action === "update") {
            if (!updateApproval) {
                failJob(job, new Error("更新需要重新预检并确认来源"));
                return;
            }
            await runApprovedUpdate(job, config, updateApproval, commandRuntime);
            return;
        }
        updateJob(job, "installing", { lastLine: "正在卸载插件" });
        const timer = setInterval(() => {
            if (progress.fullName === job.fullName && progress.lastLine)
                job.lastLine = progress.lastLine;
        }, 250);
        timer.unref?.();
        try {
            const spec = readInstalled(config.profile, config.profileDirectory)[name];
            assertFixedDependencySources(config);
            if (!spec)
                throw new Error("plugin is not installed");
            if (isProtectedPackage(name))
                throw new Error("该插件属于宿主或本排行插件，不能在这里管理");
            let cleanupRows = [];
            let cleanupNote = null;
            try {
                cleanupRows = rowIdsForPackage(config.profile, name, config.profileDirectory);
            }
            catch {
                cleanupNote = "未能核对原加载 id，已保留用户补丁，请在诊断页检查";
            }
            if (action === "uninstall") {
                const references = userPatchPackageReferences(userPatchPath(config.profile, config.profileDirectory), name);
                if (references === null && !allowUnreadablePatch)
                    throw new Error("无法安全检查 cordis.patch.yml，已停止卸载");
                if (references === null) {
                    // Explicit force authorizes package removal, never rewriting unreadable user configuration.
                    cleanupRows = [];
                    cleanupNote = "用户补丁无法解析，已保留原文件，请手动检查配置";
                }
                if (references !== null && references.length > 0) {
                    throw new Error(`cordis.patch.yml 仍通过 insert 引用 ${references.join("、")}，请先移除引用`);
                }
            }
            const result = await runProfilePlugin(config, ["remove", name], name, commandRuntime);
            const failed = result.exitCode !== 0 || result.timedOut || result.cancelled;
            if (failed) {
                if (action === "uninstall" && !result.cancelled) {
                    const installedOnDisk = existsSync(join(profileDir(config.profile, config.profileDirectory), "node_modules", name, "package.json"));
                    const stillDeclared = readInstalled(config.profile, config.profileDirectory)[name] !== undefined;
                    if (!installedOnDisk || !stillDeclared) {
                        if (!installedOnDisk)
                            dropFromManifest(config.profile, name, config.profileDirectory);
                        cleanupAfterUninstall(config.profile, name, cleanupRows, config.profileDirectory);
                        invalidateCatalog();
                        updateJob(job, "installed", {
                            requiresRestart: true,
                            activationState: "restart-required",
                            message: "uninstalled",
                            lastLine: cleanupNote ? `插件已移除；${cleanupNote}` : "卸载已完成，并清理了残留配置",
                        });
                        return;
                    }
                }
                throw new Error(installFailure(result));
            }
            if (action === "uninstall") {
                const installedOnDisk = existsSync(join(profileDir(config.profile, config.profileDirectory), "node_modules", name, "package.json"));
                if (!installedOnDisk)
                    dropFromManifest(config.profile, name, config.profileDirectory);
                if (readInstalled(config.profile, config.profileDirectory)[name] !== undefined) {
                    throw new Error("卸载命令已结束，但插件仍在 profile 清单中");
                }
                cleanupAfterUninstall(config.profile, name, cleanupRows, config.profileDirectory);
            }
            invalidateCatalog();
            updateJob(job, "installed", { requiresRestart: true, activationState: "restart-required", message: "uninstalled", lastLine: cleanupNote ? `插件已移除；${cleanupNote}` : "已卸载，重启后确认运行状态" });
        }
        catch (error) {
            failJob(job, error);
        }
        finally {
            clearInterval(timer);
        }
    });
}
function createManageJobs(config, action, items, commandRuntime, allowUnreadablePatch = false) {
    const batchId = id("batch");
    const batch = { id: batchId, createdAt: Date.now(), jobIds: [] };
    batches.set(batchId, batch);
    for (const item of items) {
        enqueueManageJob(batch, config, action, item.name, item.kind, commandRuntime, allowUnreadablePatch, item.updateApproval);
    }
    return batchSnapshot(batchId);
}
function batchSnapshot(batchId) {
    const batch = batches.get(batchId);
    if (!batch)
        return null;
    const batchJobs = batch.jobIds.map((jobId) => jobs.get(jobId)).filter((job) => Boolean(job)).map(publicJob);
    return {
        batchId,
        createdAt: batch.createdAt,
        jobs: batchJobs,
        completed: batchJobs.filter((job) => TERMINAL_PHASES.includes(job.phase)).length,
        total: batchJobs.length,
        requiresRestart: batchJobs.some((job) => job.phase === "installed" && job.requiresRestart),
    };
}
function activeBatchSnapshots(profile) {
    return [...batches.values()]
        .map((batch) => batchSnapshot(batch.id))
        .filter((snapshot) => (snapshot !== null
        && snapshot.completed < snapshot.total
        && snapshot.jobs.some((job) => job.profile === profile)))
        .sort((left, right) => right.createdAt - left.createdAt);
}
function updateJob(job, phase, patch = {}) {
    job.phase = phase;
    Object.assign(job, patch);
    if (job.startedAt === null && !["queued", "waiting-profile-lock"].includes(phase)) {
        job.startedAt = Date.now();
    }
    if (TERMINAL_PHASES.includes(phase))
        job.finishedAt = Date.now();
}
function failJob(job, error) {
    updateJob(job, job.cancelRequested ? "cancelled" : "failed", {
        error: error instanceof Error ? error.message : String(error),
        activationState: job.cancelRequested ? "unknown" : "broken",
    });
}
function pumpProfile(profile) {
    if (activeProfileJobs.has(profile))
        return;
    const queue = profileQueues.get(profile);
    const next = queue?.shift();
    if (!next) {
        profileQueues.delete(profile);
        return;
    }
    activeProfileJobs.set(profile, next.job.id);
    void next.run().finally(() => {
        activeProfileJobs.delete(profile);
        pumpProfile(profile);
    });
}
function enqueueProfile(profile, job, run) {
    const queue = profileQueues.get(profile) ?? [];
    queue.push({ job, run });
    profileQueues.set(profile, queue);
    pumpProfile(profile);
}
function pumpSkills() {
    while (activeSkills < MAX_SKILL_CONCURRENCY && skillQueue.length > 0) {
        const next = skillQueue.shift();
        if (!next)
            return;
        activeSkills += 1;
        void next().finally(() => {
            activeSkills -= 1;
            pumpSkills();
        });
    }
}
function enqueueSkill(run) {
    skillQueue.push(run);
    pumpSkills();
}
async function prepareJob(job, config, commandRuntime) {
    try {
        if (job.cancelRequested) {
            updateJob(job, "cancelled");
            return;
        }
        updateJob(job, "validating", { lastLine: "正在验证安装源" });
        const approval = job.approval;
        if (!approval)
            throw new Error("缺少安装预检确认，请重新检查来源与风险");
        assertProvenanceLedgerReadable(config);
        const entry = approval.entry;
        if (entry.type?.toLowerCase() === "skill") {
            updateJob(job, "queued", { lastLine: "等待 Skill 下载队列" });
            enqueueSkill(async () => withSkillMutationLock(async () => {
                if (job.cancelRequested) {
                    updateJob(job, "cancelled");
                    return;
                }
                try {
                    updateJob(job, "downloading", { lastLine: "正在下载并验证 Skill" });
                    const commit = approval.skillSource?.commit;
                    if (!commit)
                        throw new Error("Skill 安装确认缺少不可变 commit");
                    const skills = await installSkill(entry.fullName, { signal: job.controller.signal, commit, replaceExisting: true });
                    job.skillBackups = skills.filter((item) => item.backupPath).map((item) => ({ name: item.name, path: item.backupPath }));
                    if (job.cancelRequested) {
                        const recoveryErrors = [];
                        for (const skill of skills.filter((item) => !item.alreadyInstalled).reverse()) {
                            try {
                                rollbackInstalledSkill(skill);
                            }
                            catch (error) {
                                recoveryErrors.push(error instanceof Error ? error.message : String(error));
                            }
                        }
                        if (recoveryErrors.length)
                            throw new Error(`Skill 取消后部分内容未能恢复：${recoveryErrors.join("；")}`);
                        updateJob(job, "cancelled");
                        return;
                    }
                    try {
                        recordInstallProvenance(config, approval.preflight, skills);
                    }
                    catch (error) {
                        const cleanupErrors = [];
                        for (const skill of skills.filter((item) => !item.alreadyInstalled).reverse()) {
                            try {
                                rollbackInstalledSkill(skill);
                            }
                            catch (cleanupError) {
                                cleanupErrors.push(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
                            }
                        }
                        throw new Error([
                            `Skill 来源台账写入失败，已尝试恢复本次变更：${error instanceof Error ? error.message : String(error)}`,
                            cleanupErrors.length > 0 ? `清理失败：${cleanupErrors.join("；")}` : "",
                        ].filter(Boolean).join("；"));
                    }
                    updateJob(job, "installed", {
                        message: `已安装 Skill：${skills.map((item) => item.name).join("、")}`,
                        requiresRestart: false,
                        activationState: entry.install?.needsConfig ? "configuration-required" : "not-applicable",
                        provenance: approval.preflight.provenance,
                        lastLine: (entry.install?.needsConfig
                            ? "Skill 已复制并记录来源；完成作者要求的配置后，在后续 Agent 会话中验证可见性"
                            : "全局 Skill 已复制并记录来源；将在后续 Agent 会话中验证可见性")
                            + skills.filter((item) => item.backupPath).map((item) => `；原内容备份：${item.backupPath}`).join(""),
                    });
                }
                catch (error) {
                    failJob(job, error);
                }
            }, job.controller.signal).catch((error) => failJob(job, error)));
            return;
        }
        const resolvedTarget = approval.bundleTarget;
        if (!resolvedTarget)
            throw new Error("Bundle 安装确认缺少已验证目标");
        const spec = resolveInstallSpec(entry, config.profile);
        if (!spec)
            throw new Error("this catalog entry has no trusted DSH install source");
        const target = resolvedTarget.target;
        let buildApprovalKeys = [];
        if (resolvedTarget.needsBuildApproval) {
            if (!resolvedTarget.packageName)
                throw new Error("插件需要构建，但 package.json 缺少 name");
            if (resolvedTarget.buildApprovalKeys.length === 0)
                throw new Error("插件需要构建，但没有可验证的 allowBuilds 键");
            buildApprovalKeys = resolvedTarget.buildApprovalKeys;
        }
        updateJob(job, "waiting-profile-lock", { lastLine: "等待 profile 安装队列" });
        enqueueProfile(config.profile, job, async () => {
            if (job.cancelRequested) {
                updateJob(job, "cancelled");
                return;
            }
            let before = null;
            const progressTimer = setInterval(() => {
                if (job.phase === "installing" && progress.fullName === job.fullName && progress.lastLine)
                    job.lastLine = progress.lastLine;
            }, 250);
            progressTimer.unref?.();
            try {
                updateJob(job, "validating", { lastLine: "正在检查当前 DSH profile" });
                const baseline = await checkProfile(config, commandRuntime);
                if (baseline.cancelled)
                    job.cancelRequested = true;
                if (baseline.exitCode !== 0 || baseline.timedOut || baseline.cancelled) {
                    throw new Error(`当前 DSH profile 已存在配置问题，安装已停止：${installFailure(baseline)}`);
                }
                job.controller.signal.throwIfAborted();
                if (isInstalledEntry(entry, readInstalled(config.profile, config.profileDirectory))) {
                    updateJob(job, "installed", {
                        message: "already installed",
                        requiresRestart: false,
                        activationState: "unknown",
                        provenance: null,
                        lastLine: "Profile 已声明该插件；当前进程运行状态尚未验证",
                    });
                    return;
                }
                assertFixedDependencySources(config);
                before = dependencySnapshot(config, resolvedTarget.packageName);
                if (buildApprovalKeys.length > 0)
                    allowPackageBuild(config.profile, buildApprovalKeys, config.profileDirectory);
                updateJob(job, "installing", { lastLine: "正在写入 DSH profile" });
                const result = await runProfilePlugin(config, ["add", target], job.fullName, commandRuntime);
                if (result.cancelled)
                    job.cancelRequested = true;
                if (result.exitCode !== 0 || result.timedOut || result.cancelled)
                    throw new Error(installFailure(result));
                job.controller.signal.throwIfAborted();
                updateJob(job, "validating", { lastLine: "正在验证安装后的 DSH 配置" });
                const after = await checkProfile(config, commandRuntime);
                if (after.cancelled)
                    job.cancelRequested = true;
                if (after.exitCode !== 0 || after.timedOut || after.cancelled) {
                    throw new Error(`插件安装后未通过 DSH 配置验证：${installFailure(after)}`);
                }
                job.controller.signal.throwIfAborted();
                recordInstallProvenance(config, approval.preflight);
                invalidateCatalog();
                updateJob(job, "installed", {
                    requiresRestart: true,
                    activationState: entry.install?.needsConfig ? "configuration-required" : "restart-required",
                    provenance: approval.preflight.provenance,
                    message: "installed",
                    lastLine: entry.install?.needsConfig
                        ? "已写入且配置可组合；完成作者要求的配置并重启 DSH 后再验证"
                        : "已写入且配置可组合；重启 DSH 后再验证实际运行状态",
                });
            }
            catch (error) {
                if (before)
                    await recoverDependencyOperation(job, config, before, error, commandRuntime);
                else
                    failJob(job, error);
            }
            finally {
                clearInterval(progressTimer);
            }
        });
    }
    catch (error) {
        failJob(job, error);
    }
}
function createBatch(approvals, config, commandRuntime) {
    const batchId = id("batch");
    const batch = { id: batchId, createdAt: Date.now(), jobIds: [] };
    batches.set(batchId, batch);
    const unique = new Map(approvals.map((approval) => [approval.entry.fullName, approval]));
    for (const [fullName, approval] of unique) {
        const job = {
            profileDirectory: resolve(profileDir(config.profile, config.profileDirectory)),
            id: id("job"),
            batchId,
            fullName,
            profile: config.profile,
            action: "install",
            phase: "queued",
            lastLine: "等待验证",
            error: null,
            message: null,
            requiresRestart: false,
            activationState: "pending",
            provenance: approval.preflight.provenance,
            cancelRequested: false,
            approval,
            controller: new AbortController(),
            createdAt: Date.now(),
            startedAt: null,
            finishedAt: null,
        };
        jobs.set(job.id, job);
        batch.jobIds.push(job.id);
        void prepareJob(job, config, commandRuntime);
    }
    return batchSnapshot(batchId);
}
function cancelJob(jobId, commandRuntime) {
    const job = jobs.get(jobId);
    if (!job || TERMINAL_PHASES.includes(job.phase))
        return false;
    job.cancelRequested = true;
    job.controller.abort();
    job.lastLine = "正在取消";
    if (job.phase === "installing" && activeProfileJobs.get(job.profile) === job.id) {
        return (commandRuntime?.cancelActive ?? cancelActive)();
    }
    if (["queued", "waiting-profile-lock"].includes(job.phase))
        updateJob(job, "cancelled");
    return true;
}
function readBodyRecord(body) {
    return body !== null && typeof body === "object" ? body : {};
}
export function mountRoutes(host, config, commandRuntime) {
    if (config.profileDirectory === undefined && !isDshProfileName(config.profile)) {
        throw new Error(`dsh-top100: invalid profile name ${JSON.stringify(config.profile)}`);
    }
    const registerRoute = (route) => host.webServer.register({ ...route, async handler(request, response) {
            if (restartPending && request.method === "POST" && route.path !== "/dsh-top100/restart") {
                sendJson(response, 409, { error: "DSH is restarting" });
                return;
            }
            const mutation = request.method === "POST" && route.path !== "/dsh-top100/restart";
            if (mutation)
                activeMutations += 1;
            try {
                await route.handler(request, response);
            }
            finally {
                if (mutation)
                    activeMutations -= 1;
            }
        } });
    const restartStatus = (request) => trustedRestartRequest(request, false)
        ? host.restartCapability?.() ?? { available: false, reason: "launcher" }
        : { available: false, reason: "remote" };
    const initialInstalled = readInstalled(config.profile, config.profileDirectory);
    const toggled = new Set();
    const observeRuntime = (bundles) => {
        const installed = readInstalled(config.profile, config.profileDirectory);
        return host.readRuntime?.(bundles.map((bundle) => ({ ...bundle,
            requiresRestart: toggled.has(bundle.name)
                || initialInstalled[bundle.name] !== installed[bundle.name]
                || [...jobs.values()].some((job) => job.profileDirectory === resolve(profileDir(config.profile, config.profileDirectory)) && job.requiresRestart
                    && (job.fullName === bundle.name || job.provenance?.packageName === bundle.name)),
        }))) ?? {};
    };
    const disposers = [
        registerRoute({
            kind: "exact", path: "/dsh-top100/restart",
            async handler(request, response) {
                if (request.method !== "POST" || !trustedRestartRequest(request)) {
                    sendJson(response, 403, { error: "same-origin loopback POST required" });
                    return;
                }
                if (!host.restartCapability?.().available) {
                    sendJson(response, 403, { error: "restart unavailable" });
                    return;
                }
                if (restartPending || activeMutations > 0 || progress.active || [...jobs.values()].some((job) => !TERMINAL_PHASES.includes(job.phase))) {
                    sendJson(response, 409, { error: "wait for plugin operations to finish" });
                    return;
                }
                restartPending = true;
                try {
                    const handoff = await prepareRestart(request.socket.localPort ?? 0);
                    response.once("finish", () => { void Promise.resolve(handoff.commit()).catch(() => { restartPending = false; }); });
                    response.once("close", () => { if (!response.writableFinished) {
                        handoff.cancel();
                        restartPending = false;
                    } });
                    sendJson(response, 202, { ok: true, bootId: BOOT_ID });
                }
                catch {
                    restartPending = false;
                    sendJson(response, 503, { error: "restart helper could not start; DSH is still running" });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/status",
            handler(request, response) {
                let receipt;
                try {
                    const submissionId = queryOf(request).get("submissionId");
                    if (submissionId !== null)
                        receipt = submissions.get(submissionKey(config, submissionId));
                }
                catch (error) {
                    sendJson(response, submissionErrorStatus(error), { error: error.message });
                    return;
                }
                sendJson(response, 200, {
                    ok: true,
                    bootId: BOOT_ID,
                    restart: restartStatus(request),
                    restartPending,
                    restartRequired: toggled.size > 0 || !isDeepStrictEqual(initialInstalled, readInstalled(config.profile, config.profileDirectory))
                        || [...jobs.values()].some((job) => job.profile === config.profile && job.requiresRestart),
                    name: "dsh-top100",
                    version: pluginVersion(),
                    dataUrl: config.dataUrl,
                    profile: config.profile,
                    progress,
                    activeBatches: activeBatchSnapshots(config.profile),
                    submission: receipt?.batchId ? batchSnapshot(receipt.batchId) : null,
                    submissionCancelled: receipt?.cancelled ?? false,
                    activeJobs: [...jobs.values()]
                        .filter((job) => job.profile === config.profile && !TERMINAL_PHASES.includes(job.phase))
                        .map(publicJob),
                });
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/progress",
            handler(_request, response) {
                sendJson(response, 200, progress);
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/installed",
            handler(_request, response) {
                sendJson(response, 200, { installed: readInstalled(config.profile, config.profileDirectory) });
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/rankings",
            async handler(request, response) {
                if (request.method !== "GET") {
                    sendJson(response, 405, { error: "method not allowed" });
                    return;
                }
                const query = queryOf(request);
                const requestedView = query.get("view");
                const view = isRankingView(requestedView) ? requestedView : "hot";
                const requestedCategory = query.get("category");
                const category = isPluginCategoryId(requestedCategory) ? requestedCategory : null;
                const q = (query.get("q") ?? "").trim();
                const requestedCatalogScope = query.get("catalogScope");
                const catalogScope = isCatalogScope(requestedCatalogScope) ? requestedCatalogScope : "plugins";
                const requestedInstallAvailability = query.get("installAvailability");
                const installAvailability = isInstallAvailability(requestedInstallAvailability)
                    ? requestedInstallAvailability
                    : "all";
                const excludeSkills = catalogScope !== "skills";
                const compatibleOnly = catalogScope !== "ecosystem";
                const offset = Math.max(0, Number(query.get("offset") ?? 0) || 0);
                const limit = Math.min(100, Math.max(1, Number(query.get("limit") ?? 40) || 40));
                try {
                    const dataUrl = config.dataUrl || DEFAULT_DATA_URL;
                    const usesViewShard = catalogScope === "plugins" && q === "" && (view === "hot" || view === "rising");
                    const documentRequest = catalogScope === "skills"
                        ? loadSkillRankings(dataUrl)
                        : usesViewShard
                            ? loadRankingView(dataUrl, view)
                            : loadSearchRankings(dataUrl);
                    const [document, metadata] = await Promise.all([
                        documentRequest,
                        loadCatalogMetadata(dataUrl),
                    ]);
                    const installed = readInstalled(config.profile, config.profileDirectory);
                    const installedEvidence = Object.fromEntries(Object.keys(installed).map((name) => {
                        let provenance = null;
                        try {
                            provenance = readBundleProvenance(name, config.profile, config.profileDirectory);
                        }
                        catch { /* Unreadable historical evidence must not imply an installed catalog identity. */ }
                        return [name, { manifest: readInstalledManifest(config.profile, name, config.profileDirectory), provenance }];
                    }));
                    const filterOptions = {
                        profile: config.profile,
                        view,
                        category,
                        query: q,
                        offset,
                        limit,
                        installed,
                        installedEvidence,
                        excludeSkills,
                        compatibleOnly,
                        catalogScope,
                        installAvailability,
                    };
                    const { total, excludedSkillCount, items } = filterCatalog(document, filterOptions);
                    // Count the complete view/search and availability scope before category
                    // selection or pagination, so other categories remain useful targets.
                    const categoryEntries = filterCatalog(document, {
                        ...filterOptions, category: null, offset: 0, limit: Number.MAX_SAFE_INTEGER,
                    }).items;
                    const categories = filteredCatalogCategories({
                        ...document, rankings: { ...document.rankings, total: categoryEntries },
                    }, { excludeSkills, compatibleOnly, catalogScope });
                    const cache = await catalogCacheStatus(dataUrl, catalogScope === "skills" ? "skill-directory" : usesViewShard ? "view-shard" : "search-index", usesViewShard ? view : undefined);
                    sendJson(response, 200, {
                        view,
                        category,
                        categories,
                        generatedAt: document.generatedAt,
                        snapshotDate: document.snapshotDate,
                        dataUrl: normalizeDataUrl(config.dataUrl || DEFAULT_DATA_URL),
                        query: q,
                        catalogScope,
                        installAvailability,
                        scopeCounts: metadata.scopeCounts,
                        excludeSkills,
                        compatibleOnly,
                        cache,
                        total,
                        excludedSkillCount,
                        offset,
                        limit,
                        items: items.map((item) => {
                            const totalRank = item.totalRank ?? (!usesViewShard ? item.rank : undefined);
                            return document.snapshotId && catalogScope !== "skills" && Number.isSafeInteger(totalRank) && totalRank > 0
                                ? { ...item, installLocator: { snapshotId: document.snapshotId, totalRank } }
                                : item;
                        }),
                    });
                }
                catch (error) {
                    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/install-preflight",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                const controller = new AbortController();
                const onClose = () => { if (!response.writableEnded)
                    controller.abort(); };
                response.on("close", onClose);
                let stage = "catalog";
                try {
                    const body = readBodyRecord(await readJsonBody(request));
                    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
                    if (!FULL_NAME_RE.test(fullName)) {
                        sendJson(response, 400, { error: "fullName must be owner/repo" });
                        return;
                    }
                    let locator;
                    if (body.installLocator !== undefined) {
                        const value = readBodyRecord(body.installLocator);
                        if (typeof value.snapshotId !== "string" || value.snapshotId.length > 200
                            || typeof value.totalRank !== "number" || !Number.isSafeInteger(value.totalRank) || value.totalRank < 1) {
                            sendJson(response, 400, { error: "安装目录定位信息无效，请刷新列表后重试", code: "invalid-locator", stage });
                            return;
                        }
                        locator = { snapshotId: value.snapshotId, totalRank: value.totalRank };
                    }
                    const entry = await findPublishedEntry(config.dataUrl || DEFAULT_DATA_URL, fullName, true, locator, controller.signal);
                    controller.signal.throwIfAborted();
                    if (!entry) {
                        sendJson(response, 404, { error: "plugin is not in the current published catalog", code: "catalog-changed", stage });
                        return;
                    }
                    stage = "source";
                    const approval = await createInstallPreflight(entry, config.profile, controller.signal);
                    controller.signal.throwIfAborted();
                    sendJson(response, 200, approval.preflight);
                }
                catch (error) {
                    if (controller.signal.aborted)
                        return;
                    const detail = error instanceof Error ? error.message : String(error);
                    const code = error instanceof CatalogLookupError ? error.code
                        : /timeout|timed out|超时/i.test(detail) ? "timeout"
                            : /fetch failed|network|网络|ECONN|ENOTFOUND/i.test(detail) ? "network"
                                : /完整性|不受信任|不匹配|不一致/.test(detail) ? "verification"
                                    : "preflight-failed";
                    const prefix = stage === "catalog" ? "读取安装目录失败" : "核对安装来源失败";
                    sendJson(response, error instanceof CatalogLookupError ? 409 : 422, {
                        error: `${prefix}：${detail}`, code, stage,
                    });
                }
                finally {
                    response.off("close", onClose);
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/catalog-entry",
            async handler(request, response) {
                if (request.method !== "GET") {
                    sendJson(response, 405, { error: "method not allowed" });
                    return;
                }
                const fullName = (queryOf(request).get("fullName") ?? "").trim();
                if (!FULL_NAME_RE.test(fullName)) {
                    sendJson(response, 400, { error: "fullName must be owner/repo" });
                    return;
                }
                try {
                    const entry = await findPublishedEntry(config.dataUrl || DEFAULT_DATA_URL, fullName, false);
                    sendJson(response, entry ? 200 : 404, entry ? { item: entry } : { error: "catalog entry not found" });
                }
                catch (error) {
                    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/install-jobs",
            handler(request, response) {
                if (request.method !== "GET") {
                    sendJson(response, 405, { error: "method not allowed" });
                    return;
                }
                const batchId = queryOf(request).get("batchId") ?? "";
                const candidate = batchSnapshot(batchId);
                const snapshot = candidate?.jobs.some((job) => job.profile === config.profile) ? candidate : null;
                sendJson(response, snapshot ? 200 : 404, snapshot ?? { error: "batch not found" });
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/cancel-submission",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request));
                    const key = submissionKey(config, body.submissionId);
                    const previous = submissions.get(key);
                    // This tombstone is written synchronously, before any late POST can
                    // validate its approvals and create a batch in this host process.
                    submissions.set(key, { fingerprint: previous?.fingerprint ?? null, batchId: previous?.batchId ?? null, cancelled: true });
                    const batch = previous?.batchId ? batches.get(previous.batchId) : null;
                    for (const jobId of batch?.jobIds ?? [])
                        cancelJob(jobId, commandRuntime);
                    sendJson(response, 200, { cancelled: true, submission: previous?.batchId ? batchSnapshot(previous.batchId) : null });
                }
                catch (error) {
                    sendJson(response, submissionErrorStatus(error), { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/cancel",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request));
                    const jobId = typeof body.jobId === "string" && body.jobId
                        ? body.jobId : activeProfileJobs.get(config.profile);
                    sendJson(response, 200, {
                        cancelled: Boolean(jobId && jobs.get(jobId)?.profile === config.profile && cancelJob(jobId, commandRuntime)),
                    });
                }
                catch (error) {
                    sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/install-batch",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request, MAX_BATCH_BODY_BYTES));
                    const submission = prepareSubmission(config, "/dsh-top100/install-batch", body);
                    if (submission?.replay) {
                        sendJson(response, 202, submission.replay);
                        return;
                    }
                    const requested = Array.isArray(body.approvals) ? body.approvals : [];
                    const references = requested.map((value) => {
                        if (value === null || typeof value !== "object" || Array.isArray(value))
                            throw new Error("invalid install approval");
                        const record = value;
                        const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
                        const approvalToken = typeof record.approvalToken === "string" ? record.approvalToken.trim() : "";
                        const risksAccepted = record.risksAccepted === true;
                        if (!fullName || !approvalToken)
                            throw new Error("invalid install approval");
                        return { fullName, approvalToken, risksAccepted };
                    });
                    if (references.length === 0 || references.length > MAX_BATCH_SIZE || references.some(({ fullName }) => !FULL_NAME_RE.test(fullName))) {
                        sendJson(response, 400, { error: `approvals must contain 1-${MAX_BATCH_SIZE} preflight tokens` });
                        return;
                    }
                    const approvals = validateInstallApprovals(references, config.profile);
                    acceptedSubmission(response, submission, createBatch(approvals, config, commandRuntime));
                }
                catch (error) {
                    sendJson(response, submissionErrorStatus(error), { error: error instanceof Error ? error.message : "invalid json" });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/retry",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request));
                    const submission = prepareSubmission(config, "/dsh-top100/retry", body);
                    if (submission?.replay) {
                        sendJson(response, 202, submission.replay);
                        return;
                    }
                    const previous = typeof body.jobId === "string" ? jobs.get(body.jobId) : null;
                    if (!previous || previous.profile !== config.profile || !["failed", "cancelled"].includes(previous.phase)) {
                        sendJson(response, 409, { error: "only failed or cancelled jobs can be retried" });
                        return;
                    }
                    if (previous.action === "uninstall") {
                        acceptedSubmission(response, submission, createManageJobs(config, previous.action, [{
                                name: previous.fullName,
                                kind: previous.kind === "skill" ? "skill" : "bundle",
                            }], commandRuntime));
                        return;
                    }
                    sendJson(response, 409, { error: "install/update retry requires a new preflight and risk confirmation" });
                }
                catch (error) {
                    sendJson(response, submissionErrorStatus(error), { error: error instanceof Error ? error.message : "invalid json" });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/cancel-all",
            handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                let cancelled = 0;
                for (const job of jobs.values()) {
                    if (job.profile === config.profile && cancelJob(job.id, commandRuntime))
                        cancelled += 1;
                }
                sendJson(response, 200, { cancelled });
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/managed",
            async handler(request, response) {
                if (request.method !== "GET") {
                    sendJson(response, 405, { error: "method not allowed" });
                    return;
                }
                const q = (queryOf(request).get("q") ?? "").trim().toLowerCase();
                try {
                    const dataUrl = config.dataUrl || DEFAULT_DATA_URL;
                    const document = await loadCachedRankings(dataUrl);
                    // Populate or refresh the full catalog for later searches without delaying local management.
                    void safeLoad(config).catch(() => undefined);
                    const items = (await listManagedPlugins(config.profile, document, config.profileDirectory, queryOf(request).get("refresh") === "1")).map((item) => {
                        if (item.kind !== "skill")
                            return { ...item, scope: "profile" };
                        try {
                            const evidence = readSkillProvenance(item.name, config.profile, config.profileDirectory);
                            const inspected = inspectSkill(item.name, evidence ?? undefined);
                            return { ...item, scope: "global", modificationState: inspected.modificationState };
                        }
                        catch {
                            return { ...item, scope: "global", modificationState: "unknown" };
                        }
                    }).filter((item) => {
                        return !q || `${item.name} ${item.description} ${item.descriptionZh} ${item.fullName ?? ""}`.toLowerCase().includes(q);
                    });
                    const runtime = observeRuntime(items.filter((item) => item.kind === "bundle").map((item) => {
                        let entryIds;
                        try {
                            entryIds = rowIdsForPackage(config.profile, item.name, config.profileDirectory);
                        }
                        catch { /* Observer falls back to module names. */ }
                        return { name: item.name, enabled: item.enabled, entryIds };
                    }));
                    for (const item of items) {
                        const status = runtime[item.name];
                        if (!status || item.kind !== "bundle")
                            continue;
                        item.runtime = status;
                        item.activationState = status.state === "loaded" ? "live" : status.state === "restart-required" ? "restart-required"
                            : status.state === "failed" || status.state === "missing-services" ? "broken" : status.state === "inactive" ? "inert" : "unknown";
                    }
                    sendJson(response, 200, { profile: config.profile, query: q, total: items.length, items, sourceMigrationRequired: hasLegacyTagSources(config) });
                }
                catch (error) {
                    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/toggle",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request));
                    const name = typeof body.name === "string" ? body.name.trim() : "";
                    const enabled = body.enabled === true;
                    if (!name) {
                        sendJson(response, 400, { error: "name is required" });
                        return;
                    }
                    if (readInstalled(config.profile, config.profileDirectory)[name] === undefined) {
                        sendJson(response, 404, { error: "plugin is not installed" });
                        return;
                    }
                    const result = setPackageEnabled(config.profile, name, enabled, config.profileDirectory);
                    if (result.ok)
                        toggled.add(name);
                    sendJson(response, result.ok ? 200 : 400, { ok: result.ok, name, enabled, rows: result.rows, error: result.reason, requiresRestart: result.ok });
                }
                catch (error) {
                    sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/source-migration",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request));
                    if (body.action === "preflight") {
                        sendJson(response, 200, preflightSourceMigration(config.profile, config.profileDirectory));
                        return;
                    }
                    if (body.action !== "apply" || typeof body.approvalToken !== "string" || !body.approvalToken) {
                        sendJson(response, 400, { error: "valid action and approvalToken are required" });
                        return;
                    }
                    if ([...jobs.values()].some((job) => job.profile === config.profile && !TERMINAL_PHASES.includes(job.phase))) {
                        sendJson(response, 409, { error: "当前 Profile 有安装任务，请等待完成后重新确认迁移" });
                        return;
                    }
                    // Applying is synchronous, so a queued package operation cannot interleave file writes.
                    sendJson(response, 200, applySourceMigration(body.approvalToken, config.profile, config.profileDirectory));
                }
                catch (error) {
                    sendJson(response, 422, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/update-preflight-session",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request, MAX_BATCH_BODY_BYTES));
                    if (body.action === "start") {
                        sendJson(response, 200, startUpdatePreflightSession(config.profile, config.profileDirectory));
                        return;
                    }
                    if (typeof body.sessionToken !== "string" || !body.sessionToken || !["finalize", "cancel"].includes(String(body.action))) {
                        sendJson(response, 400, { error: "valid action and sessionToken are required" });
                        return;
                    }
                    if (body.action === "cancel") {
                        discardUpdatePreflightSession(body.sessionToken, config.profile, config.profileDirectory);
                        sendJson(response, 200, { cancelled: true });
                    }
                    else {
                        sendJson(response, 200, { items: finalizeUpdatePreflightSession(body.sessionToken, config.profile, config.profileDirectory) });
                    }
                }
                catch (error) {
                    sendJson(response, 422, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/update-preflight",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                const controller = new AbortController();
                const onClose = () => { if (!response.writableEnded)
                    controller.abort(); };
                response.on("close", onClose);
                const issuedTokens = [];
                let delivered = false;
                try {
                    const body = readBodyRecord(await readJsonBody(request, MAX_BATCH_BODY_BYTES));
                    const names = body.names;
                    assertFixedDependencySources(config);
                    const strategy = body.strategy ?? "preserve";
                    if (strategy !== "preserve" && strategy !== "latest") {
                        sendJson(response, 400, { error: "invalid update strategy" });
                        return;
                    }
                    if (body.sessionToken !== undefined && (typeof body.sessionToken !== "string" || !body.sessionToken)) {
                        sendJson(response, 400, { error: "invalid update session" });
                        return;
                    }
                    if (!Array.isArray(names) || names.length === 0 || names.length > MAX_BATCH_SIZE
                        || names.some((name) => typeof name !== "string" || !name.trim() || name.trim().length > 214)
                        || new Set(names.map((name) => name.trim())).size !== names.length) {
                        sendJson(response, 400, { error: `需要 1-${MAX_BATCH_SIZE} 个不重复的插件名称` });
                        return;
                    }
                    const items = [];
                    const issues = [];
                    for (const name of names) {
                        controller.signal.throwIfAborted();
                        try {
                            const approval = await createUpdatePreflight(name.trim(), config.profile, config.profileDirectory, controller.signal, strategy, body.sessionToken);
                            issuedTokens.push(approval.preflight.approvalToken);
                            items.push({ name: approval.name, currentVersion: approval.currentVersion, preflight: approval.preflight });
                        }
                        catch (error) {
                            controller.signal.throwIfAborted();
                            if (body.partial !== true)
                                throw error;
                            issues.push({ name: name.trim(), status: error instanceof UpdateNotAvailableError ? "current" : "failed",
                                message: error instanceof Error ? error.message : String(error),
                                ...(error instanceof Error && "code" in error && typeof error.code === "string" ? { code: error.code } : {}),
                            });
                        }
                    }
                    controller.signal.throwIfAborted();
                    sendJson(response, 200, { items, ...(body.partial === true ? { issues } : {}) });
                    delivered = true;
                }
                catch (error) {
                    if (!controller.signal.aborted)
                        sendJson(response, 422, {
                            error: error instanceof Error ? error.message : String(error),
                            ...(error instanceof Error && "code" in error && typeof error.code === "string" ? { code: error.code } : {}),
                        });
                }
                finally {
                    response.off("close", onClose);
                    if (!delivered)
                        discardUpdateApprovals(issuedTokens);
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/manage",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                try {
                    const body = readBodyRecord(await readJsonBody(request, MAX_UPDATE_BODY_BYTES));
                    const submission = prepareSubmission(config, "/dsh-top100/manage", body);
                    if (submission?.replay) {
                        sendJson(response, 202, submission.replay);
                        return;
                    }
                    const action = body.action === "update" || body.action === "uninstall" ? body.action : null;
                    const maximum = action === "update" ? MAX_UPDATE_BATCH_SIZE : MAX_BATCH_SIZE;
                    if (action !== "update" && Buffer.byteLength(JSON.stringify(body)) > MAX_BATCH_BODY_BYTES)
                        throw new Error("request body too large");
                    const names = Array.isArray(body.names)
                        ? body.names.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean)
                        : typeof body.name === "string" && body.name.trim() ? [body.name.trim()] : [];
                    const unique = [...new Set(names)];
                    const kind = body.kind === "skill" ? "skill" : "bundle";
                    const forceUnreadablePatch = body.force === true;
                    if (!action || unique.length === 0 || unique.length > maximum
                        || (Array.isArray(body.names) && (body.names.length > maximum || body.names.some((name) => typeof name !== "string" || !name.trim())))
                        || (kind === "bundle" && unique.some((name) => name.length > 214))) {
                        sendJson(response, 400, { error: `action and 1-${maximum} names are required` });
                        return;
                    }
                    if (kind === "skill" && action !== "uninstall") {
                        sendJson(response, 400, { error: "Skill 不支持从排行页更新" });
                        return;
                    }
                    if (kind === "bundle") {
                        const installed = readInstalled(config.profile, config.profileDirectory);
                        for (const name of unique) {
                            const spec = installed[name];
                            if (spec === undefined) {
                                sendJson(response, 404, { error: "plugin is not installed" });
                                return;
                            }
                            if (isProtectedPackage(name)) {
                                sendJson(response, 403, { error: "该插件属于宿主或本排行插件，不能在这里管理" });
                                return;
                            }
                            if (action === "uninstall") {
                                const references = userPatchPackageReferences(userPatchPath(config.profile, config.profileDirectory), name);
                                if (references === null && !forceUnreadablePatch) {
                                    sendJson(response, 409, { error: "无法安全检查 cordis.patch.yml，已停止卸载；确认补丁无关后可强制重试", userPatchInspectionFailed: true, forceable: true });
                                    return;
                                }
                                if (references !== null && references.length > 0) {
                                    sendJson(response, 409, { error: `cordis.patch.yml 仍通过 insert 引用 ${references.join("、")}`, userPatchReferenced: true, patchReferences: references });
                                    return;
                                }
                            }
                        }
                    }
                    let updateApprovals = [];
                    if (action === "update") {
                        if (!Array.isArray(body.approvals) || body.approvals.length !== unique.length) {
                            sendJson(response, 409, { error: "更新需要重新预检并确认精确来源" });
                            return;
                        }
                        const approvals = body.approvals.map((value) => {
                            const record = readBodyRecord(value);
                            return {
                                name: typeof record.name === "string" ? record.name : "",
                                approvalToken: typeof record.approvalToken === "string" ? record.approvalToken : "",
                                risksAccepted: record.risksAccepted === true,
                            };
                        });
                        if (new Set(approvals.map((item) => item.name)).size !== unique.length
                            || approvals.some((item) => !unique.includes(item.name))) {
                            sendJson(response, 409, { error: "更新确认与所选插件不一致" });
                            return;
                        }
                        try {
                            updateApprovals = validateUpdateApprovals(approvals, config.profile, config.profileDirectory);
                        }
                        catch (error) {
                            sendJson(response, 409, { error: error instanceof Error ? error.message : String(error) });
                            return;
                        }
                    }
                    acceptedSubmission(response, submission, createManageJobs(config, action, unique.map((name) => ({ name, kind, updateApproval: updateApprovals.find((approval) => approval.name === name) })), commandRuntime, forceUnreadablePatch));
                }
                catch (error) {
                    sendJson(response, submissionErrorStatus(error), { error: error instanceof Error ? error.message : "invalid json" });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/diagnose",
            async handler(request, response) {
                if (request.method !== "GET") {
                    sendJson(response, 405, { error: "method not allowed" });
                    return;
                }
                try {
                    sendJson(response, 200, await buildDiagnosticReport(config.profile, { dataUrl: config.dataUrl || DEFAULT_DATA_URL, profileDir: config.profileDirectory, readRuntime: observeRuntime }));
                }
                catch (error) {
                    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
        registerRoute({
            kind: "exact",
            path: "/dsh-top100/install",
            async handler(request, response) {
                if (request.method !== "POST" || !sameOrigin(request)) {
                    sendJson(response, 403, { error: "same-origin POST required" });
                    return;
                }
                let body;
                try {
                    body = await readJsonBody(request);
                }
                catch (error) {
                    sendJson(response, 400, { error: error instanceof Error ? error.message : "invalid json" });
                    return;
                }
                const record = readBodyRecord(body);
                const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
                const approvalToken = typeof record.approvalToken === "string" ? record.approvalToken.trim() : "";
                const risksAccepted = record.risksAccepted === true;
                if (!FULL_NAME_RE.test(fullName)) {
                    sendJson(response, 400, { error: "fullName must be owner/repo" });
                    return;
                }
                if (!approvalToken) {
                    sendJson(response, 409, { error: "install preflight approval is required" });
                    return;
                }
                try {
                    const submission = prepareSubmission(config, "/dsh-top100/install", record);
                    if (submission?.replay) {
                        sendJson(response, 202, { ok: true, ...submission.replay });
                        return;
                    }
                    const approval = consumeInstallApproval(approvalToken, fullName, config.profile, risksAccepted);
                    const snapshot = createBatch([approval], config, commandRuntime);
                    acceptedSubmission(response, submission, { ok: true, ...snapshot });
                }
                catch (error) {
                    sendJson(response, submissionErrorStatus(error, 502), { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),
    ];
    return () => {
        for (const dispose of disposers)
            dispose();
    };
}
