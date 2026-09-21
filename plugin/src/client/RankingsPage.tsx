import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogItem,
  CatalogResponse,
  CatalogScope,
  InstallBatchSnapshot,
  InstallJobSnapshot,
  InstallPreflight,
  InstallAvailability,
  PluginCategoryId,
  RankingView,
} from "../shared/types.js";
import type { Translate } from "./locales.js";
import { DescriptionPreview } from "./DescriptionPreview.js";
import { descriptionDisplayFor } from "../shared/description-rules.js";
import { LatestRequest } from "./latest-request.js";
import { deltaLabel, scoreLabel } from "./metric-presentation.js";
import { DiagnosticsPage } from "./DiagnosticsPage.js";
import { isInstallBatchComplete } from "./install-batch-presentation.js";
import { presentInstallCapability } from "./install-capability.js";
import { visibleInstallReviewRisks } from "./install-review-presentation.js";
import { taskPhaseKey } from "./install-presentation.js";
import { TaskDetails } from "./TaskDetails.js";
import { useTaskTracker } from "./use-task-tracker.js";
import { TaskStatus } from "./TaskStatus.js";
import { ManagedPage } from "./ManagedPage.js";
import { shouldRestartPagination } from "./pagination.js";
import { presentRepositoryIdentity } from "./repository-identity.js";
import { presentInstallRisk } from "./trust-presentation.js";
import { SkillBackupList } from "./SkillBackupList.js";
import { useDialogFocus } from "./use-dialog-focus.js";
import { staleSnapshotLabel } from "./data-freshness.js";

interface RankingsPageProps {
  t: Translate;
}

const SORT_VIEWS: RankingView[] = ["hot", "rising", "total"];
const EVALDOCK_SITE = "https://www.evaldock.ai/top100/";
type PageSection = "rankings" | "installed" | "diagnostics";
const GITHUB_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6a4.7 4.7 0 0 1 1.2-3.1c-.1-.3-.5-1.6.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.5.2 2.8.1 3.1a4.7 4.7 0 0 1 1.2 3.1c0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z" />
  </svg>
);
function RankTrustMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <g className="rank-mark-list">
        <circle cx="11" cy="14" r="2" />
        <path d="M17 14h17" />
        <circle cx="11" cy="23" r="2" />
        <path d="M17 23h12" />
        <circle cx="11" cy="32" r="2" />
        <path d="M17 32h7" />
      </g>
      <path className="rank-mark-check" d="m28.5 30.5 3.5 3.5 7-9" />
    </svg>
  );
}

function CategoryGlyph({ id }: { id: PluginCategoryId | null }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {id === "ai" ? <>
        <path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z" />
        <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
      </> : null}
      {id === "appearance" ? <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </> : null}
      {id === "coding" ? <>
        <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4l-3 16" />
      </> : null}
      {id === "knowledge" ? <>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
      </> : null}
      {id === "tools" ? <>
        <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-3-3 2.4-2.4Z" />
      </> : null}
      {id === "security" ? <>
        <path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </> : null}
      {id === null ? <path d="M4 5h16M4 12h16M4 19h16" /> : null}
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
    </svg>
  );
}

function rankingBasisKey(view: RankingView, query: string): string {
  return query ? "basis_search" : `basis_${view}`;
}

function rankingBasisShortKey(view: RankingView, query: string): string {
  return query ? "basisShort_search" : `basisShort_${view}`;
}


const SKELETON_CARDS = Array.from({ length: 6 }, (_, index) => (
  <div className="card-skeleton" aria-hidden="true" key={index}>
    <span className="skeleton-rank" />
    <div>
      <span className="skeleton-line skeleton-title" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-short" />
      <span className="skeleton-pills" />
    </div>
  </div>
));


class HttpError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T & { error?: string; message?: string; code?: string };
  if (!response.ok) throw new HttpError(body.error || body.message || `${response.status} ${response.statusText}`, response.status, body.code);
  return body;
}



