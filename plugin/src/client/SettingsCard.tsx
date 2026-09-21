import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Translate } from "./locales.js";

export interface Top100SettingsScope {
  getSnapshot(): { status: string; value?: { dataUrl: string }; writable: boolean };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
}

interface SettingsCardProps {
  t: Translate;
  settings: Top100SettingsScope;
}

export function SettingsCard({ t, settings }: SettingsCardProps) {
  const snapshot = useSyncExternalStore(
    (listener) => settings.subscribe(listener),
    () => settings.getSnapshot(),
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const writable = snapshot.status === "ready" && snapshot.writable;
  return (
    <form className="dsh-top100 source-settings" onSubmit={async (event) => {
      event.preventDefault();
      if (!writable || saving || draft === null) return;
      setSaving(true);
      setMessage("");
      try {
        const url = new URL(draft.trim());
        if (!["http:", "https:"].includes(url.protocol)) throw new Error(t("sourceInvalid"));
        await settings.set("dataUrl", draft.trim().replace(/\/+$/, ""));
        if (mounted.current) { setDraft(null); setMessage(t("sourceSaved")); }
      } catch (error) {
        if (mounted.current) setMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted.current) setSaving(false);
      }
    }}>
      <h3>{t("cardTitle")}</h3>
      <p className="lede">{t("cardHint")}</p>
      <label>{t("cardTitle")}<input type="url" value={draft ?? snapshot.value?.dataUrl ?? ""} disabled={!writable || saving} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} required /></label>
      <div><button className="primary" type="submit" disabled={!writable || saving || draft === null}>{saving ? t("sourceSaving") : t("sourceSave")}</button></div>
      {!writable ? <p className="lede">{t("sourceReadOnly")}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
