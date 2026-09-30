import { expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";

const captured = vi.hoisted(() => ({ mount: vi.fn(() => vi.fn()), runtime: { runPlugin: vi.fn(), cancelActive: vi.fn(), dispose: vi.fn() }, create: vi.fn() }));
vi.mock("../src/host/routes.js", () => ({ mountRoutes: captured.mount }));
vi.mock("../src/host/recommendations.js", () => ({ installRecommendationCapabilities: vi.fn() }));
vi.mock("../src/host/settings.js", () => ({ installTop100Settings: vi.fn() }));
vi.mock("../src/host/desktop-profile.js", () => ({ createDesktopProfileRuntime: captured.create }));
import { apply } from "../src/index.js";

it("binds the official Desktop context even without legacy services or CLI profile arguments", async () => {
  captured.create.mockReturnValue(captured.runtime);
  const profile = { name: "desktop", dir: "/isolated/profiles/desktop", installAnchor: "/bundled/dsh/package.json" };
  const disposers: Array<() => unknown> = [];
  const ctx = { get: (name: string) => name === "profileContext" ? profile : undefined,
    inject: (_services: string[], callback: (context: unknown) => void) => callback(ctx),
    effect: (callback: () => () => unknown) => disposers.push(callback()), webServer: {},
  };
  let url = "https://example.test/first";
  apply(ctx as unknown as Context, { profile: "web", dataUrl: { get: () => url } });
  expect(captured.create).toHaveBeenCalledWith(profile);
  const [host, config, runtime] = captured.mount.mock.calls.at(-1)! as unknown as [Record<string, () => unknown>, Record<string, unknown>, unknown];
  expect(config).toMatchObject({ profile: "desktop", profileDirectory: profile.dir, installAnchor: profile.installAnchor });
  expect(runtime).toBe(captured.runtime);
  expect(host.restartCapability()).toMatchObject({ available: false, reason: "desktop" });
  url = "https://example.test/second";
  expect(config.dataUrl).toBe(url);
  for (const dispose of disposers) await dispose();
  expect(captured.runtime.dispose).toHaveBeenCalledOnce();
});