export function RankingsPage({ t }: RankingsPageProps) {
  const [section, setSection] = useState<PageSection>("rankings");
  const [view, setView] = useState<RankingView>("hot");
  const [category, setCategory] = useState<PluginCategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [catalogScope, setCatalogScope] = useState<CatalogScope>("plugins");
  const [installAvailability, setInstallAvailability] = useState<InstallAvailability>("all");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const delayedSnapshot = staleSnapshotLabel(data, now);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<"load" | "install">("load");
  const [loading, setLoading] = useState(true);
  const tracking = useTaskTracker();
  const { batch, busy } = tracking;
  const [updateRetry, setUpdateRetry] = useState<{ id: number; names: string[] } | null>(null);
  const updateRetrySequence = useRef(0);
  const [preflightRetry, setPreflightRetry] = useState<CatalogItem | null>(null);
  const preflightRequest = useRef(new LatestRequest());
  useEffect(() => () => preflightRequest.current.cancel(), []);
  const [preparing, setPreparing] = useState<string | null>(null);
  useEffect(() => {
    if (section !== "rankings") {
      preflightRequest.current.cancel();
      setPreparing(null);
    }
  }, [section]);
  const [confirming, setConfirming] = useState<CatalogItem[] | null>(null);
  const [preflights, setPreflights] = useState<InstallPreflight[]>([]);
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [installActivityOpen, setInstallActivityOpen] = useState(false);
  const installInvoker = useRef<HTMLElement | null>(null);
  const reviewDialog = useDialogFocus<HTMLDivElement>(Boolean(confirming), installInvoker.current);
  const activityDialog = useDialogFocus<HTMLElement>(Boolean(batch && installActivityOpen));
  const [notice, setNotice] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const loadedSnapshot = useRef<string | null>(null);
  const completedBatch = useRef<string | null>(null);

  const load = useCallback(async (
    nextView: RankingView,
    nextQuery: string,
    nextCategory: PluginCategoryId | null,
    nextCatalogScope: CatalogScope,
    nextInstallAvailability: InstallAvailability,
    offset = 0,
    append = false,
  ) => {
    const requestId = ++loadSequence.current;
    const requestSnapshot = loadedSnapshot.current;
    setLoading(true);
    setErrorAction("load");
    setError(null);
    if (!append) {
      loadedSnapshot.current = null;
      setData(null);
      setItems([]);
    }
    try {
      const fetchPage = (pageOffset: number): Promise<CatalogResponse> => readJson<CatalogResponse>(
        `/dsh-top100/rankings?${new URLSearchParams({
          view: nextView,
          category: nextCategory ?? "",
          catalogScope: nextCatalogScope,
          installAvailability: nextInstallAvailability,
          q: nextQuery,
          offset: String(pageOffset),
          limit: "40",
        })}`,
      );
      let payload = await fetchPage(offset);
      if (requestId !== loadSequence.current) return;
      let shouldAppend = append;
      if (shouldRestartPagination(append, requestSnapshot, payload.generatedAt)) {
        payload = await fetchPage(0);
        if (requestId !== loadSequence.current) return;
        shouldAppend = false;
      }
      loadedSnapshot.current = payload.generatedAt;
      setData(payload);
      setItems((current) => (shouldAppend ? [...current, ...payload.items] : payload.items));
    } catch (cause) {
      if (requestId !== loadSequence.current) return;
      setErrorAction("load");
      setPreflightRetry(null);
      setError(cause instanceof Error ? cause.message : String(cause));
      if (!append) setItems([]);
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section !== "rankings") return;
    void load(view, query, category, catalogScope, installAvailability, 0, false);
  }, [catalogScope, category, installAvailability, load, query, section, view]);

  useEffect(() => {
    if (!batch || busy || !isInstallBatchComplete(batch) || completedBatch.current === batch.batchId) return;
    completedBatch.current = batch.batchId;
    if (section === "rankings") void load(view, query, category, catalogScope, installAvailability, 0, false);
  }, [batch, busy, catalogScope, category, installAvailability, load, query, section, t, view]);

  const remaining = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.total - items.length);
  }, [data, items.length]);

  const preflightsByName = useMemo(
    () => new Map(preflights.map((preflight) => [preflight.fullName, preflight])),
    [preflights],
  );
  const activeCategory = data?.categories.find((definition) => definition.id === category);

  function resetPreflight(): void {
    preflightRequest.current.cancel();
    setPreparing(null);
    setPreflightRetry(null);
    setConfirming(null);
    setPreflights([]);
    setRiskAccepted(false);
  }

  function selectSection(nextSection: PageSection): void {
    resetPreflight();
    setSection(nextSection);
  }

  function startSearch(value: string): void {
    resetPreflight();
    const nextQuery = value.trim();
    setCategory(null);
    setDraft(nextQuery);
    setQuery(nextQuery);
  }

  function switchCatalogScope(nextScope: CatalogScope): void {
    if (nextScope === catalogScope) { selectSection("rankings"); return; }
    resetPreflight();
    setSection("rankings");
    setCatalogScope(nextScope);
    setView(nextScope === "plugins" ? "hot" : "total");
    setInstallAvailability("all");
    setCategory(null);
    setQuery("");
    setDraft("");
    setCategoryMenuOpen(false);
  }

  function selectCategory(nextCategory: PluginCategoryId | null): void {
    resetPreflight();
    setCategory(nextCategory);
    setCategoryMenuOpen(false);
  }

  function selectRankingView(nextView: RankingView): void {
    resetPreflight();
    setView(nextView);
    setQuery("");
    setDraft("");
  }

  async function prepareInstall(item: CatalogItem): Promise<void> {
    installInvoker.current = document.activeElement as HTMLElement | null;
    const request = preflightRequest.current.start();
    setPreflightRetry(null);
    setConfirming(null);
    setPreflights([]);
    setInstallActivityOpen(false);
    setPreparing(item.fullName);
    setError(null);
    setNotice(null);
    try {
      const preflight = await readJson<InstallPreflight>("/dsh-top100/install-preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: item.fullName, installLocator: item.installLocator }),
        signal: request.signal,
      });
      if (!request.isCurrent()) return;
      setPreflights([preflight]);
      setRiskAccepted(!preflight.requiresExplicitApproval);
      setConfirming([item]);
    } catch (cause) {
      if (!request.isCurrent()) return;
      const needsReload = cause instanceof HttpError && (cause.code === "catalog-changed" || cause.code === "invalid-locator");
      setPreflightRetry(needsReload ? null : item);
      setErrorAction(needsReload ? "load" : "install");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request.isCurrent()) setPreparing(null);
    }
  }

  function cancelPreflight(): void {
    preflightRequest.current.cancel();
    setPreparing(null);
    setPreflightRetry(null);
    setNotice(t("preflightCancelled"));
  }

  async function install(selectedItems: CatalogItem[]): Promise<void> {
    setConfirming(null);
    setNotice(null);
    setError(null);
    try {
      const result = await tracking.submit("/dsh-top100/install-batch", {
          approvals: selectedItems.map((item) => {
            const preflight = preflightsByName.get(item.fullName);
            return {
              fullName: item.fullName,
              approvalToken: preflight?.approvalToken ?? "",
              risksAccepted: preflight?.requiresExplicitApproval ? riskAccepted : true,
            };
          }),
      });
      if (result) setInstallActivityOpen(true);
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPreflights([]);
      setRiskAccepted(false);
    }
  }

  async function retryJob(job: InstallJobSnapshot): Promise<void> {
    if (job.action === "update") {
      setInstallActivityOpen(false);
      selectSection("installed");
      setUpdateRetry({ id: ++updateRetrySequence.current, names: [job.fullName] });
      return;
    }
    if (!job.action || job.action === "install") {
      let item = items.find((candidate) => candidate.fullName === job.fullName);
      if (!item) {
        try {
          const result = await readJson<CatalogResponse>(`/dsh-top100/rankings?${new URLSearchParams({
            view: "total",
            category: "",
            catalogScope: job.kind === "skill" ? "skills" : "plugins",
            installAvailability: "all",
            q: job.fullName,
            offset: "0",
            limit: "20",
          })}`);
          item = result.items.find((candidate) => candidate.fullName === job.fullName);
        } catch { /* use the actionable fallback below */ }
      }
      if (item) await prepareInstall(item);
      else {
        setErrorAction("install");
        setError(t("retryReloadRequired"));
      }
      return;
    }
    try {
      const result = await tracking.submit("/dsh-top100/retry", { jobId: job.id });
      if (result) setInstallActivityOpen(true);
    } catch (cause) {
      setErrorAction("install");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function jobPanel(job: InstallJobSnapshot) {
    return (
      <div className={`job job-${job.phase} job-${job.action ?? "install"} activation-${job.activationState}`} aria-live="polite">
        <div className="job-heading">
          <div className="job-plugin-name" title={job.fullName}>{job.fullName}</div>
          <strong>{t(taskPhaseKey(job))}</strong>
        </div>
        <TaskDetails job={job} t={t} headingPresent />
        <SkillBackupList jobs={[job]} t={t} />
        {!["installed", "failed", "cancelled"].includes(job.phase) ? (
          <button type="button" disabled={job.cancelRequested || tracking.cancelling.includes(job.id)} onClick={() => void tracking.cancel(job.id)}>
            {t("cancel")}
          </button>
        ) : ["failed", "cancelled"].includes(job.phase) ? (
          <button type="button" disabled={busy !== null} onClick={() => void retryJob(job)}>
            {t("retry")}
          </button>
        ) : job.phase === "installed" ? (
          <button type="button" onClick={() => { setInstallActivityOpen(false); selectSection("installed"); }}>
            {t("manage")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dsh-top100">
      <header className="market-head">
        <div className="rank-mark"><RankTrustMark /></div>
        <div className="head-copy">
          <div className="market-title-row">
            <h2>{t("title")}</h2>
            <a className="github-link" href="https://github.com/evaldock/dsh-top100" aria-label="dsh-top100 GitHub" title="dsh-top100 GitHub" target="_blank" rel="noopener noreferrer">{GITHUB_ICON}</a>
          </div>
          {data ? <div className="meta">
            <a className="data-source" href={EVALDOCK_SITE} target="_blank" rel="noreferrer">EvalDock Top100</a>
            <span>{data.snapshotDate}</span>
          </div> : null}
        </div>
      </header>

      <nav className="page-tabs" aria-label={t("nav")}>
        <button type="button" aria-selected={section === "rankings" && catalogScope === "plugins"} onClick={() => switchCatalogScope("plugins")}>{t("rankings")}</button>
        <button type="button" aria-selected={section === "rankings" && catalogScope === "skills"} onClick={() => switchCatalogScope("skills")}>{t("skillsMarket")}</button>
        <button type="button" aria-selected={section === "installed"} onClick={() => selectSection("installed")}>{t("installedPage")}</button>
        <button type="button" aria-selected={section === "diagnostics"} onClick={() => selectSection("diagnostics")}>{t("diagnostics")}</button>
      </nav>
      <TaskStatus tracking={tracking} t={t} onViewResult={() => setInstallActivityOpen(true)} />

      {section === "rankings" ? <>
        {delayedSnapshot ? <p className="cache-warning" role="status">{t("dataUpdateDelayed").replace("{date}", delayedSnapshot)}</p> : null}
        {data?.cache.stale ? <p className="cache-warning" title={data.cache.reason ?? undefined}>{t("cachedStale")}</p> : null}

      <div className="toolbar ranking-toolbar">
        <div className="search-cluster">
          <input
            type="search"
            value={draft}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) startSearch(draft);
            }}
          />
          <button type="button" className="primary" onClick={() => startSearch(draft)}>
            {t("search")}
          </button>
        </div>
        <div className="market-filter-row">
          <div
            className="market-category-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setCategoryMenuOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setCategoryMenuOpen(false);
            }}
          >
            <button
              type="button"
              className="market-category-trigger"
              aria-expanded={categoryMenuOpen}
              aria-controls="top100-category-menu"
              title={activeCategory?.description ?? t("allCategories")}
              onClick={() => setCategoryMenuOpen((current) => !current)}
            >
              <span className="market-category-icon"><CategoryGlyph id={category} /></span>
              <span>{activeCategory?.label ?? t("allCategories")}</span>
              <ChevronDown />
            </button>
            {categoryMenuOpen ? (
              <div
                id="top100-category-menu"
                className="market-category-popover"
                role="listbox"
                aria-label={t(catalogScope === "skills" ? "skillCategoryFilter" : "categoryFilter")}
              >
                <button
                  type="button"
                  className="market-category-choice market-category-choice-all"
                  role="option"
                  aria-selected={category === null}
                  onClick={() => selectCategory(null)}
                >
                  <span className="market-category-icon"><CategoryGlyph id={null} /></span>
                  <span>{t("allCategories")}</span>
                </button>
                <div className="market-category-grid">
                  {data?.categories.map((definition) => (
                    <button
                      type="button"
                      key={definition.id}
                      className="market-category-choice"
                      role="option"
                      aria-selected={definition.id === category}
                      title={definition.description}
                      onClick={() => selectCategory(definition.id)}
                    >
                      <span className="market-category-icon"><CategoryGlyph id={definition.id} /></span>
                      <span>{definition.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {catalogScope === "plugins" ? (
            <button
              type="button"
              className="install-only-toggle"
              role="switch"
              aria-checked={installAvailability === "installable"}
              onClick={() => { resetPreflight(); setInstallAvailability((current) => current === "installable" ? "all" : "installable"); }}
            >
              <span className="switch-track" aria-hidden="true"><span /></span>
              <span>{t("installableOnly")}</span>
            </button>
          ) : null}
        </div>
      </div>

      {data ? (
        <div className="ranking-context" aria-live="polite">
          {query ? (
            <span className="result-count search-result-count">
              {t("catalogMatches")} {data.total} {t("entries")}
              <small> · {t("showingResults")} {items.length}</small>
            </span>
          ) : (
            <span className="result-count">
              {items.length} / {data.total} {t(catalogScope === "plugins" ? "pluginEntries" : "skillEntries")}
            </span>
          )}
          {query ? (
            <span className="ranking-current-label" title={t(rankingBasisKey(view, query))}>
              {t(rankingBasisShortKey(view, query))}
            </span>
          ) : catalogScope === "plugins" ? (
            <div className="ranking-modes" aria-label={t("sortBy")}>
              {SORT_VIEWS.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={view === id}
                  title={t(rankingBasisKey(id, ""))}
                  onClick={() => selectRankingView(id)}
                >
                  {t(id)}
                </button>
              ))}
            </div>
          ) : (
            <span className="ranking-current-label stars-browse">★ {t("starsBrowsing")}</span>
          )}
        </div>
      ) : null}

      {notice ? <div className="banner" style={{ whiteSpace: "pre-line" }}>{notice}</div> : null}
      {error ? (
        <div className="error">
          {t(errorAction === "install" ? "installError" : "loadError")}: {error}{" "}
          {errorAction === "load" ? (
            <button type="button" onClick={() => void load(view, query, category, catalogScope, installAvailability, 0, false)}>
              {t("retry")}
            </button>
          ) : preflightRetry ? (
            <button type="button" disabled={preparing !== null || busy !== null} onClick={() => void prepareInstall(preflightRetry)}>{t("retry")}</button>
          ) : null}
        </div>
      ) : null}
      {preparing ? (
        <div className="install-activity-banner is-active" role="status">
          <div><strong>{t("preflighting")}</strong><span>{preparing} · {t("preflightWait")}</span></div>
          <button type="button" onClick={cancelPreflight}>{t("cancel")}</button>
        </div>
      ) : null}
      {batch && busy ? (
        <div className={`install-activity-banner ${busy ? "is-active" : "is-complete"}`} role="status">
          <div>
            <strong>{batch.jobs[0] ? t(taskPhaseKey(batch.jobs[0])) : t(busy ? "installTaskRunning" : "installTaskComplete")}</strong>
            {batch.jobs[0] ? <span title={batch.jobs[0].fullName}>{batch.jobs[0].fullName}</span> : null}
          </div>
          <button type="button" onClick={() => setInstallActivityOpen(true)}>
            {t(busy ? "viewInstallProgress" : "viewInstallResult")}
          </button>
        </div>
      ) : null}
      <div className="list" aria-busy={loading} aria-label={loading && items.length === 0 ? t("loadingRankings") : undefined}>
        {loading && items.length === 0 && !error ? SKELETON_CARDS : items.map((item) => {
          const identity = presentRepositoryIdentity(item);
          const installCapability = presentInstallCapability(item);
          const rankingMetric = catalogScope === "plugins" && !query && view === "hot"
            ? { label: t("hotScore"), value: scoreLabel(item.hotScore) }
            : catalogScope === "plugins" && !query && view === "rising"
              ? { label: t(item.risingScore == null ? "daily" : "risingScore"), value: item.risingScore == null ? deltaLabel(item.dailyStars) : scoreLabel(item.risingScore) }
              : null;
          return (
            <article
              className="ranking-card"
              key={`${item.fullName}-${item.rank}`}
              data-rank={item.rank}
              data-trust={item.evidence.trustLevel}
            >
              <div className="card-copy">
                <div className="card-heading">
                  {catalogScope === "plugins" ? (
                    <span className="rank" aria-label={`${t("rank")} ${item.rank}`}>#{item.rank}</span>
                  ) : (
                    <span className="rank">{t(`catalogScope_${catalogScope}`)}</span>
                  )}
                  <h3>
                    <a
                      href={item.url || `https://github.com/${item.fullName}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={identity.name}
                      title={identity.name}
                    >
                      <span className="repo-name">{identity.name}</span>
                      <span className="title-arrow" aria-hidden="true">↗</span>
                    </a>
                  </h3>
                </div>
                <DescriptionPreview text={descriptionDisplayFor(item)} t={t} />
              </div>
              <div className="card-footer">
                <div className="facts">
                  <span className="star-fact" title={`${t("repositoryStars")} · ${item.fullName}`}>★ {item.stars}</span>
                  <span title={t("repositoryStars")}>{item.fullName}</span>
                  <span>{t("weekly")} {deltaLabel(item.weeklyStars)}</span>
                  {item.threeDayStars != null ? <span>{t("threeDay")} {deltaLabel(item.threeDayStars)}</span> : null}
                  {rankingMetric ? (
                    <span className="ranking-metric" title={t(rankingBasisKey(view, query))}>
                      {rankingMetric.label} <strong>{rankingMetric.value}</strong>
                    </span>
                  ) : null}
                  <span className={`capability-label capability-${installCapability.kind}`} title={t(installCapability.reasonKey)}>
                    {t(installCapability.labelKey)}
                  </span>
                </div>
                <div className="actions">
                  {item.installed && item.type?.toLowerCase() !== "skill" ? (
                    <button type="button" className="primary" onClick={() => selectSection("installed")}>
                      {t("manage")}
                    </button>
                  ) : item.installable ? (
                    <button
                      type="button"
                      className="primary"
                      disabled={!tracking.ready || busy !== null || preparing !== null}
                      onClick={() => void prepareInstall(item)}
                    >
                      {preparing === item.fullName ? t("preflighting") : t("reviewInstall")}
                    </button>
                  ) : (
                    <a className="project-link" href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">
                      <span>{t("viewProject")}</span><span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!loading && items.length === 0 ? <p className="lede">{t(catalogScope === "plugins" && !query && view !== "total" ? "emptyRanking" : "empty")}</p> : null}
      </div>

      {remaining > 0 ? (
        <button type="button" disabled={loading} onClick={() => void load(view, query, category, catalogScope, installAvailability, items.length, true)}>
          {t("more")} ({remaining})
        </button>
      ) : null}

      {confirming ? (
        <div
          ref={reviewDialog}
          tabIndex={-1}
          className="mask"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dsh-top100-confirm-title"
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setConfirming(null);
            setPreflights([]);
            setRiskAccepted(false);
          }}
        >
          <div className="dialog">
            <header className="confirm-header">
              <h3 id="dsh-top100-confirm-title">{confirming.length === 1
                ? t("confirmProjectTitle").replace("{name}", presentRepositoryIdentity(confirming[0]).name)
                : t("confirmTitle")}</h3>
              {confirming.length === 1 ? <code className="confirm-target" aria-label={t("resolvedSource")}>
                {preflightsByName.get(confirming[0].fullName)?.provenance.resolvedTarget ?? confirming[0].installSpec?.spec ?? "-"}
              </code> : null}
            </header>
            <div className="confirm-body">
            <div className="confirm-list">
              {confirming.map((item) => {
                const preflight = preflightsByName.get(item.fullName);
                const identity = presentRepositoryIdentity(item);
                const scriptCount = preflight?.lifecycleScripts.length ?? 0;
                const needsRestart = preflight?.risks.some((risk) => risk.code === "restart-required") ?? false;
                const visibleRisks = visibleInstallReviewRisks(preflight?.risks ?? [], scriptCount);
                const sourceSummaryKey = preflight?.provenance.source === "github"
                  ? "commitLocked"
                  : preflight?.provenance.repositoryIdentity === "unavailable"
                    ? "sourceIdentityUnavailable"
                    : "sourceMatched";
                return <div className="confirm-item" key={item.fullName}>
                  {confirming.length > 1 ? <div className="confirm-project">
                    <strong>{identity.name}</strong>
                    <code className="confirm-target" aria-label={t("resolvedSource")}>{preflight?.provenance.resolvedTarget ?? item.installSpec?.spec ?? "-"}</code>
                  </div> : null}
                  <section className="confirm-effects" aria-label={t("installSummary")}>
                    {scriptCount > 0 ? <div className="confirm-scripts" data-warning={scriptCount > 0}>
                      <p>{t("confirmScripts")}</p>
                      {preflight?.lifecycleScripts.map((script) => (
                        <div className="script-evidence" key={script.name}>
                          <span>{script.name}</span><span aria-hidden="true">→</span><code>{script.command}</code>
                        </div>
                      ))}
                    </div> : null}
                    <ul className="risk-list">
                      {visibleRisks.map((risk) => {
                        const presented = presentInstallRisk(risk, t);
                        return (
                          <li key={risk.code} data-severity={risk.severity}>
                            <strong>{presented.summary}</strong><span>{presented.detail}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {needsRestart ? <p className="confirm-followup">{t("confirmRestart")}</p> : null}
                    {item.install?.needsConfig ? <p className="confirm-followup">{t("confirmNeedConfig")}</p> : null}
                  </section>
                  <details className="confirm-evidence">
                    <summary>{t("viewInstallTechnicalEvidence")}</summary>
                    <p className="confirm-source-status">{t(sourceSummaryKey)}</p>
                    <dl>
                      <div><dt>{t("requestedSource")}</dt><dd><code>{preflight?.provenance.requestedTarget ?? item.installSpec?.spec ?? item.type}</code></dd></div>
                      <div><dt>{t("resolvedSource")}</dt><dd><code>{preflight?.provenance.resolvedTarget ?? "-"}</code></dd></div>
                    {preflight?.provenance.integrity ? (
                      <div><dt>{t("integrity")}</dt><dd><code>{preflight.provenance.integrity}</code></dd></div>
                    ) : null}
                    </dl>
                    {scriptCount === 0 ? <p>{t("noBuildScripts")}</p> : null}
                    {needsRestart ? <p>{t("risk_restart-required_detail")}</p> : null}
                    <a className="confirm-project-link" href={item.url || `https://github.com/${item.fullName}`} target="_blank" rel="noreferrer">{t("viewProject")} ↗</a>
                  </details>
                </div>;
              })}
            </div>
            </div>
            <footer className="confirm-footer">
            <p className="confirm-caveat">{t("confirmSecurityNote")}</p>
            {preflights.some((value) => value.requiresExplicitApproval) ? (
              <label className="risk-approval">
                <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />
                <span>{t("riskApproval")}</span>
              </label>
            ) : null}
            <div className="confirm-actions">
              <button type="button" autoFocus onClick={() => { setConfirming(null); setPreflights([]); setRiskAccepted(false); }}>
                {t("cancel")}
              </button>
              <button type="button" className="primary" disabled={!riskAccepted} onClick={() => void install(confirming)}>
                {t("confirm")}
              </button>
            </div>
            </footer>
          </div>
        </div>
      ) : null}
      </> : section === "installed" ? <ManagedPage t={t} tracking={tracking} retryUpdate={updateRetry} onRetryConsumed={() => setUpdateRetry(null)} onBrowseSkills={() => { resetPreflight(); setCatalogScope("skills"); setView("total"); setInstallAvailability("all"); setCategory(null); setQuery(""); setDraft(""); setSection("rankings"); }} /> : <DiagnosticsPage t={t} />}

      {batch && installActivityOpen ? (
        <div className="install-activity-mask">
          <section
            ref={activityDialog}
            tabIndex={-1}
            className="install-activity-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dsh-top100-install-activity-title"
            onKeyDownCapture={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              setInstallActivityOpen(false);
            }}
          >
            <header className="install-activity-head">
              <div>
                <h3 id="dsh-top100-install-activity-title">{t("installActivityTitle")}</h3>
                <p>{t(busy ? "installActivityActiveHint" : "installActivityCompleteHint")}</p>
              </div>
              <button
                type="button"
                className="install-activity-close"
                autoFocus
                aria-label={t("closeInstallActivity")}
                onClick={() => setInstallActivityOpen(false)}
              >×</button>
            </header>
            <div className="install-activity-list">
              {batch.jobs.map((job) => <div className="install-activity-item" key={job.id}>{jobPanel(job)}</div>)}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
