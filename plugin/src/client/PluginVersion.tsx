import { useEffect, useState } from "react";
import type { Translate } from "./locales.js";

export const TOP100_PUBLISHED_VERSIONS = "https://www.npmjs.com/package/@evaldock/dsh-top100-plugin?activeTab=versions";
export const TOP100_UPGRADE_GUIDE = "https://github.com/evaldock/dsh-top100/blob/main/plugin/README.md#快速开始";

export function pluginVersionFromStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const status = value as Record<string, unknown>;
  return status.ok === true && status.name === "dsh-top100" && typeof status.version === "string"
    && status.version.length <= 128 && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(status.version)
    ? status.version : null;
}

/** A supplied status version avoids a request; otherwise read once, without a timer loop. */
export function PluginVersion({ version }: { version?: string | null }) {
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  useEffect(() => {
    if (version !== undefined) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    void fetch("/dsh-top100/status", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((status: unknown) => { if (!controller.signal.aborted) setLoadedVersion(pluginVersionFromStatus(status)); })
      .catch(() => { /* Leave the version hidden if status is temporarily unreachable. */ })
      .finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [version]);
  const currentVersion = version === undefined ? loadedVersion : pluginVersionFromStatus({ ok: true, name: "dsh-top100", version });
  return currentVersion ? <span className="plugin-version">v{currentVersion}</span> : null;
}

export function PluginUpgradeGuide({ t }: { t: Translate }) {
  return <section className="plugin-upgrade-guide" aria-label={t("selfUpgradeTitle")}>
    <strong>{t("selfUpgradeTitle")}</strong>
    <p>{t("selfUpgradeHint")}</p>
    <p><a href={TOP100_PUBLISHED_VERSIONS} target="_blank" rel="noopener noreferrer">{t("selfUpgradeVersions")}</a>{" · "}
      <a href={TOP100_UPGRADE_GUIDE} target="_blank" rel="noopener noreferrer">{t("selfUpgradeGuide")}</a></p>
    <p>{t("selfUpgradeLocalHint")}</p>
  </section>;
}
