/** Spawn `dsh plugin` the same way the official CLI forwards to pnpm. */

import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { isDshProfileName, profileDir } from "../host/profile.js";
import { pluginArgsFor } from "./pnpm-compat.js";
import { SAFE_TARGET_RE } from "./install-spec.js";
import type { InstallResult, ProgressSnapshot } from "../shared/types.js";

const INSTALL_TIMEOUT_MS = Number(process.env.DSH_TOP100_INSTALL_TIMEOUT_MS) || 15 * 60 * 1000;
const PROFILE_CHECK_TIMEOUT_MS = Number(process.env.DSH_TOP100_PROFILE_CHECK_TIMEOUT_MS) || 60 * 1000;
const CMD_METACHARS = /[\s"&|<>^()%!]/;
const winCmdShim = process.platform === "win32";
const COMSPEC = process.env.ComSpec ?? "cmd.exe";

export function toolSearchDirs(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string[] {
  const directories: string[] = [];
  if (env.PNPM_HOME?.trim()) directories.push(env.PNPM_HOME.trim());
  if (platform === "win32") {
    if (env.LOCALAPPDATA?.trim()) directories.push(join(env.LOCALAPPDATA.trim(), "pnpm"));
    if (env.APPDATA?.trim()) directories.push(join(env.APPDATA.trim(), "npm"));
  } else {
    directories.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
      join(home, ".local", "bin"),
      join(home, "Library", "pnpm"),
      join(home, ".local", "share", "pnpm"),
    );
  }
  directories.push(dirname(nodeExecutable()));
  return [...new Set(directories.filter(Boolean))];
}

export function proxyEnvForPnpm(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = {};
  const httpsProxy = env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY;
  const httpProxy = env.http_proxy || env.HTTP_PROXY || httpsProxy;
  const noProxy = env.no_proxy || env.NO_PROXY;
  if (httpsProxy && !env.npm_config_https_proxy) output.npm_config_https_proxy = httpsProxy;
  if (httpProxy && !env.npm_config_proxy) output.npm_config_proxy = httpProxy;
  if (noProxy && !env.npm_config_noproxy) output.npm_config_noproxy = noProxy;
  return output;
}

function spawnEnvironment(): NodeJS.ProcessEnv {
  const paths = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const directory of toolSearchDirs()) {
    if (!paths.includes(directory)) paths.push(directory);
  }
  return {
    ...process.env,
    ...proxyEnvForPnpm(),
    CI: "true",
    PATH: paths.join(delimiter),
  };
}

export const progress: ProgressSnapshot = {
  active: false,
  fullName: null,
  spec: null,
  lastLine: "",
  startedAt: null,
  error: null,
};

export type PluginRunner = (
  profile: string,
  pluginArgs: string[],
  meta?: { fullName?: string },
) => Promise<InstallResult>;

export interface PluginCommandRuntime {
  runPlugin: PluginRunner;
  checkProfile?(profile: string): Promise<InstallResult>;
  cancelActive(): boolean;
  dispose?(): Promise<void>;
}

export interface DesktopPnpmHandleLike {
  readonly stdout: NodeJS.ReadableStream;
  readonly stderr: NodeJS.ReadableStream;
  readonly done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; timedOut?: boolean }>;
  cancel(): void;
}

