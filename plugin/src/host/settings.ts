/** Optional settings namespace so operators can change the catalog URL without editing YAML. */

import type { Context } from "@deepseek-ai/cordis";
import * as settings from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL, invalidateCatalog, normalizeDataUrl } from "./catalog.js";
import type { PluginResolvedConfig } from "./contracts.js";

export const TOP100_SETTINGS_NS = "dsh-top100";

export interface Top100Settings {
  dataUrl: string;
}

export const Top100Settings = z.object({
  dataUrl: z.string().default(DEFAULT_DATA_URL),
});

interface SettingsSectionHooks<T> {
  validate(value: T): void;
  setSource(current: () => T): void;
  onChange(): void;
}

export function installTop100Settings(ctx: Context, resolved: PluginResolvedConfig): void {
  const entry = { dataUrl: resolved.dataUrl || DEFAULT_DATA_URL };
  let source = (): Top100Settings => entry;
  const hooks: SettingsSectionHooks<Top100Settings> = {
    validate: (value) => {
      normalizeDataUrl(value.dataUrl);
    },
    setSource: (current) => {
      source = current;
    },
    onChange: () => {
      resolved.dataUrl = normalizeDataUrl(source().dataUrl);
      invalidateCatalog();
    },
  };
  // 0.1.1 exposed a free helper; 0.1.2+ moved it onto the optional service.
  type InstallSection = (
    owner: Context, namespace: string, schema: typeof Top100Settings,
    base: Top100Settings, hooks: SettingsSectionHooks<Top100Settings>,
  ) => void;
  const legacy = settings as unknown as { installSettingsSection?: InstallSection };
  if (typeof legacy.installSettingsSection === "function") {
    legacy.installSettingsSection(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
  } else {
    ctx.inject(["settings"], (scoped) => {
      // 0.1.7 derives forms directly from the Loader entry's exported Config.
      // Its settings service has no installSection; the host owns changes/reloads.
      const service = scoped.get("settings") as { installSection?: InstallSection } | undefined;
      service?.installSection?.(ctx, TOP100_SETTINGS_NS, Top100Settings, entry, hooks);
    });
  }
}
