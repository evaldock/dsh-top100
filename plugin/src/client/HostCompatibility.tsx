import type { HostCompatibility as Evidence } from "../shared/types.js";
import type { Translate } from "./locales.js";

export function HostCompatibility({ evidence, t }: { evidence?: Evidence; t: Translate }) {
  if (!evidence) return null;
  return <section className="confirm-effects" aria-label={t("hostCompatibility")}>
    <strong>{t("hostCompatibility")}: {t(`host_${evidence.status}`)}</strong>
    <p>{t("hostCurrent")}: <code>{evidence.runtimeVersion ?? "—"}</code></p>
    {evidence.requirements.map((item) => <p key={item.name}><code>{item.name}: {item.range}</code> — {t(`host_${item.matched === null ? "unknown" : item.matched ? "matched" : "mismatch"}`)}</p>)}
    <p>{t(`host_${evidence.reason}`)}</p>
    {evidence.status === "mismatch" ? <p className="cache-warning">{t("hostMismatchHint")}</p> : null}
  </section>;
}