/** Structural subset of DSH Desktop's public desktopPnpm service. */
export interface DesktopPnpmLike {
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandleLike;
  runExternalMarketPluginInstall?(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DesktopPnpmHandleLike;
}

let activeChild: ChildProcess | null = null;
let cancelRequested = false;

function nodeExecutable(argv0 = process.argv0, execPath = process.execPath): string {
  if (argv0 && isAbsolute(argv0) && existsSync(argv0)) return argv0;
  return execPath;
}

export function quoteCmdArg(arg: string): string {
  if (!CMD_METACHARS.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

export function cmdCommandLine(argv: readonly string[]): string {
  return argv.map(quoteCmdArg).join(" ");
}

/** Prevent cmd.exe environment expansion in the rare Windows shim fallback. */
export function isCmdSafeProfileName(profile: string): boolean {
  return isDshProfileName(profile) && /^[\p{L}\p{M}\p{N}._ -]+$/u.test(profile);
}

/** Keep Node loader/runtime flags, but never forward wrapper-only eval flags to the DSH child. */
export function safeExecArgv(argv: readonly string[]): string[] {
  const filtered: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print" || arg === "--input-type") {
      index += 1;
      continue;
    }
    if (/^(?:--eval|--print|--input-type)=/.test(arg)) continue;
    filtered.push(arg);
  }
  return filtered;
}

function spawnShim(file: string, args: readonly string[], options: SpawnOptions & { viaShell?: boolean }): ChildProcess {
  const { viaShell = false, ...spawnOptions } = options;
  if (!viaShell || process.platform !== "win32") {
    return spawn(file, [...args], { ...spawnOptions, shell: false });
  }
  return spawn(COMSPEC, ["/d", "/s", "/c", `"${cmdCommandLine([file, ...args])}"`], {
    ...spawnOptions,
    shell: false,
    windowsVerbatimArguments: true,
  });
}

export function dshArgv(): { file: string; args: string[]; cwd: string | undefined; viaShell: boolean } {
  const entry = process.argv[1];
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    const abs = resolve(entry);
    return { file: nodeExecutable(), args: [...safeExecArgv(process.execArgv), abs], cwd: dirname(abs), viaShell: false };
  }
  return { file: "dsh", args: [], cwd: undefined, viaShell: winCmdShim };
}

function killTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    } catch {
      /* fall through */
    }
  }
  const signalTree = (signal: NodeJS.Signals): void => {
    if (child.pid === undefined) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    }
  };
  signalTree("SIGTERM");
  const escalate = setTimeout(() => signalTree("SIGKILL"), 5000);
  escalate.unref?.();
}

export function cancelActive(): boolean {
  if (activeChild === null) return false;
  cancelRequested = true;
  killTree(activeChild);
  return true;
}

/** Each stream and operation owns its pending line and UTF-8 decoder. */
function progressLineReader() {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let ended = false;
  const publish = (): void => {
    if (pending.trim()) progress.lastLine = pending.trim();
    pending = "";
  };
  const consume = (text: string): void => {
    const parts = text.split(/[\r\n]/);
    for (let index = 0; index < parts.length; index += 1) {
      // The display has always kept only the first 200 characters; also
      // bound the buffer when a process emits a very long unfinished line.
      pending = (pending + parts[index]).slice(0, 200);
      if (index < parts.length - 1) publish();
    }
  };
  return {
    write(chunk: string | Buffer): void {
      if (!ended) consume(decoder.write(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    },
    end(): void {
      if (ended) return;
      ended = true;
      consume(decoder.end());
      publish();
    },
  };
}

export function runDshPlugin(
  profile: string,
  pluginArgs: string[],
  meta?: { fullName?: string },
): Promise<InstallResult> {
  pluginArgs = pluginArgsFor(profileDir(profile), pluginArgs);
  const target = pluginArgs[pluginArgs.length - 1] ?? "";
  if (!SAFE_TARGET_RE.test(target)) {
    return Promise.resolve({
      exitCode: 1,
      timedOut: false,
      stdout: "",
      stderr: `unsafe plugin target rejected: ${JSON.stringify(target)}`,
      cancelled: false,
    });
  }

  const { file, args, cwd, viaShell } = dshArgv();
  if (viaShell && !isCmdSafeProfileName(profile)) {
    return Promise.resolve({
      exitCode: 1,
      timedOut: false,
      stdout: "",
      stderr: `profile name is unsafe for the Windows cmd shim: ${JSON.stringify(profile)}`,
      cancelled: false,
    });
  }
  progress.active = true;
  progress.fullName = meta?.fullName ?? null;
  progress.spec = target;
  progress.lastLine = "";
  progress.startedAt = Date.now();
  progress.error = null;
  cancelRequested = false;

  return new Promise((resolvePromise) => {
    const child = spawnShim(file, [...args, "plugin", "--profile", profile, ...pluginArgs], {
      cwd,
      env: spawnEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      viaShell,
      detached: process.platform !== "win32",
    });
    activeChild = child;
    let stdout = "";
    let stderr = "";
    const stdoutLines = progressLineReader();
    const stderrLines = progressLineReader();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, INSTALL_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout = (stdout + text).slice(-256 * 1024);
      stdoutLines.write(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-64 * 1024);
      stderrLines.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      stdoutLines.end();
      stderrLines.end();
      progress.active = false;
      progress.error = error.message;
      if (activeChild === child) activeChild = null;
      resolvePromise({
        exitCode: 127,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        cancelled: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      stdoutLines.end();
      stderrLines.end();
      progress.active = false;
      if (activeChild === child) activeChild = null;
      if (code !== 0 || timedOut) progress.error = stderr.slice(-200) || `exit ${String(code)}`;
      resolvePromise({
        exitCode: code,
        timedOut,
        stdout,
        stderr,
        cancelled: cancelRequested,
      });
    });
  });
}

/** Compose the selected profile without starting it, using the exact CLI that launched this plugin. */
export function runDshProfileCheck(profile: string): Promise<InstallResult> {
  const { file, args, cwd, viaShell } = dshArgv();
  if (viaShell && !isCmdSafeProfileName(profile)) {
    return Promise.resolve({
      exitCode: 1,
      timedOut: false,
      stdout: "",
      stderr: `profile name is unsafe for the Windows cmd shim: ${JSON.stringify(profile)}`,
      cancelled: false,
    });
  }
  return new Promise((resolvePromise) => {
    const child = spawnShim(file, [...args, "--profile", profile, "--dump-config"], {
      cwd,
      env: spawnEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      viaShell,
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: InstallResult): void => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, PROFILE_CHECK_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString()).slice(-256 * 1024);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-64 * 1024);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        exitCode: 127,
        timedOut: false,
        stdout,
        stderr: `${stderr}\n${error.message}`,
        cancelled: false,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({ exitCode: code, timedOut, stdout, stderr, cancelled: false });
    });
  });
}

