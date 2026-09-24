import type { DiagnosticFinding, DiagnosticReport } from "../shared/types.js";
import type { DiagnosticLanguage } from "./diagnostic-presentation.js";

/** Group actionable findings by owner; informational states never inflate issue counts. */
export function diagnosticView(report: DiagnosticReport) {
  const groups = new Map<string, { subject: string; severity: "error" | "warning"; findings: DiagnosticFinding[] }>();
  const seen = new Set<string>();
  for (const finding of report.findings) {
    if (finding.severity === "info") continue;
    const identity = JSON.stringify([finding.subject, finding.code, finding.parameters, finding.detail]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const group = groups.get(finding.subject) ?? { subject: finding.subject, severity: finding.severity, findings: [] };
    group.findings.push(finding);
    if (finding.severity === "error") group.severity = "error";
    groups.set(finding.subject, group);
  }
  return {
    issues: [...groups.values()].sort((a, b) => Number(b.severity === "error") - Number(a.severity === "error")),
    pending: report.bundles.filter((bundle) => bundle.runtime?.state === "restart-required"),
    unverified: report.bundles.filter((bundle) => bundle.enabled && (!bundle.runtime || ["unknown", "inactive"].includes(bundle.runtime.state))),
    notes: report.findings.filter((finding) => finding.severity === "info" && finding.code !== "runtime-restart-required"),
  };
}

export function diagnosticNextStep(code: string, language: DiagnosticLanguage): string {
  const steps: Record<string, [string, string]> = {
    "profile-missing": ["核对当前 DSH 配置目录是否存在、是否可读取。", "Check that the active DSH profile directory exists and is readable."],
    "catalog-unreachable": ["核对数据源地址和网络连接，再重新检查。", "Check the data source address and network connection, then check again."],
    "catalog-stale": ["确认数据源已更新，再重新检查；无需重装插件。", "Check for a newer data snapshot, then check again. Reinstallation is not needed."],
    "user-patch-invalid": ["备份配置后，按技术详情检查用户补丁的格式；不要直接清空配置。", "Back up the configuration and inspect the user patch syntax. Do not clear the configuration."],
    "bundle-unresolved": ["核对该插件的安装文件及作者要求；从已安装页查看来源和维护方式。", "Check the installed files and author requirements. See the installed item for its source and maintenance options."],
    "runtime-missing-services": ["按作者说明补齐配置或配套插件，再重启验证。", "Complete the required configuration or companion plugins, then restart to verify."],
    "runtime-failed": ["查看日志中的加载错误，修复后再重启验证。", "Inspect the loading error in logs, fix its cause, then restart to verify."],
    "peer-missing": ["按作者说明核对必需依赖，不要直接升级全部插件。", "Check required dependencies against the author's instructions. Do not upgrade all plugins blindly."],
    "peer-mismatch": ["核对插件支持的 DSH 和依赖版本，选择兼容版本后重新检查。", "Check supported DSH and dependency versions, select compatible versions, then check again."],
    "duplicate-entry": ["核对这些插件是否注册了同一入口，先停用不需要的一项再验证。", "Check which plugins register the same entry; disable an unneeded one and verify again."],
    "patch-orphan": ["核对是否卸载或更名过插件，备份后再处理残留的停用项。", "Check for removed or renamed plugins; back up before cleaning obsolete disable entries."],
    "skill-manifest-missing": ["检查技能目录是否完整，按来源说明补齐 SKILL.md。", "Check that the skill directory is complete and restore SKILL.md from its source."],
    "host-core-dependency": ["向插件作者确认核心依赖的声明方式，不要手动删除依赖目录。", "Check core dependency declarations with the plugin author. Do not manually delete dependency directories."],
    "core-multi-version": ["先核对是否确有加载冲突，再按插件要求调整版本；多个版本本身不证明运行故障。", "Check for actual loading conflicts before adjusting versions. Multiple versions alone do not prove a runtime failure."],
  };
  return steps[code]?.[language === "en" ? 1 : 0] ?? (language === "en" ? "Review the technical evidence before changing the configuration." : "先查看检查依据，再决定是否修改配置。");
}
