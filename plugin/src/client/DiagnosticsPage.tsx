import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagnosticFinding, DiagnosticReport } from "../shared/types.js";
import { diagnosticSummary } from "./diagnostic-export.js";
import { diagnosticLabels, presentDiagnosticBundleError, presentDiagnosticFinding, type DiagnosticLanguage } from "./diagnostic-presentation.js";
import { LatestRequest } from "./latest-request.js";
import { diagnosticNextStep, diagnosticView } from "./diagnostic-view.js";
import type { Translate } from "./locales.js";

function TechnicalDetails({ text, language }: { text: string | null; language: DiagnosticLanguage }) {
  return text ? <details><summary>{diagnosticLabels(language).technicalDetails}</summary><pre>{text}</pre></details> : null;
}

function FindingList({ items, report, language }: { items: DiagnosticFinding[]; report: DiagnosticReport; language: DiagnosticLanguage }) {
  return <div className="diag-list">{items.map((item, index) => {
    const presented = presentDiagnosticFinding(item, report, language);
    return <div key={`${item.code}-${item.subject}-${index}`} className={`diag-${item.severity}`}>
      <strong>{item.subject}</strong> — {presented.message}
      <TechnicalDetails text={presented.technicalDetails} language={language} />
    </div>;
  })}</div>;
}

