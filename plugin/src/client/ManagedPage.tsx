import { RankTrustMark } from "./RankMark.js";
import { taskPhaseKey, taskProgressKey } from "./install-presentation.js";
import { TaskDetails } from "./TaskDetails.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InstallBatchSnapshot, ManagedKind, ManagedListResponse, ManagedPlugin, UpdatePreflightItem } from "../shared/types.js";
import { LatestRequest } from "./latest-request.js";
import type { TaskTracker } from "./use-task-tracker.js";
import { UpdateReview } from "./UpdateReview.js";
import type { Translate } from "./locales.js";
import { parseSemver } from "../host/semver.js";
import { MAX_UPDATE_BATCH_SIZE, type UpdatePreflightIssue, type UpdateStrategy } from "../shared/types.js";
import { prepareUpdateBatch } from "./update-batch.js";
import { SkillBackupList } from "./SkillBackupList.js";
import { UpdateCheckResults } from "./UpdateCheckResults.js";

function Chevron() {
  return <svg className="managed-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m5.5 3.5 4.5 4.5-4.5 4.5" /></svg>;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(body.error || `${response.status} ${response.statusText}`), { code: body.code });
  return body;
}

export function ManagedPage({ t, tracking, retryUpdate, onRetryConsumed, initialQuery = "", onBrowseSkills }: {
  t: Translate; tracking: TaskTracker; initialQuery?: string;
  retryUpdate?: { id: number; names: string[] } | null; onRetryConsumed?: () => void;
  onBrowseSkills?: () => void;
}) {
  const [draft, setDraft] = useState(initialQuery);
  const [toggling, setToggling] = useState<string | null>(null);
  const toggleLock = useRef(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState<ManagedListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { batch, busy } = tracking;
  const completedBatch = useRef<string | null>(null);
  const consumedRetry = useRef<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const updateRequest = useRef(new LatestRequest());
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<UpdatePreflightItem[] | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [retryNames, setRetryNames] = useState<string[] | null>(null);
  const [updateStrategy, setUpdateStrategy] = useState<UpdateStrategy>("preserve");
  const [issues, setIssues] = useState<UpdatePreflightIssue[]>([]);
  const [checkedCount, setCheckedCount] = useState(0);
  const [checkingTotal, setCheckingTotal] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const migrationLock = useRef(false);
  const submissionLock = useRef(false);
  const updateInvoker = useRef<HTMLElement | null>(null);
  useEffect(() => () => updateRequest.current.cancel(), []);

  const load = useCallback(async (refreshUpdates = false) => {
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<ManagedListResponse>(`/dsh-top100/managed?q=${encodeURIComponent(query)}${refreshUpdates ? "&refresh=1" : ""}`);
      if (requestId === loadSequence.current) setData(payload);
    } catch (cause) {
      if (requestId === loadSequence.current) { setRetryNames(null); setError(cause instanceof Error ? cause.message : String(cause)); }
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!batch || busy || batch.completed !== batch.total || completedBatch.current === batch.batchId) return;
    completedBatch.current = batch.batchId;
    void load();
  }, [batch, busy, load, t]);

  useEffect(() => {
    if (!retryUpdate || consumedRetry.current === retryUpdate.id || busy || !tracking.ready) return;
    consumedRetry.current = retryUpdate.id;
    void prepareUpdates(retryUpdate.names);
    onRetryConsumed?.();
  }, [retryUpdate, busy, tracking.ready, onRetryConsumed]);

  const jobByName = useMemo(() => new Map((batch?.jobs ?? []).map((job) => [job.fullName, job])), [batch]);

  async function manage(action: "uninstall", names: string[], kind: ManagedKind): Promise<void> {
    if (!window.confirm(t(kind === "skill" ? "confirmRemoveSkill" : "confirmRemovePlugin"))) return;
    setError(null);
    setRetryNames(null);
    setNotice(null);
    try {
      await tracking.submit("/dsh-top100/manage", { action, names, kind });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }

  async function prepareUpdates(names: string[]): Promise<void> {
    if (!names.length || submitting || busy || !tracking.ready) return;
    updateInvoker.current = document.activeElement as HTMLElement | null;
    const requestedNames = [...new Set(names)].slice(0, MAX_UPDATE_BATCH_SIZE);
    const request = updateRequest.current.start();
    setPreparing(true); setReview(null); setIssues([]); setCheckedCount(0); setCheckingTotal(requestedNames.length);
    setAccepted(false); setRetryNames(null); setError(null); setNotice(null);
    try {
      const response = await prepareUpdateBatch(requestedNames, updateStrategy, {
        signal: request.signal,
        onProgress: (checked) => { if (request.isCurrent()) setCheckedCount(checked); },
      });
      if (!request.isCurrent()) return;
      setIssues(response.issues);
      setReview(response.items.length ? response.items : null);
      setAccepted(!response.items.some((item) => item.preflight.requiresExplicitApproval));
      if (!response.items.length) setNotice(t("noUpdatesPrepared"));
      if (response.issues.some((issue) => issue.status === "current")) void load(true);
    } catch (cause) {
      if (!request.isCurrent()) return;
      if (cause instanceof Error && "code" in cause && cause.code === "no-update") {
        setNotice(cause.message);
        void load(true);
        return;
      }
      setRetryNames(requestedNames); setError(cause instanceof Error ? cause.message === "updatePreflightIncomplete" ? t(cause.message) : cause.message : String(cause));
    } finally { if (request.isCurrent()) setPreparing(false); }
  }

  function cancelUpdateReview(): void {
    updateRequest.current.cancel(); setPreparing(false); setReview(null); setRetryNames(null); setAccepted(false); setIssues([]);
    setNotice(t("updatePreflightCancelled"));
  }

  async function confirmUpdates(): Promise<void> {
    if (!review?.length || !accepted || submissionLock.current) return;
    const approved = review;
    submissionLock.current = true; setSubmitting(true); setReview(null); setError(null); setNotice(null);
    try {
      await tracking.submit("/dsh-top100/manage", { action: "update", kind: "bundle", names: approved.map((item) => item.name), approvals: approved.map((item) => ({
        name: item.name, approvalToken: item.preflight.approvalToken, risksAccepted: item.preflight.requiresExplicitApproval ? accepted : true,
      })) });
    } catch (cause) {
      // Tokens may have expired or been consumed; retries must request a new full review.
      setRetryNames(approved.map((item) => item.name)); setError(cause instanceof Error ? cause.message : String(cause));
    } finally { submissionLock.current = false; setSubmitting(false); }
  }

  async function toggle(item: ManagedPlugin): Promise<void> {
    if (toggleLock.current) return;
    toggleLock.current = true; setToggling(item.name); setError(null); setNotice(null);
    setRetryNames(null);
    try {
      await readJson("/dsh-top100/toggle", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: item.name, enabled: !item.enabled }),
      });
      setNotice(t("toggleSaved"));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { toggleLock.current = false; setToggling(null); }
  }

  async function migrateSources(): Promise<void> {
    if (migrationLock.current || busy || !tracking.ready) return;
    migrationLock.current = true; setMigrating(true); setError(null); setNotice(null);
    try {
      const preflight = await readJson<{ approvalToken: string; items: Array<{ name: string; from: string; version: string }> }>("/dsh-top100/source-migration", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preflight" }),
      });
      if (preflight.items.length === 0) { await load(true); return; }
      const changes = preflight.items.map((item) => `${item.name}: ${item.from} → ${item.version}`).join("\n");
      if (!window.confirm(`${t("sourceMigrationConfirm")}\n\n${changes}`)) return;
      await readJson("/dsh-top100/source-migration", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", approvalToken: preflight.approvalToken }),
      });
      await load(true); setNotice(t("sourceMigrationComplete"));
    } catch (cause) {
      await load(true);
      setError(`${t("sourceMigrationFailed")} ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally { migrationLock.current = false; setMigrating(false); }
  }

  const operationBlocked = !tracking.ready || busy !== null || preparing || submitting || migrating || review !== null || toggling !== null;
  const hasUpdateSettings = data?.items.some((item) => item.kind === "bundle" && !item.protected && !item.local) ?? false;
  const updates = data?.items.filter((item) => item.kind === "bundle" && !item.protected && !item.local
    && (updateStrategy === "latest" || item.updateAvailable || !item.latest)) ?? [];

  function descriptionFor(item: ManagedPlugin): string {
    if (["@dsheval/dsh-top100-plugin", "@evaldock/dsh-top100-plugin"].includes(item.name)) return t("managedSelfDescription");
    if (t("descriptionLocale") === "en") return item.description.trim() || `${t(item.kind === "skill" ? "installedSkillFallback" : "installedPluginFallback")}: ${item.name}.`;
    const supplied = item.descriptionZh.trim();
    if (supplied) return supplied;
    return item.kind === "skill"
      ? `${t("installedSkillFallback")}：${item.name}。${t("noChineseDescription")}。`
      : `${t("installedPluginFallback")}：${item.name}。${t("noChineseDescription")}。`;
  }

  return (
    <div className="managed-page">
      <div className="toolbar">
        <input type="search" aria-label={t("searchInstalled")} value={draft} placeholder={t("searchInstalled")} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery(draft.trim()); }} />
        <button type="button" className="primary" onClick={() => setQuery(draft.trim())}>{t("search")}</button>
        <button type="button" disabled={loading || operationBlocked} onClick={() => void load(true)}>{t("refreshInstalled")}</button>
        {updates.length > 0 ? <button type="button" disabled={operationBlocked || data?.sourceMigrationRequired === true} onClick={() => void prepareUpdates(updates.map((item) => item.name))}>
          {t("updateAll")}
        </button> : null}
      </div>
      {data?.sourceMigrationRequired ? <div className="banner"><strong>{t("sourceMigrationTitle")}</strong><p>{t("sourceMigrationHint")}</p>
        <button type="button" disabled={operationBlocked} onClick={() => void migrateSources()}>{t(migrating ? "sourceMigrationWorking" : "sourceMigrationAction")}</button>
      </div> : null}
      {updates.length > MAX_UPDATE_BATCH_SIZE ? <p className="banner">{t("updateBatchLimit")} {MAX_UPDATE_BATCH_SIZE} / {updates.length}</p> : null}
      <div className="managed-context">
        {data ? <p className="lede">{data.total} {t("managedItems")}</p> : null}
        {hasUpdateSettings ? <button type="button" className="manage-options-trigger" aria-expanded={optionsOpen} aria-controls="dsh-top100-management-options" onClick={() => setOptionsOpen((open) => !open)}>
          <Chevron />{t("manageOptions")}
        </button> : null}
        <div id="dsh-top100-management-options" className="manage-options-content" hidden={!optionsOpen || !hasUpdateSettings}>
        {data?.items.some((item) => item.kind === "bundle" && !item.protected && !item.local) ? <div className="managed-setting">
          <div className="managed-strategies" role="group" aria-label={t("updateStrategy")}>
            {(["preserve", "latest"] as const).map((strategy) => <button key={strategy} type="button" aria-pressed={updateStrategy === strategy} disabled={operationBlocked}
              onClick={() => { setUpdateStrategy(strategy); setIssues([]); setNotice(null); }}>{t(strategy === "preserve" ? "updatePreserve" : "updateLatest")}</button>)}
          </div>
          <p className="lede">{t(updateStrategy === "latest" ? "managedLatestHint" : "managedPreserveHint")}</p>
        </div> : null}
        </div>
      </div>
      {notice ? <div className="banner" style={{ whiteSpace: "pre-line" }}>{notice}</div> : null}
      {batch ? <SkillBackupList jobs={batch.jobs} t={t} /> : null}
      {error ? <div className="error">{error} <button type="button" disabled={operationBlocked} onClick={() => void (retryNames ? prepareUpdates(retryNames) : load(true))}>{t(retryNames ? "retry" : "refreshInstalled")}</button></div> : null}
      {issues.length ? <div className="banner" role="status"><strong>{t("updateCheckResults")}</strong>
        <UpdateCheckResults issues={issues} t={t} />
        {issues.some((issue) => issue.status === "failed") ? <button type="button" disabled={operationBlocked} onClick={() => void prepareUpdates(issues.filter((issue) => issue.status === "failed").map((issue) => issue.name))}>{t("retryFailedChecks")}</button> : null}
      </div> : null}
      {preparing ? <div className="install-activity-banner is-active" role="status"><div><strong>{t("preflighting")} {checkedCount}/{checkingTotal}</strong><span>{t("updatePreflightWait")}</span></div><button type="button" onClick={cancelUpdateReview}>{t("cancel")}</button></div> : null}
      {submitting ? <div className="banner" role="status">{t("updateSubmitting")}</div> : null}
      {review ? <UpdateReview items={review} issues={issues} strategy={updateStrategy} accepted={accepted} onAccepted={setAccepted} onCancel={cancelUpdateReview} onConfirm={() => void confirmUpdates()} t={t} restoreFocusTo={updateInvoker.current} /> : null}
      {busy && batch ? <div className="banner" role="status">{t(taskProgressKey(batch.jobs))} {batch.completed}/{batch.total}
        {batch.jobs.filter((job) => !["installed", "failed", "cancelled"].includes(job.phase)).map((job) => <div key={job.id}>
          <span>{job.fullName} · {t(taskPhaseKey(job))}</span>{" "}
          <button type="button" disabled={job.cancelRequested || tracking.cancelling.includes(job.id)} onClick={() => void tracking.cancel(job.id)}>{t("cancel")}</button>
        </div>)}
      </div> : null}
      {loading && !data && !error ? <div className="banner" role="status">{t("loadingInstalled")}</div> : null}
      <div className="list managed-list">
        {(data?.items ?? []).map((item) => {
          const job = jobByName.get(item.name);
          const shortName = item.name.replace(/^@[^/]+\//, "");
          const displayName = ["@dsheval/dsh-top100-plugin", "@evaldock/dsh-top100-plugin"].includes(item.name) ? "dsh-top100"
            : data?.items.some((other) => other.name !== item.name && other.name.replace(/^@[^/]+\//, "") === shortName) ? item.name : shortName;
          const versionsKnown = Boolean(item.version && item.latest
            && parseSemver(item.version.replace(/^v/, "")) && parseSemver(item.latest.replace(/^v/, "")));
          const statusLabel = t(item.kind === "skill" ? "installed" : item.runtime ? `runtime_${item.runtime.state}` : `activation_${item.activationState}`);
          const loaded = item.kind === "bundle" && (item.runtime ? item.runtime.state === "loaded" : item.activationState === "live");
          const noUpdate = updateStrategy === "preserve" && versionsKnown && !item.updateAvailable;
          return (
            <article className="managed-item" key={`${item.kind}-${item.name}`}>
              <div className="managed-item-main">
              <div className="managed-item-heading">
                <span className="managed-item-icon" aria-hidden="true">{displayName === "dsh-top100" ? <RankTrustMark /> : item.kind === "skill" ? "✦" : "▦"}</span>
                <div><div className="managed-item-title"><h3 title={item.name}>{displayName}</h3>
                  <span className="managed-version">{item.version ? `v${item.version.replace(/^v/, "")}` : t("installed")}{item.kind === "skill" ? ` · ${t("skillKind")}` : ""}</span></div>
                  </div>
              </div>
              <p className="desc managed-description">{descriptionFor(item)}</p>
              </div>
              <div className="managed-item-footer">
              <div className="managed-item-status">
                {!loaded ? <span className={`badge activation-${item.activationState}`} title={t("runtimeScope")}>
                  <span className={`dot ${item.kind === "skill" ? "off" : item.activationState === "live" ? "live" : item.activationState === "broken" ? "broken" : item.activationState === "restart-required" ? "pending" : "off"}`} aria-hidden="true" />
                  {statusLabel}
                </span> : null}
                {item.kind === "bundle" ? <button type="button" role="switch" className="managed-switch" aria-checked={item.enabled}
                  aria-label={`${t(item.enabled ? "disable" : "enable")} ${item.name}`} title={t(item.protected ? "protectedManageHint" : item.enabled ? "disable" : "enable")}
                  disabled={item.protected || operationBlocked} onClick={() => void toggle(item)}><span /></button> : null}
              </div>
              <div className="managed-item-actions">
                {item.protected ? <span className="managed-version">{t("managedProtected")}</span> : <>
                  {item.kind === "bundle" && !item.local ? noUpdate ? <span className="managed-version">{t("noUpdateAvailable")}</span>
                    : <button type="button" className={item.updateAvailable ? "primary" : undefined} disabled={operationBlocked || data?.sourceMigrationRequired === true} onClick={() => void prepareUpdates([item.name])}>{t(item.updateAvailable ? "update" : "checkUpdates")}{item.updateAvailable && item.latest ? ` · v${item.latest.replace(/^v/, "")}` : ""}</button> : null}
                  {item.kind === "skill" && onBrowseSkills ? <button type="button" disabled={operationBlocked} onClick={onBrowseSkills}>{t("browseSkillUpdates")}</button> : null}
                  <button type="button" className="danger" disabled={operationBlocked || (item.kind === "bundle" && data?.sourceMigrationRequired === true)} onClick={() => void manage("uninstall", [item.name], item.kind)}>{t("uninstall")}</button>
                </>}
              </div>
              </div>
              {job ? <div className="job"><TaskDetails job={job} t={t} /></div> : null}
              {job?.action === "update" && (job.phase === "failed" || job.phase === "cancelled") ? <button type="button" disabled={item.protected || item.local || operationBlocked} onClick={() => void prepareUpdates([item.name])}>{t("retry")}</button> : null}
              {item.updateError ? <p className="managed-update-error">{t("updateStatus_failed")}</p> : null}
              <details className="managed-details">
                <summary><span>{t("viewDetails")}</span><Chevron /></summary>
                <div className="managed-body">
                  <p className="managed-package">{item.name}</p>
                  {item.kind === "bundle" ? <div><strong>{statusLabel}</strong><p className="lede">{t("runtimeScope")}</p></div> : null}
                  <p className="desc">{descriptionFor(item)}</p>
                  {item.updateError ? <p className="lede">{item.updateError}</p> : null}
                  {item.kind === "skill" && item.modificationState ? <p className="lede">{t(`skillModification_${item.modificationState}`)}</p> : null}
                  {item.runtime?.missingServices?.length ? <div><strong>{t("runtimeDetails")}</strong><p><code>{item.runtime.missingServices.join(", ")}</code></p></div> : null}
                  {item.kind === "bundle" && (item.protected || item.local) ? <p className="lede">{t(item.protected ? "protectedManageHint" : "localManageHint")}</p> : null}
                  {item.kind === "skill" ? <p className="lede">{t("skillReinstallHint")}</p> : null}
                  <div className="managed-links">
                    {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{t("viewProject")} ↗</a> : null}
                    {item.protected ? <a href="https://www.evaldock.ai/top100/?page=dsh#dsh" target="_blank" rel="noreferrer">{t("maintenanceGuide")} ↗</a> : null}
                  </div>
                </div>
              </details>
            </article>
          );
        })}
        {!loading && data?.items.length === 0 ? <p className="lede">{t("emptyInstalled")}</p> : null}
      </div>
    </div>
  );
}
