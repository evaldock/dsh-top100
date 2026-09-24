import { useEffect, useRef, useState } from "react";
import type { Translate } from "./locales.js";
import { waitForRestart, type RestartStatus } from "./restart-client.js";

const SUCCESS_KEY = "dsh-top100:restart-completed";

export function RestartNotice({ t, busy }: { t: Translate; busy: boolean }) {
  const [status, setStatus] = useState<RestartStatus | null>(null);
  const [working, setWorking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [completed, setCompleted] = useState(() => {
    try {
      const at = Number(sessionStorage.getItem(SUCCESS_KEY));
      return at > 0 && Date.now() >= at && Date.now() - at < 60000;
    } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.removeItem(SUCCESS_KEY); } catch { /* Optional feedback only. */ }
  }, []);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const restartButton = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) cancelButton.current?.focus();
    else if (wasConfirming.current && !working) restartButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming, working]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const poll = async () => {
      if (locked.current) return;
      try {
        const response = await fetch("/dsh-top100/status", { cache: "no-store", signal: controller.signal });
        if (response.ok) { const next = await response.json(); if (!controller.signal.aborted) setStatus(next); }
      } catch { /* Task tracking displays ordinary connection errors. */ }
    };
    void poll(); const timer = setInterval(() => void poll(), 4000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  async function restart() {
    const signal = lifetime.current?.signal;
    if (locked.current || busy || !status?.restart?.available || !status.bootId || !signal) return;
    locked.current = true; setWorking(true); setConfirming(false); setError(null);
    try {
      let response: Response | undefined;
      try { response = await fetch("/dsh-top100/restart", { method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]) }); }
      catch { /* The old process may exit before its response arrives. Never repeat the POST. */ }
      if (response && response.status !== 202) throw new Error(response.status === 409 ? "restartBusy" : "restartFailed");
      await waitForRestart(status.bootId, signal);
      try { sessionStorage.setItem(SUCCESS_KEY, String(Date.now())); } catch { /* Reload still works without storage. */ }
      window.location.reload();
    } catch (cause) {
      if (!signal.aborted) setError(t(cause instanceof Error ? cause.message : "restartFailed"));
    } finally {
      locked.current = false;
      if (!signal.aborted) setWorking(false);
    }
  }
  if (completed && !status?.restartRequired) return <div className="restart-notice restart-complete" role="status">
    <div><strong>{t("restartCompleted")}</strong><p>{t("restartCompletedHint")}</p></div>
    <button type="button" onClick={() => setCompleted(false)}>{t("dismissTaskNotice")}</button>
  </div>;
  if (!status?.restartRequired && !working && !error) return null;
  return <div className="restart-notice" role="status">
    <div><strong>{t(working ? "restarting" : confirming ? "restartConfirmTitle" : "restartRequiredTitle")}</strong>
      <p>{t(working ? "restartWaiting" : confirming ? "restartConfirm" : status?.restart?.available ? "restartReadyHint" : `restartUnavailable_${status?.restart?.reason ?? "launcher"}`)}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
    {confirming ? <div className="restart-confirm-actions" role="group" aria-label={t("restartConfirmTitle")}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setConfirming(false); } }}>
      <button ref={cancelButton} type="button" onClick={() => setConfirming(false)}>{t("cancel")}</button>
      <button type="button" disabled={busy || !status?.restart?.available} onClick={() => void restart()}>{t("restartConfirmAction")}</button>
    </div> : status?.restart?.available ? <button ref={restartButton} type="button" disabled={busy || working} onClick={() => { setError(null); setConfirming(true); }}>{t(working ? "restarting" : "restartNow")}</button> : null}
  </div>;
}