const EXACT_NPM_TARGET_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const NPM_ONLY_DESKTOP_NOTE = "该桌面客户端的安装边界只接受已发布到 npm 的插件；GitHub-only 插件请改用普通 dsh web 安装。";

async function exactDesktopNpmArgs(args: readonly string[], signal: AbortSignal): Promise<string[] | null> {
  const targets = args.slice(1).filter((argument) => !argument.startsWith("-"));
  const target = targets[0];
  if (targets.length !== 1 || target === undefined) return null;
  if (EXACT_NPM_TARGET_RE.test(target)) return [...args];
  const at = target.lastIndexOf("@");
  const scopedSlash = target.startsWith("@") ? target.indexOf("/") : -1;
  const hasSelector = at > 0 && (scopedSlash === -1 || at > scopedSlash);
  const name = hasSelector ? target.slice(0, at) : target;
  const selector = hasSelector ? target.slice(at + 1) : "latest";
  if (!NPM_NAME_RE.test(name)) return null;
  try {
    const encoded = name.startsWith("@") ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
    const response = await fetch(`https://registry.npmjs.org/${encoded}/${encodeURIComponent(selector)}`, {
      headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) return null;
    const version = (await response.json() as { version?: unknown }).version;
    if (typeof version !== "string") return null;
    const exact = `${name}@${version}`;
    return EXACT_NPM_TARGET_RE.test(exact)
      ? args.map((argument) => (argument === target ? exact : argument))
      : null;
  } catch {
    return null;
  }
}

/** Adapt DSH Desktop's generation-scoped pnpm service to route orchestration. */
export function createDesktopPluginRuntime(
  service: DesktopPnpmLike,
  activeProfileDir: string,
  invokingDir = process.cwd(),
  timeoutMs = INSTALL_TIMEOUT_MS,
): PluginCommandRuntime {
  if (!isAbsolute(activeProfileDir) || activeProfileDir.includes("\0")) {
    throw new Error("dsh-top100: Desktop profile directory must be an absolute path without NUL");
  }
  if (!isAbsolute(invokingDir) || invokingDir.includes("\0")) {
    throw new Error("dsh-top100: Desktop invoking directory must be an absolute path without NUL");
  }
  let closed = false;
  interface DesktopOperation {
    handle: DesktopPnpmHandleLike | null;
    abort: AbortController;
    done: Promise<InstallResult>;
    cancelled: boolean;
  }
  let active: DesktopOperation | null = null;

  const runPlugin: PluginRunner = async (_profile, originalArgs, meta) => {
    if (closed) return { exitCode: 127, timedOut: false, stdout: "", stderr: "Desktop package runtime is disposed", cancelled: false };
    if (active) return { exitCode: 127, timedOut: false, stdout: "", stderr: "Desktop package operation is already active", cancelled: false };
    const args = pluginArgsFor(activeProfileDir, originalArgs);
    const target = args[args.length - 1] ?? "";
    if (!SAFE_TARGET_RE.test(target)) {
      return { exitCode: 1, timedOut: false, stdout: "", stderr: `unsafe plugin target rejected: ${JSON.stringify(target)}`, cancelled: false };
    }
    const abort = new AbortController();
    // Own the operation before the first await, including target resolution.
    // Teardown must await preparation too, even before the host returns a handle.
    let settle!: (result: InstallResult) => void;
    const done = new Promise<InstallResult>((resolve) => { settle = resolve; });
    const operation: DesktopOperation = { handle: null, abort, done, cancelled: false };
    active = operation;

    progress.active = true;
    progress.fullName = meta?.fullName ?? null;
    progress.spec = target;
    progress.lastLine = "";
    progress.startedAt = Date.now();
    progress.error = null;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const stdoutLines = progressLineReader();
    const stderrLines = progressLineReader();
    const onStdout = (chunk: string | Buffer): void => { const text = chunk.toString(); stdout = (stdout + text).slice(-256 * 1024); stdoutLines.write(chunk); };
    const onStderr = (chunk: string | Buffer): void => { const text = chunk.toString(); stderr = (stderr + text).slice(-64 * 1024); stderrLines.write(chunk); };
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort(new Error("Desktop package operation timed out"));
      operation.handle?.cancel();
    }, timeoutMs);
    timer.unref?.();
    void (async (): Promise<InstallResult> => {
      let boundaryRefusesTarget = false;
      try {
        const boundary = args[0] === "add" ? service.runExternalMarketPluginInstall : undefined;
        const boundaryArgs = boundary ? await exactDesktopNpmArgs(args, abort.signal) : null;
        abort.signal.throwIfAborted();
        boundaryRefusesTarget = boundary !== undefined && boundaryArgs === null;
        const handle = boundary && boundaryArgs
          ? boundary.call(service, boundaryArgs, invokingDir, abort.signal)
          : service.runPlugin(args, invokingDir, abort.signal);
        operation.handle = handle;
        handle.stdout.on("data", onStdout);
        handle.stderr.on("data", onStderr);
        // A host service may synchronously trigger disposal while returning its handle.
        if (abort.signal.aborted) handle.cancel();
        const outcome = await handle.done;
        timedOut ||= outcome.timedOut === true;
        const exitCode = outcome.exitCode;
        if (exitCode !== 0 || timedOut) progress.error = stderr.slice(-200) || `exit ${exitCode}`;
        return { exitCode, timedOut, stdout, stderr, cancelled: operation.cancelled };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = boundaryRefusesTarget ? `${message}\n${NPM_ONLY_DESKTOP_NOTE}` : message;
        progress.error = message;
        return { exitCode: 127, timedOut, stdout, stderr: `${stderr}${stderr ? "\n" : ""}${detail}`, cancelled: operation.cancelled };
      } finally {
        clearTimeout(timer);
        operation.handle?.stdout.off("data", onStdout);
        operation.handle?.stderr.off("data", onStderr);
        stdoutLines.end();
        stderrLines.end();
        progress.active = false;
        if (active === operation) active = null;
      }
    })().then(settle);
    return done;
  };

  return {
    runPlugin,
    cancelActive: () => {
      if (!active) return false;
      active.cancelled = true;
      active.abort.abort(new Error("cancelled"));
      active.handle?.cancel();
      return true;
    },
    dispose: async () => {
      closed = true;
      if (!active) return;
      const operation = active;
      operation.abort.abort(new Error("disposed"));
      operation.handle?.cancel();
      await operation.done;
    },
  };
}
