import { Context } from "@deepseek-ai/cordis";
import { SettingsProvider } from "@deepseek-ai/dsh-settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installTop100Settings, TOP100_SETTINGS_NS } from "../src/host/settings.js";
import type { PluginResolvedConfig } from "../src/host/contracts.js";

/** Real rc.2 registration, resolution, validation and lifecycle; only storage is in memory. */
class MemorySettings extends SettingsProvider {
  readonly writable = true;
  stored: Record<string, unknown>;
  readonly writes: { namespace: string; section: Record<string, unknown> }[] = [];

  constructor(ctx: Context, initial: Record<string, unknown> = {}) {
    super(ctx);
    this.stored = structuredClone(initial);
  }

  protected async load(): Promise<Record<string, unknown>> {
    return structuredClone(this.stored);
  }

  protected async persist(namespace: string, section: Record<string, unknown>): Promise<void> {
    this.stored[namespace] = structuredClone(section);
    this.writes.push({ namespace, section: structuredClone(section) });
  }
}

const entryUrl = "https://entry.example/data";
const storedUrl = "https://stored.example/data";
const changedUrl = "https://changed.example/data";
const fibers = new Set<{ dispose(): Promise<unknown> }>();
function track<T extends { dispose(): Promise<unknown> }>(fiber: T): T {
  fibers.add(fiber);
  return fiber;
}
async function dispose(fiber: { dispose(): Promise<unknown> }): Promise<void> {
  fibers.delete(fiber);
  await fiber.dispose();
}
function config(): PluginResolvedConfig { return { dataUrl: entryUrl, profile: "web" }; }
async function owner(ctx: Context, resolved: PluginResolvedConfig) {
  return track(await ctx.plugin((scope) => installTop100Settings(scope, resolved)));
}
async function provider(ctx: Context, dataUrl = storedUrl) {
  const fiber = track(await ctx.plugin(MemorySettings, { [TOP100_SETTINGS_NS]: { dataUrl } }));
  return { fiber, settings: ctx.settings as MemorySettings };
}
afterEach(async () => {
  for (const fiber of [...fibers].reverse()) await dispose(fiber);
  vi.restoreAllMocks();
});

describe("optional Top100 settings with the real DSH rc.2 provider", () => {
  it("leaves Config-derived forms to the DSH 0.1.7 host", () => {
    const resolved = config();
    const scope = { get: () => ({ describe: () => [] }) };
    const ctx = { inject(_services: string[], callback: (scoped: unknown) => void) { callback(scope); } } as unknown as Context;
    expect(() => installTop100Settings(ctx, resolved)).not.toThrow();
    expect(resolved.dataUrl).toBe(entryUrl);
  });
  it("keeps the composition entry and active owner when the optional provider is absent", async () => {
    const ctx = new Context(), resolved = config();
    const active = await owner(ctx, resolved);
    expect(active.state).toBe(2);
    expect(ctx.get("settings")).toBeUndefined();
    expect(resolved).toEqual({ dataUrl: entryUrl, profile: "web" });
  });

  it("registers exactly one namespace and layers initial stored settings over the entry", async () => {
    const ctx = new Context(), resolved = config();
    const { settings } = await provider(ctx);
    await owner(ctx, resolved);
    await expect.poll(() => resolved.dataUrl).toBe(storedUrl);
    expect(settings.describe()).toHaveLength(1);
    expect(settings.get(TOP100_SETTINGS_NS)).toEqual({ dataUrl: storedUrl });
    expect(settings.writes).toHaveLength(0);
    expect(resolved.profile).toBe("web");
  });

  it("attaches a provider registered after the optional consumer", async () => {
    const ctx = new Context(), resolved = config();
    const active = await owner(ctx, resolved);
    expect(resolved.dataUrl).toBe(entryUrl);
    const { settings } = await provider(ctx);
    await expect.poll(() => resolved.dataUrl).toBe(storedUrl);
    expect(active.state).toBe(2);
    expect(settings.describe()).toHaveLength(1);
  });

  it("applies valid updates and rejects invalid URLs before overwriting storage or resolved config", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
    const ctx = new Context(), resolved = config();
    const { settings } = await provider(ctx);
    await owner(ctx, resolved);
    await expect.poll(() => resolved.dataUrl).toBe(storedUrl);
    await settings.update(TOP100_SETTINGS_NS, { dataUrl: `${changedUrl}///` });
    await expect.poll(() => resolved.dataUrl).toBe(changedUrl);
    expect(settings.writes).toHaveLength(1);
    for (const dataUrl of ["file:///private/catalog.json", "javascript:alert(1)", "not-a-url"]) {
      await expect(settings.update(TOP100_SETTINGS_NS, { dataUrl })).rejects.toThrow();
      expect(resolved.dataUrl).toBe(changedUrl);
      expect(settings.get(TOP100_SETTINGS_NS)).toEqual({ dataUrl: `${changedUrl}///` });
      expect(settings.stored[TOP100_SETTINGS_NS]).toEqual({ dataUrl: `${changedUrl}///` });
      expect(settings.writes).toHaveLength(1);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("restores the original entry on provider detach and uses the newly mounted provider", async () => {
    const ctx = new Context(), resolved = config();
    const active = await owner(ctx, resolved);
    const first = await provider(ctx);
    await expect.poll(() => resolved.dataUrl).toBe(storedUrl);
    await first.settings.update(TOP100_SETTINGS_NS, { dataUrl: changedUrl });
    await expect.poll(() => resolved.dataUrl).toBe(changedUrl);
    await dispose(first.fiber);
    await expect.poll(() => resolved.dataUrl).toBe(entryUrl);
    expect(active.state).toBe(2);
    expect(first.settings.describe()).toHaveLength(0);
    const second = await provider(ctx, "https://replacement.example/data");
    await expect.poll(() => resolved.dataUrl).toBe("https://replacement.example/data");
    expect(second.settings.describe()).toHaveLength(1);
  });

  it("removes an unloaded owner's registration and never updates it after reinstall", async () => {
    const ctx = new Context(), previous = config();
    const { settings } = await provider(ctx);
    const firstOwner = await owner(ctx, previous);
    await expect.poll(() => previous.dataUrl).toBe(storedUrl);
    await dispose(firstOwner);
    expect(previous.dataUrl).toBe(storedUrl); // Owner unload is not provider-detach fallback.
    expect(settings.describe()).toHaveLength(0);
    await expect(settings.update(TOP100_SETTINGS_NS, { dataUrl: changedUrl })).rejects.toThrow();
    expect(previous.dataUrl).toBe(storedUrl);
    const replacement = config();
    await owner(ctx, replacement);
    await expect.poll(() => replacement.dataUrl).toBe(storedUrl);
    expect(settings.describe()).toHaveLength(1);
    await settings.update(TOP100_SETTINGS_NS, { dataUrl: changedUrl });
    await expect.poll(() => replacement.dataUrl).toBe(changedUrl);
    expect(previous.dataUrl).toBe(storedUrl);
    expect(settings.describe()).toHaveLength(1);
  });
});
