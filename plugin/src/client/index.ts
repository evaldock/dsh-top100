/**
 * Browser half: register a Settings section. Official dual-face client entry.
 */

import { createElement as h } from "react";
import { PluginErrorBoundary } from "./ErrorBoundary.js";
import { RankingsPage } from "./RankingsPage.js";
import { SettingsCard, type Top100SettingsScope } from "./SettingsCard.js";
import { css } from "./styles.js";
import { en, zh, type Translate } from "./locales.js";

const NS = "dsh-top100";
const STYLE_ID = "dsh-top100-plugin-css";

interface LocaleService {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void;
  bind(namespace: string): Translate;
}

interface SlotsService {
  inject(slot: string, register: () => unknown): void;
  register(meta: Record<string, unknown>, component: () => unknown): unknown;
}

interface ClientContext {
  effect(callback: () => (() => void) | void, label?: string): void;
  inject?(services: string[], callback: (scoped: { slots: SlotsService; settingsScope: { bind(spec: { namespace: string }): Top100SettingsScope } }) => void): void;
  locale: LocaleService;
  slots: SlotsService;
}

export const name = "dsh-top100";
export const inject = ["slots", "locale"];

function ensureCss(): () => void {
  if (typeof document === "undefined") return () => undefined;
  if (document.getElementById(STYLE_ID) === null) {
    const tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.dataset.plugin = "dsh-top100-plugin";
    tag.textContent = css;
    document.head.appendChild(tag);
  }
  return () => document.getElementById(STYLE_ID)?.remove();
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    return ctx.locale.register(NS, { zh, en });
  }, "dsh-top100: dictionaries");
  ctx.effect(() => ensureCss(), "dsh-top100: css");
  const t = ctx.locale.bind(NS);

  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "dsh-top100",
        order: 45,
        label: () => t("nav"),
        locale: NS,
        inject: () => ({ t }),
      },
      () => h(PluginErrorBoundary, { t, children: h(RankingsPage, { t }) }),
    ),
  );

  ctx.inject?.(["settingsScope"], (scoped) => {
    const settings = scoped.settingsScope.bind({ namespace: NS });
    // 0.1.6 moved community bundle configuration to the Plugins page.
    // Slot injection waits for its owner, so each host exposes only its own entry.
    scoped.slots.inject("plugins.bundle.config", () =>
      scoped.slots.register(
        {
          name: "plugins.bundle.config",
          key: "@evaldock/dsh-top100-plugin",
          locale: NS,
          inject: () => ({ t }),
        },
        () => h(PluginErrorBoundary, { t, children: h(SettingsCard, { t, settings }) }),
      ),
    );
    scoped.slots.inject("settings.plugin.item", () =>
      scoped.slots.register(
        {
          name: "settings.plugin.item",
          key: "dsh-top100",
          locale: NS,
          inject: () => ({ t }),
        },
        () => h(PluginErrorBoundary, { t, children: h(SettingsCard, { t, settings }) }),
      ),
    );
  });
}
