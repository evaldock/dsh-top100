import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopProfileRuntime, type DesktopProfileContext, type DesktopProfileModules } from "../src/host/desktop-profile.js";

const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "top100-desktop-context-"));
  directories.push(dir);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }));
  const profile: DesktopProfileContext = { name: "desktop", dir, home: join(dir, "home"),
    cwd: dir, installAnchor: join(dir, "runtime", "package.json"), patchPath: join(dir, "cordis.patch.yml"),
    startedBundles: [], overlays: [], packageManager: { command: "/Applications/DSH App/node", args: ["--expose-internals", "/Applications/DSH App/pnpm.mjs"], env: { PATH: "/bundled/bin", ELECTRON_RUN_AS_NODE: "1" } } };
  const api: DesktopProfileModules = {
    runPluginCommand: vi.fn(async () => ({ exitCode: 0 })),
    loadProfileDirectory: vi.fn(() => ({ skippedBundles: [] })),
    readProfilePatches: vi.fn(() => []), composeEntries: vi.fn(),
  };
  return { profile, api };
}

describe("official Desktop profile runtime", () => {
  it("uses the current directory and bundled manager with official locking and captured service output", async () => {
    const { profile, api } = fixture();
    api.runPluginCommand = vi.fn(async (_context, _args, options) => {
      options.onOutput("installed\n", "stdout"); options.onOutput("diagnostic\n", "stderr");
      return { exitCode: 0 };
    });
    const runtime = createDesktopProfileRuntime(profile, async () => api);
    expect(await runtime.runPlugin("desktop", ["add", "demo@1.0.0"])).toMatchObject({ exitCode: 0, stdout: "installed\n", stderr: "diagnostic\n" });
    expect(api.runPluginCommand).toHaveBeenCalledWith({ profile: "desktop", dir: profile.dir, installAnchor: profile.installAnchor, cwd: profile.cwd, home: profile.home }, ["add", "--save-exact", "demo@1.0.0"], expect.objectContaining({
      ...profile.packageManager, execution: "service", lockWaitMs: 120_000, signal: expect.any(AbortSignal),
    }));
    await runtime.dispose?.();
  });
  it("cannot target web or recreate a deleted Desktop profile", async () => {
    const { profile, api } = fixture();
    const runtime = createDesktopProfileRuntime(profile, async () => api);
    expect(await runtime.runPlugin("web", ["remove", "demo"])).toMatchObject({ exitCode: 1 });
    rmSync(join(profile.dir, "package.json"));
    expect(await runtime.runPlugin("desktop", ["remove", "demo"])).toMatchObject({ exitCode: 1 });
    expect(api.runPluginCommand).not.toHaveBeenCalled();
  });
  it("does not fall back to a PATH dsh or pnpm when bundled tooling is absent", async () => {
    const { profile, api } = fixture();
    const runtime = createDesktopProfileRuntime({ ...profile, packageManager: undefined }, async () => api);
    expect(await runtime.runPlugin("desktop", ["remove", "demo"])).toMatchObject({ exitCode: 127, stderr: expect.stringContaining("bundled package manager") });
    expect(api.runPluginCommand).not.toHaveBeenCalled();
  });
  it("propagates package failure and idle timeout without claiming success", async () => {
    const { profile, api } = fixture();
    api.runPluginCommand = vi.fn(async () => ({ exitCode: 1, timedOut: true }));
    const runtime = createDesktopProfileRuntime(profile, async () => api);
    expect(await runtime.runPlugin("desktop", ["remove", "demo"])).toMatchObject({ exitCode: 1, timedOut: true });
  });
  it("cancels in-flight official operations and waits for their teardown", async () => {
    const { profile, api } = fixture();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let exited = false;
    api.runPluginCommand = vi.fn((_context, _args, options) => new Promise(resolve => {
      options.signal!.addEventListener("abort", () => { exited = true; resolve({ exitCode: 1 }); }, { once: true });
      started();
    }));
    const runtime = createDesktopProfileRuntime(profile, async () => api);
    const run = runtime.runPlugin("desktop", ["remove", "demo"]);
    await ready;
    expect(runtime.cancelActive()).toBe(true);
    await runtime.dispose?.();
    expect(exited).toBe(true);
    expect(await run).toMatchObject({ cancelled: true });
    expect(await runtime.runPlugin("desktop", ["remove", "demo"])).toMatchObject({ exitCode: 127 });
  });
  it("does not start an operation after disposal during module loading", async () => {
    const { profile, api } = fixture();
    let release!: (api: DesktopProfileModules) => void;
    const runtime = createDesktopProfileRuntime(profile, () => new Promise(resolve => { release = resolve; }));
    const run = runtime.runPlugin("desktop", ["remove", "demo"]);
    const disposed = runtime.dispose?.();
    release(api);
    await disposed;
    expect(await run).toMatchObject({ exitCode: 127 });
    expect(api.runPluginCommand).not.toHaveBeenCalled();
  });
  it("validates host-owned bundles and composed patches with the actual installation anchor", async () => {
    const { profile, api } = fixture();
    const runtime = createDesktopProfileRuntime(profile, async () => api);
    expect(await runtime.checkProfile?.("desktop")).toMatchObject({ exitCode: 0 });
    expect(api.loadProfileDirectory).toHaveBeenCalledWith("dsh", profile.dir, profile.installAnchor);
    expect(api.readProfilePatches).toHaveBeenCalledWith("dsh", profile);
    expect(api.composeEntries).toHaveBeenCalledWith([[]]);
    api.loadProfileDirectory = () => ({ skippedBundles: [{ packageName: "broken", reason: "invalid patch" }] });
    expect(await runtime.checkProfile?.("desktop")).toMatchObject({ exitCode: 1, stderr: "broken: invalid patch" });
  });
  it("reports malformed composed patches and module resolution failures", async () => {
    const { profile, api } = fixture();
    api.composeEntries = () => { throw new Error("invalid overlay"); };
    const runtime = createDesktopProfileRuntime(profile, async () => api);
    expect(await runtime.checkProfile?.("desktop")).toMatchObject({ exitCode: 1, stderr: "invalid overlay" });
    const unavailable = createDesktopProfileRuntime(profile, async () => { throw new Error("missing host API"); });
    expect(await unavailable.runPlugin("desktop", ["remove", "demo"])).toMatchObject({ exitCode: 127, stderr: "missing host API" });
  });
});