export function DiagnosticsPage({ t, onManage }: { t: Translate; onManage: (name: string) => void }) {
  const language: DiagnosticLanguage = t("descriptionLocale") === "en" ? "en" : "zh";
  const text = (zh: string, en: string) => language === "en" ? en : zh;
  const request = useRef(new LatestRequest());
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const current = request.current.start();
    setLoading(true); setError(null);
    try {
      const response = await fetch("/dsh-top100/diagnose", { cache: "no-store", signal: current.signal });
      const body = (await response.json()) as DiagnosticReport & { error?: string };
      if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
      if (current.isCurrent()) setReport(body);
    } catch (cause) { if (current.isCurrent()) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (current.isCurrent()) setLoading(false); }
  }, []);
  useEffect(() => { void load(); return () => request.current.cancel(); }, [load]);
  if (error) return <div className="error">{t("diagLoadFail")} <TechnicalDetails text={error} language={language} /><button type="button" onClick={() => void load()}>{t("retry")}</button></div>;
  if (!report) return <p className="lede">{loading ? t("diagLoading") : t("diagLoadFail")}</p>;
  function exportSummary(): void {
    if (!report) return;
    setExportError(false);
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      const payload = JSON.stringify(diagnosticSummary(report), null, 2);
      url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      link = document.createElement("a");
      link.href = url;
      link.download = "dsh-top100-diagnostic-summary.json";
      document.body.appendChild(link);
      link.click();
    } catch { setExportError(true); }
    finally {
      link?.remove();
      if (url) { const objectUrl = url; setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
    }
  }
  const view = diagnosticView(report);
  const actionable = view.issues.flatMap((group) => group.findings);
  const errors = actionable.filter((item) => item.severity === "error").length;
  const warnings = actionable.length - errors;
  const heading = view.issues.length ? text("有问题需要处理", "Issues need attention") : view.pending.length ? text("等待重启后验证", "Awaiting restart verification") : view.unverified.length ? text("配置检查通过，运行状态待确认", "Configuration checked; runtime unverified") : text("本次检查未发现异常", "No issues found in this check");
  return (
    <div className="diag-page" aria-busy={loading}>
      <div className="diag-summary">
        <div>
          <strong className={errors ? "diag-error" : warnings || view.pending.length ? "diag-warning" : view.unverified.length ? "" : "diag-ok"}>
            {loading ? t("diagLoading") : heading}
          </strong>
          <p className="lede">{text("检查配置、依赖、数据源及加载状态。", "Checks configuration, dependencies, data source and loading state.")}</p>
          <p className="lede">{text("检查于", "Checked at")} {new Date(report.scannedAt).toLocaleString(language === "en" ? "en-US" : "zh-CN")}</p>
        </div>
        <button type="button" disabled={loading} onClick={() => void load()}>{t("diagRefresh")}</button>
      </div>
      <div className="diag-counts" aria-label={text("检查概况", "Check overview")}>
        <span><b>{errors}</b> {text("项错误", "errors")}</span>
        <span><b>{warnings}</b> {text("项提醒", "warnings")}</span>
        <span><b>{view.pending.length}</b> {text("个待重启", "pending restart")}</span>
      </div>
      {view.issues.length ? <section className="diag-issues"><h3>{text("待处理问题", "Needs attention")}</h3>{view.issues.map((group) => {
        const bundle = report.bundles.find((item) => item.name === group.subject && item.kind === "community");
        const subject = group.findings.some((finding) => finding.code.startsWith("catalog-")) ? text("榜单数据源", "Catalog data source") : group.subject;
        const steps = [...new Set(group.findings.map((finding) => diagnosticNextStep(finding.code, language)))];
        return <article key={group.subject} className="diag-issue">
          <div className="diag-issue-heading"><strong>{subject}</strong><span className={`diag-${group.severity}`}>{group.severity === "error" ? text("错误", "Error") : text("提醒", "Warning")}</span></div>
          {group.findings.map((finding, index) => {
            const presented = presentDiagnosticFinding(finding, report, language);
            return <div className="diag-evidence" key={`${finding.code}-${index}`}><p>{presented.message}</p><TechnicalDetails text={presented.technicalDetails} language={language} /></div>;
          })}
          <div className="diag-next"><strong>{text("建议下一步", "Suggested next step")}</strong>{steps.map((step) => <p key={step}>{step}</p>)}</div>
          {bundle ? <button type="button" onClick={() => onManage(bundle.name)}>{text("查看已安装插件", "View installed plugin")}</button> : null}
        </article>;
      })}</section> : null}
      {view.pending.length ? <section className="diag-pending"><h3>{text("待重启验证", "Pending restart verification")}</h3><p>{view.pending.map((item) => item.name).join(" · ")}</p><p className="lede">{text("配置已变更。使用上方重启入口，完成后重新检查。", "Configuration changed. Use the restart control above, then check again.")}</p></section> : null}
      {view.unverified.length ? <p className="lede">{text("以下插件尚未确认加载状态：", "Loading state is not confirmed for: ")}{view.unverified.map((item) => item.name).join(" · ")}{text("。这不等于运行正常或已经故障。", ". This does not establish either success or failure.")}</p> : null}
      <details className="diag-details">
        <summary>{text("高级详情", "Advanced details")} · {report.bundles.length} {text("个插件", "plugins")}</summary>
        <p className="lede">{t("runtimeScope")}</p>
        <div className="diag-grid">
        <section><h3>{t("diagCatalogTitle")}</h3><p><code>{report.catalog.dataUrl}</code></p><p>{t("updated")}: {report.catalog.snapshotDate ?? "—"} · {report.catalog.counts.total} {t("entries")}</p></section>
        <section><h3>{t("diagInventory")}</h3><p>{t("profile")}: {report.profile}</p><p>{t("diagOfficial")}: {report.inventory.official} · {t("diagCommunity")}: {report.inventory.community} · {t("skillKind")}: {report.inventory.skills}</p><p>{t("enabled")}: {report.inventory.enabled} · {t("disabled")}: {report.inventory.disabled}</p></section>
      </div>
      {view.notes.length ? <section className="diag-section"><h3>{diagnosticLabels(language).information} ({view.notes.length})</h3><FindingList items={view.notes} report={report} language={language} /></section> : null}
      <section className="diag-section"><h3>{t("diagBundles")} ({report.bundles.length})</h3><div className="diag-list">{report.bundles.map((item) => {
        const error = presentDiagnosticBundleError(item, language);
        return <div key={item.name}><strong>{item.name}</strong> · {item.version ?? "—"} · {item.enabled ? t("enabled") : t("disabled")} {<> · {text("运行", "Runtime")}: {t(`runtime_${item.runtime?.state ?? "unknown"}`)}</>}
          {error ? <><small className="diag-error">{error.message}</small><TechnicalDetails text={error.technicalDetails} language={language} /></> : null}
        </div>;
      })}</div></section>
      {report.skills.length ? <section className="diag-section"><h3>{t("diagSkills")} ({report.skills.length})</h3><div className="diag-list">{report.skills.map((item) => <div key={item.name}><strong>{item.name}</strong> · {item.hasManifest ? "SKILL.md ✓" : "SKILL.md ✕"}</div>)}</div></section> : null}
      <details><summary>{t("diagPatch")}</summary><div className="diag-list"><code>{report.patch.path}</code><div>{t("disabled")}: {report.patch.disables.join(", ") || "—"}</div><div>{t("diagOrphans")}: {report.patch.orphans.join(", ") || "—"}</div></div></details>
      </details>
        <div className="diag-export">
          <button type="button" disabled={loading} onClick={exportSummary}>{t("diagExport")}</button>
          <p className="lede">{t("diagExportHint")}</p>
          {exportError ? <p className="error" role="alert">{t("diagExportFailed")}</p> : null}
        </div>
    </div>
  );
}
