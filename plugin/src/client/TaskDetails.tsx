import type { InstallJobSnapshot } from "../shared/types.js";
import type { Translate } from "./locales.js";
import { dependencyProgress, installStatus, presentInstallError, taskPhaseKey, type InstallErrorKind } from "./install-presentation.js";

const ERROR_LOCALE_KEYS: Record<InstallErrorKind, string> = {
  "ignored-builds": "ignoredBuilds",
  peer: "peer",
  build: "build",
  policy: "policy",
  network: "network",
  timeout: "timeout",
  permission: "permission",
  lockfile: "lockfile",
  profile: "profile",
  source: "source",
  generic: "generic",
};

// These host summaries repeat the structured result. Keep all other output,
// including cleanup warnings and Skill backup paths, available in details.
const ROUTINE_COMPLETION_LINES = new Set([
  "已卸载，重启后确认运行状态",
  "卸载已完成，并清理了残留配置",
  "更新完成，已记录精确来源；重启后验证运行状态",
  "已写入且配置可组合；完成作者要求的配置并重启 DSH 后再验证",
  "已写入且配置可组合；重启 DSH 后再验证实际运行状态",
  "Skill 已复制并记录来源；完成作者要求的配置后，在后续 Agent 会话中验证可见性",
  "全局 Skill 已复制并记录来源；将在后续 Agent 会话中验证可见性",
]);
const normalizedText = (value: string) => value.replace(/[\s。.!！]+/g, "").toLowerCase();

export function taskResultText(job: InstallJobSnapshot, t: Translate, includeIdentity = true): string {
  const parts = includeIdentity ? [`${job.fullName} · ${t(taskPhaseKey(job))}`] : [];
  if (job.phase === "installed" && job.activationState !== "broken") {
    if (job.activationState === "configuration-required") parts.push(t("taskCheckConfiguration"));
    if (!job.requiresRestart && job.action !== "uninstall" && job.activationState !== "configuration-required") parts.push(t(`activation_${job.activationState}`));
    if (job.requiresRestart) parts.push(t(job.action === "uninstall" ? "taskUninstallRestart" : job.action === "update" ? "taskUpdateRestart" : "taskInstallRestart"));
  }
  if (job.recovery) parts.push(t(job.recovery === "restored" ? "taskRestored" : "taskRecoveryFailed"));
  return parts.join(" ");
}

/** Shared by the task dialog and Installed page, including mutation failures. */
export function TaskDetails({ job, t, headingPresent = false }: { job: InstallJobSnapshot; t: Translate; headingPresent?: boolean }) {
  const terminal = ["installed", "failed", "cancelled"].includes(job.phase);
  const counters = !terminal ? dependencyProgress(job.lastLine ?? "") : null;
  const error = job.phase === "failed" ? presentInstallError(job.error ?? job.lastLine) : null;
  const errorKey = error ? ERROR_LOCALE_KEYS[error.kind] : null;
  const statusKey = installStatus(job).key;
  const heading = headingPresent ? t(taskPhaseKey(job)) : "";
  const rawProgress = !terminal && !counters && job.lastLine && normalizedText(job.lastLine) !== normalizedText(heading) ? job.lastLine : "";
  const statusText = terminal ? taskResultText(job, t, !headingPresent)
    : rawProgress && statusKey !== "taskNetworkRetry" ? ""
    : normalizedText(t(statusKey)) === normalizedText(heading) ? "" : t(statusKey);
  const log = job.error || job.lastLine;
  const duplicateLog = job.phase === "installed" && job.activationState !== "broken" && !job.error
    && (ROUTINE_COMPLETION_LINES.has(log?.trim() ?? "") || normalizedText(log ?? "") === normalizedText(statusText));
  return <div className="task-details">
    {statusText ? <p className="job-status">{statusText}</p> : null}
    {counters ? <p className="job-status">{(["resolved", "reused", "downloaded", "added"] as const)
      .filter((key) => counters[key] !== undefined)
      .map((key) => `${t(`task${key[0].toUpperCase()}${key.slice(1)}`)} ${counters[key]}`).join(" · ")}</p> : null}
    {rawProgress && normalizedText(rawProgress) !== normalizedText(statusText) ? <p className="job-status" style={{ overflowWrap: "anywhere" }}>{rawProgress}</p> : null}
    {error && errorKey ? <div className="job-error-message" role="alert">
      <strong>{t(`installError_${errorKey}_title`)}</strong>
      {job.action === "uninstall" ? null : <p>{t(`installError_${errorKey}_summary`)}</p>}
      {error.packages.length ? <p className="job-error-packages"><span>{t("installErrorPackages")}</span><code>{error.packages.join(", ")}</code></p> : null}
      {job.profileDirectory ? <p className="job-error-packages"><span>{t("taskProfileDirectory")}</span><code>{job.profileDirectory}</code></p> : null}
      <p className="job-error-hint"><span>{t("installErrorNext")}</span>{t(`installError_${errorKey}_hint`)}</p>
      {error.kind === "ignored-builds" ? <p><a href="https://github.com/evaldock/dsh-top100/blob/main/docs/build-approval-recovery.md" target="_blank" rel="noopener noreferrer">{t("buildRecoveryGuide")}</a></p> : null}
    </div> : null}
    {terminal && log && !duplicateLog ? <details className="job-error-details"><summary>{t("taskLogs")}</summary><pre>{log}</pre></details> : null}
  </div>;
}
