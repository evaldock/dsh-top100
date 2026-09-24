/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { DEFAULT_DATA_URL } from "./host/catalog.js";
import type { PluginResolvedConfig } from "./host/contracts.js";
import { resolveActiveProfile } from "./host/profile.js";
import { configValue, editableSchema, resolvedConfig, type ConfigValue } from "./host/live-config.js";
import { restartCapability } from "./host/restart.js";
import { readRuntimeStatus } from "./host/runtime-status.js";
import { mountRoutes } from "./host/routes.js";
import { installRecommendationCapabilities } from "./host/recommendations.js";
import { createDesktopPluginRuntime, type DesktopPnpmLike } from "./install/dsh-cli.js";

export const name = "dsh-top100";
export const inject = ["skills", "tools"];

export interface Config {
  dataUrl: ConfigValue<string>;
  profile: string;
  allowRestart?: ConfigValue<boolean>;
}

export const Config = z.object({
  allowRestart: editableSchema(z.boolean().default(true)),
  dataUrl: editableSchema(z.string().pattern(/^https?:\/\/[^\s]+$/).default(DEFAULT_DATA_URL)),
  // Empty means "manage the profile this DSH process booted".
  profile: z.string().default(""),
});

interface DesktopProfilesLike {
  readonly current: { readonly name: string; readonly dir: string };
}

export function apply(ctx: Context, config: Config = { dataUrl: DEFAULT_DATA_URL, profile: "" }): void {
  let sharedInstalled = false;
  const installShared = (resolved: PluginResolvedConfig): void => {
    if (sharedInstalled) return;
    sharedInstalled = true;
    void import("./host/settings.js")
      .then((module) => module.installTop100Settings(ctx, resolved))
      .catch(() => undefined);
    installRecommendationCapabilities(ctx, resolved);
  };

  ctx.inject(["webServer"], (hostCtx: Context) => {
    const host = hostCtx as unknown as {
      effect(callback: () => () => void | Promise<void>, label: string): void;
      webServer: Parameters<typeof mountRoutes>[0]["webServer"];
    };
    // desktopProfiles is intentionally detected here, after host services
    // have mounted, matching DSH Desktop's published plugin contract.
    const desktopProfiles = ctx.get("desktopProfiles") as DesktopProfilesLike | undefined;
    if (!desktopProfiles) {
      const resolved = resolvedConfig(config.dataUrl, resolveActiveProfile(config.profile));
      installShared(resolved);
      host.effect(() => mountRoutes({ webServer: host.webServer, restartCapability: () => restartCapability({ currentProfile: resolved.profile === resolveActiveProfile(), allowRestart: config.allowRestart === undefined ? undefined : configValue(config.allowRestart) }), readRuntime: (bundles) => readRuntimeStatus(hostCtx, { isCurrentProfile: resolved.profile === resolveActiveProfile(), bundles }) }, resolved), "dsh-top100: http routes");
      return;
    }
    hostCtx.inject(["desktopPnpm"], (desktopCtx: Context) => {
      const active = desktopProfiles.current;
      const desktopResolved = resolvedConfig(config.dataUrl, active.name, active.dir);
      installShared(desktopResolved);
      const runtime = createDesktopPluginRuntime(
        (desktopCtx as unknown as { desktopPnpm: DesktopPnpmLike }).desktopPnpm,
        active.dir,
      );
      const desktopHost = desktopCtx as unknown as typeof host;
      desktopHost.effect(() => {
        const disposeRoutes = mountRoutes({ webServer: desktopHost.webServer, restartCapability: () => restartCapability({ desktop: true, currentProfile: true }), readRuntime: (bundles) => readRuntimeStatus(desktopCtx, { isCurrentProfile: desktopProfiles.current.dir === active.dir, bundles }) }, desktopResolved, runtime);
        return async () => {
          disposeRoutes();
          await runtime.dispose?.();
        };
      }, "dsh-top100: Desktop http routes and package operations");
    });
  });
}
