/** Resolve immutable install evidence before the user is asked to approve a profile change. */
import { evaluateHostCompatibility } from "./host-compatibility.js";
import { randomUUID } from "node:crypto";
import { resolveInstallSpec } from "../install/install-spec.js";
import { verifyInstallSpec } from "../install/install-verify.js";
import { verifySkillSource } from "../install/skill-install.js";
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const approvals = new Map();
function removeExpiredApprovals(now = Date.now()) {
    for (const [token, approval] of approvals) {
        if (approval.preflight.expiresAt <= now)
            approvals.delete(token);
    }
}
function bundleProvenance(value) {
    return {
        source: value.source,
        requestedTarget: value.requestedTarget,
        resolvedTarget: value.target,
        packageName: value.packageName,
        version: value.version,
        commit: value.commit,
        integrity: value.integrity,
        repositoryUrl: value.repositoryUrl,
        repositoryIdentity: value.repositoryIdentity,
        verifiedAt: value.verifiedAt,
    };
}
function bundleRisks(value) {
    const risks = [];
    if (value.lifecycleScripts.length > 0) {
        risks.push({
            code: "lifecycle-scripts",
            severity: "warning",
            summary: "安装会执行包生命周期脚本",
            detail: value.lifecycleScripts.map((script) => `${script.name}: ${script.command}`).join("\n"),
        });
    }
    if (value.repositoryIdentity === "unavailable") {
        risks.push({
            code: "repository-identity",
            severity: "warning",
            summary: "npm 包未能与目录仓库自动绑定",
            detail: "包未声明可识别的 GitHub repository；精确版本已锁定，但发布者身份仍需人工判断。",
        });
    }
    risks.push({
        code: "restart-required",
        severity: "info",
        summary: "写入成功后仍需重启并验证运行状态",
        detail: "安装后的配置检查只证明 Profile 可以组合，不代表插件已经在当前 DSH 进程中运行。",
    });
    return risks;
}
/** Shared evidence presentation; approval storage remains owned by each operation. */
export function bundleInstallPreflight(bundleTarget, options) {
    const risks = bundleRisks(bundleTarget);
    return {
        approvalToken: options.approvalToken,
        expiresAt: options.expiresAt,
        fullName: options.fullName,
        profile: options.profile,
        kind: "bundle",
        provenance: bundleProvenance(bundleTarget),
        hostCompatibility: evaluateHostCompatibility(bundleTarget.dshPeers),
        lifecycleScripts: bundleTarget.lifecycleScripts,
        risks,
        requiresExplicitApproval: risks.some((risk) => risk.severity === "warning"),
        activationExpectation: options.needsConfig ? "configuration-required" : "restart-required",
    };
}
export async function createInstallPreflight(entry, profile, signal) {
    signal?.throwIfAborted();
    removeExpiredApprovals();
    const spec = resolveInstallSpec(entry, profile);
    if (!spec)
        throw new Error("this catalog entry has no trusted DSH install source");
    const approvalToken = randomUUID();
    const expiresAt = Date.now() + APPROVAL_TTL_MS;
    if (entry.type?.toLowerCase() === "skill") {
        const skillSource = await verifySkillSource(entry.fullName, signal);
        const provenance = {
            source: "github",
            requestedTarget: `github:${entry.fullName}`,
            resolvedTarget: `github:${entry.fullName}#${skillSource.commit}`,
            packageName: null,
            version: null,
            commit: skillSource.commit,
            integrity: `git-sha1-${skillSource.commit}`,
            repositoryUrl: skillSource.repositoryUrl,
            repositoryIdentity: "matched",
            verifiedAt: skillSource.verifiedAt,
        };
        const preflight = {
            approvalToken,
            expiresAt,
            fullName: entry.fullName,
            profile,
            kind: "skill",
            provenance,
            lifecycleScripts: [],
            risks: [{
                    code: "skill-content",
                    severity: "warning",
                    summary: "Skill 是会影响模型行为的主动内容",
                    detail: "将复制该 commit 的内容到所有 Profile 共用的全局 Skills。若同名内容变化，会先完整备份原目录与本地修改到 DSH_HOME/skill-backups，再替换；失败时尝试恢复。安装器拒绝符号链接，结构验证不等于安全审核。",
                }],
            requiresExplicitApproval: true,
            activationExpectation: entry.install?.needsConfig ? "configuration-required" : "not-applicable",
        };
        const approved = { entry, preflight, bundleTarget: null, skillSource };
        signal?.throwIfAborted();
        approvals.set(approvalToken, approved);
        return approved;
    }
    const bundleTarget = await verifyInstallSpec(spec, {
        signal,
        expectedRepository: entry.fullName,
        expectedPackageName: entry.install?.packageName,
        expectedRepositoryPath: entry.install?.repositoryPath,
    });
    const preflight = bundleInstallPreflight(bundleTarget, {
        approvalToken,
        expiresAt,
        fullName: entry.fullName,
        profile,
        needsConfig: entry.install?.needsConfig,
    });
    const approved = { entry, preflight, bundleTarget, skillSource: null };
    signal?.throwIfAborted();
    approvals.set(approvalToken, approved);
    return approved;
}
/** Validate the whole batch before consuming any approval, so failure is retryable. */
export function validateInstallApprovals(requests, profile) {
    removeExpiredApprovals();
    if (requests.length === 0)
        throw new Error("请选择需要安装的插件");
    const fullNames = new Set();
    const tokens = new Set();
    const result = requests.map((request) => {
        if (fullNames.has(request.fullName.toLowerCase()) || tokens.has(request.approvalToken)) {
            throw new Error("安装列表包含重复的插件或确认令牌");
        }
        fullNames.add(request.fullName.toLowerCase());
        tokens.add(request.approvalToken);
        const approval = approvals.get(request.approvalToken);
        if (!approval)
            throw new Error("安装确认已过期，请重新检查精确来源与风险");
        if (approval.preflight.fullName !== request.fullName || approval.preflight.profile !== profile) {
            throw new Error("安装确认与当前插件或 Profile 不匹配");
        }
        if (approval.preflight.requiresExplicitApproval && request.risksAccepted !== true) {
            throw new Error("该安装包含警告项，需要明确确认来源、脚本与风险");
        }
        return approval;
    });
    for (const approval of result)
        approvals.delete(approval.preflight.approvalToken);
    return result;
}
export function consumeInstallApproval(token, fullName, profile, risksAccepted = false) {
    return validateInstallApprovals([{ approvalToken: token, fullName, risksAccepted }], profile)[0];
}
export function clearInstallApprovals() {
    approvals.clear();
}
