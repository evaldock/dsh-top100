/** Local Web restart handoff. Inspired by dsh-market's detached helper design. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import inspector from "node:inspector";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export type RestartReason = "desktop" | "profile" | "disabled" | "supervised" | "debugger" | "launcher" | "remote";
export interface RestartCapability { available: boolean; reason?: RestartReason }

export function trustedRestartRequest(request: Pick<IncomingMessage, "headers" | "socket">, requireOrigin = true): boolean {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket?.remoteAddress ?? "")) return false;
  if (Object.keys(request.headers).some((key) => key === "forwarded" || key.startsWith("x-forwarded-") || key === "x-real-ip")) return false;
  const host = request.headers.host;
  if (!host || !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  const origin = request.headers.origin;
  if (!origin) return !requireOrigin;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === host && url.username === "" && url.password === "";
  } catch { return false; }
}

export function restartCapability(options: {
  desktop?: boolean; currentProfile: boolean; allowRestart?: boolean;
  env?: NodeJS.ProcessEnv; argv?: string[]; execArgv?: string[]; inspectorUrl?: string | null;
}): RestartCapability {
  const no = (reason: RestartReason): RestartCapability => ({ available: false, reason });
  const env = options.env ?? process.env;
  if (options.desktop) return no("desktop");
  if (!options.currentProfile) return no("profile");
  if (options.allowRestart === false || env.DSH_TOP100_ALLOW_RESTART === "0") return no("disabled");
  // A managed service must keep its process ownership; never guess its restart command.
  let systemdParent = process.ppid === 1;
  try { systemdParent ||= readFileSync(`/proc/${process.ppid}/comm`, "utf8").trim() === "systemd"; } catch { /* non-Linux */ }
  if (((env.INVOCATION_ID || env.JOURNAL_STREAM) && systemdParent) || env.pm_id || env.PM2_HOME || env.SUPERVISOR_ENABLED || env.LAUNCH_JOBKEY) return no("supervised");
  const flags = [...(options.execArgv ?? process.execArgv), ...(env.NODE_OPTIONS ?? "").split(/\s+/)];
  if ((options.inspectorUrl === undefined ? inspector.url() : options.inspectorUrl) || flags.some((flag) => /^--(?:inspect|debug)(?:[-=]|$)/.test(flag))) return no("debugger");
  const argv = options.argv ?? process.argv;
  if (!argv[1] || !/[\\/](?:bin\.(?:js|ts)|dsh)$/.test(argv[1]) || !argv.includes("web") || !existsSync(resolve(argv[1]))) return no("launcher");
  return { available: true };
}

export interface RestartHandoff { commit(): void | Promise<void>; cancel(): void }

/** Wait for helper readiness before acknowledging or terminating the host. No shell invocation or credentials written to disk. */
export function prepareRestart(port: number): Promise<RestartHandoff> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.reject(new Error("invalid restart port"));
  const args = [...process.execArgv, ...process.argv.slice(1)];
  const trace = join(mkdtempSync(join(tmpdir(), "dsh-top100-restart-")), "status.json");
  // A random-port development host must come back on the browser's current address.
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1] === "0") args[i + 1] = String(port);
    if (args[i] === "--port=0") args[i] = `--port=${port}`;
  }
  return new Promise((accept, reject) => {
    const helper = spawn(process.execPath, [fileURLToPath(new URL("./restart-helper.js", import.meta.url))], {
      detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const timeout = setTimeout(() => { helper.kill(); reject(new Error("restart helper did not become ready")); }, 5000);
    helper.once("error", () => { clearTimeout(timeout); reject(new Error("restart helper could not start")); });
    helper.once("exit", () => { clearTimeout(timeout); reject(new Error("restart helper exited")); });
    helper.once("message", (message) => {
      if (message !== "ready") return;
      clearTimeout(timeout);
      let used = false;
      accept({
        cancel() { if (!used) { used = true; helper.kill(); } },
        commit() {
          if (used) return;
          used = true;
          return new Promise<void>((done, fail) => {
            const timer = setTimeout(() => { helper.kill(); fail(new Error("restart handoff failed")); }, 5000);
            helper.once("message", (ack) => {
              if (ack !== "armed") return;
              clearTimeout(timer); helper.disconnect(); helper.unref();
              setTimeout(() => process.kill(process.pid, "SIGTERM"), 200);
              done();
            });
            helper.send({ pid: process.pid, file: process.execPath, args, cwd: process.cwd(), port, env: process.env, trace }, (error) => {
              if (error) { clearTimeout(timer); helper.kill(); fail(new Error("restart handoff failed")); }
            });
          });
        },
      });
    });
  });
}
