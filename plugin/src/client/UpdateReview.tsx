import { UpdateLinks } from "./UpdateLinks.js";
import { HostCompatibility } from "./HostCompatibility.js";
import type { UpdatePreflightItem, UpdatePreflightIssue, UpdateStrategy } from "../shared/types.js";
import type { Translate } from "./locales.js";
import { visibleInstallReviewRisks } from "./install-review-presentation.js";
import { presentInstallRisk } from "./trust-presentation.js";
import { useDialogFocus } from "./use-dialog-focus.js";
import { UpdateCheckResults } from "./UpdateCheckResults.js";

export function UpdateReview({ items, issues = [], strategy = "preserve", accepted, onAccepted, onCancel, onConfirm, t, restoreFocusTo }: {
  items: UpdatePreflightItem[]; accepted: boolean; onAccepted: (accepted: boolean) => void;
  issues?: UpdatePreflightIssue[]; strategy?: UpdateStrategy;
  onCancel: () => void; onConfirm: () => void; t: Translate;
  restoreFocusTo?: HTMLElement | null;
}) {
  const dialog = useDialogFocus<HTMLDivElement>(true, restoreFocusTo);
  return <div ref={dialog} tabIndex={-1} className="mask" role="dialog" aria-modal="true" aria-labelledby="dsh-top100-update-title"
    onKeyDownCapture={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
    <div className="dialog">
      <header className="confirm-header"><h3 id="dsh-top100-update-title">{t("reviewUpdateTitle")}</h3><p>{t("reviewUpdateHint")}</p><p>{t(strategy === "latest" ? "updateLatestHint" : "updatePreserveHint")}</p></header>
      <div className="confirm-body"><div className="confirm-list">
        {issues.length ? <section><strong>{t("updateCheckResults")} ({issues.length})</strong><UpdateCheckResults issues={issues} t={t} /></section> : null}
        {items.map(({ name, currentVersion, preflight }) => <div className="confirm-item" key={name}>
          <div className="confirm-project"><strong>{name}</strong><p>{t("version")}: {currentVersion ?? "—"} → <code className="confirm-target">{preflight.provenance.resolvedTarget}</code></p></div>
          <p>{t("updateTarget")}: <code>{preflight.provenance.requestedTarget}</code></p>
          <UpdateLinks provenance={preflight.provenance} t={t} />
          <HostCompatibility evidence={preflight.hostCompatibility} t={t} />
                  <section className="confirm-effects" aria-label={t("installSummary")}>
            {preflight.lifecycleScripts.length > 0 ? <div className="confirm-scripts" data-warning="true">
              <p>{t("confirmScripts")}</p>
              {preflight.lifecycleScripts.map((script) => <div className="script-evidence" key={script.name}><span>{script.name}</span><span aria-hidden="true">→</span><code>{script.command}</code></div>)}
            </div> : null}
            <ul className="risk-list">{visibleInstallReviewRisks(preflight.risks, preflight.lifecycleScripts.length).map((risk) => {
              const presented = presentInstallRisk(risk, t);
              return <li key={risk.code} data-severity={risk.severity}><strong>{presented.summary}</strong><span>{presented.detail}</span></li>;
            })}</ul>
            {preflight.risks.some((risk) => risk.code === "restart-required") ? <p className="confirm-followup">{t("confirmRestart")}</p> : null}
          </section>
          <details className="confirm-evidence"><summary>{t("viewInstallTechnicalEvidence")}</summary>
            <p>{t(preflight.provenance.source === "github" ? "commitLocked" : preflight.provenance.repositoryIdentity === "unavailable" ? "sourceIdentityUnavailable" : "sourceMatched")}</p>
            <dl><div><dt>{t("requestedSource")}</dt><dd><code>{preflight.provenance.requestedTarget}</code></dd></div>
              <div><dt>{t("resolvedSource")}</dt><dd><code>{preflight.provenance.resolvedTarget}</code></dd></div>
              {preflight.provenance.integrity ? <div><dt>{t("integrity")}</dt><dd><code>{preflight.provenance.integrity}</code></dd></div> : null}</dl>
            {preflight.lifecycleScripts.length === 0 ? <p>{t("noBuildScripts")}</p> : null}
          </details>
        </div>)}
      </div></div>
      <footer className="confirm-footer"><p className="confirm-caveat">{t("confirmSecurityNote")}</p>
        {items.some((item) => item.preflight.requiresExplicitApproval) ? <label className="risk-approval"><input type="checkbox" checked={accepted} onChange={(event) => onAccepted(event.target.checked)} /><span>{t("riskApproval")}</span></label> : null}
        <div className="confirm-actions"><button type="button" autoFocus onClick={onCancel}>{t("cancel")}</button><button type="button" className="primary" disabled={!accepted} onClick={onConfirm}>{t("confirmUpdate")}</button></div>
      </footer>
    </div>
  </div>;
}
