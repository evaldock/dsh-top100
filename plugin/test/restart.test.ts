import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { progress } from "../src/install/dsh-cli.js";
import * as restart from "../src/host/restart.js";
import { mountRoutes } from "../src/host/routes.js";
import { waitForRestart } from "../src/client/restart-client.js";

function request(headers: Record<string, string> = {}, address = "127.0.0.1") {
  return { method: "POST", headers: { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080", ...headers }, socket: { remoteAddress: address, localPort: 3080 } } as IncomingMessage;
}
afterEach(() => { progress.active = false; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("restart boundary", () => {
  it("accepts direct same-origin loopback only, rejecting proxy and rebinding requests", () => {
    expect(restart.trustedRestartRequest(request())).toBe(true);
    expect(restart.trustedRestartRequest(request({}, "::1"))).toBe(true);
    for (const headers of [
      { origin: "http://evil.example" }, { host: "evil.example", origin: "http://evil.example" },
      { origin: "file://127.0.0.1:3080" }, { "x-forwarded-host": "localhost" },
      { "x-forwarded-for": "127.0.0.1" }, { forwarded: "for=127.0.0.1" }, { "x-real-ip": "127.0.0.1" }, { origin: "" },
    ]) expect(restart.trustedRestartRequest(request(headers))).toBe(false);
    expect(restart.trustedRestartRequest(request({}, "192.168.1.2"))).toBe(false);
    expect(restart.trustedRestartRequest(request({ origin: "" }), false)).toBe(true);
  });
  it("does not take control of Desktop, other profiles, debuggers or service managers", () => {
    const base = { currentProfile: true, env: {}, argv: ["node", "/missing/bin.js", "web"], execArgv: [], inspectorUrl: null };
    expect(restart.restartCapability({ ...base, desktop: true }).reason).toBe("desktop");
    expect(restart.restartCapability({ ...base, currentProfile: false }).reason).toBe("profile");
    expect(restart.restartCapability({ ...base, allowRestart: false }).reason).toBe("disabled");
    expect(restart.restartCapability({ ...base, env: { pm_id: "1" } }).reason).toBe("supervised");
    expect(restart.restartCapability({ ...base, execArgv: ["--inspect=9229"] }).reason).toBe("debugger");
    expect(restart.restartCapability({ ...base, env: { NODE_OPTIONS: "--inspect-brk" } }).reason).toBe("debugger");
    expect(restart.restartCapability(base).reason).toBe("launcher");
  });
  it("blocks active work, waits for helper readiness, and locks mutations until handoff", async () => {
    const handlers = new Map<string, (req: IncomingMessage, res: ServerResponse) => unknown>();
    const dispose = mountRoutes({ webServer: { register(route) { handlers.set(route.path, route.handler); return () => {}; } }, restartCapability: () => ({ available: true }) }, { profile: "restart-test", dataUrl: "https://example.com" });
    const call = async (path: string, req = request()) => {
      let status = 0; let body: any;
      const response = Object.assign(new EventEmitter(), { writableFinished: false, writeHead(value: number) { status = value; }, end(value: string) { body = JSON.parse(value); } });
      await handlers.get(path)!(req, response as unknown as ServerResponse);
      return { status, body, response };
    };
    const commit = vi.fn(), cancel = vi.fn();
    const prepare = vi.spyOn(restart, "prepareRestart").mockResolvedValue({ commit, cancel });
    try {
      expect((await call("/dsh-top100/restart", request({ origin: "http://other" }))).status).toBe(403);
      progress.active = true;
      expect((await call("/dsh-top100/restart")).status).toBe(409);
      expect(prepare).not.toHaveBeenCalled(); progress.active = false;
      prepare.mockRejectedValueOnce(new Error("spawn failed"));
      expect((await call("/dsh-top100/restart")).status).toBe(503);
      const accepted = await call("/dsh-top100/restart");
      expect(accepted.status).toBe(202); expect(commit).not.toHaveBeenCalled();
      expect((await call("/dsh-top100/toggle")).status).toBe(409);
      expect((await call("/dsh-top100/restart")).status).toBe(409);
      accepted.response.emit("close"); expect(cancel).toHaveBeenCalledOnce();
      const next = await call("/dsh-top100/restart"); expect(next.status).toBe(202);
      next.response.emit("finish"); expect(commit).toHaveBeenCalledOnce();
      next.response.emit("close"); // Reset the mock's unfinished response for other tests.
    } finally { dispose(); }
  });
});
describe("restart completion", () => {
  it("requires a new boot to stay healthy, and ignores the old process's HTTP 200", async () => {
    vi.useFakeTimers();
    let bootId = "old";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ bootId }))));
    const controller = new AbortController(); let complete = false;
    const waiting = waitForRestart("old", controller.signal).then(() => { complete = true; });
    await vi.advanceTimersByTimeAsync(3000); expect(complete).toBe(false);
    bootId = "new"; await vi.advanceTimersByTimeAsync(7000); expect(complete).toBe(false);
    await vi.advanceTimersByTimeAsync(2000); await waiting; expect(complete).toBe(true);
  });
  it("times out rather than reporting success when the host never comes back", async () => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const waiting = expect(waitForRestart("old", new AbortController().signal, 3000)).rejects.toThrow("restartTimeout");
    await vi.advanceTimersByTimeAsync(3500); await waiting;
  });
});
