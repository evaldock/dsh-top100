/** DSH 0.2 Desktop uses launcher-owned profile facts and shared package operations. */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import { createDesktopPluginRuntime } from "../install/dsh-cli.js";
export async function loadDesktopProfileModules(profile) {
    // Resolve from the actual host, never the plugin's development dependencies.
    const require = createRequire(profile.installAnchor);
    const [operations, boot] = await Promise.all([
        import(pathToFileURL(require.resolve("@deepseek-ai/dsh-plugin-manager/operations")).href),
        import(pathToFileURL(require.resolve("@deepseek-ai/dsh-app-boot")).href),
    ]);
    return { runPluginCommand: operations.runPluginCommand, loadProfileDirectory: boot.loadProfileDirectory,
        readProfilePatches: boot.readProfilePatches, composeEntries: boot.composeEntries };
}
export function createDesktopProfileRuntime(profile, loadModules = loadDesktopProfileModules) {
    for (const path of [profile.dir, profile.installAnchor, profile.cwd, profile.home, profile.patchPath]) {
        if (!isAbsolute(path) || path.includes("\0"))
            throw new Error("dsh-top100: invalid Desktop profile location");
    }
    let modules;
    const load = () => modules ??= loadModules(profile);
    const assertProfile = (name) => {
        if (name !== profile.name)
            throw new Error("dsh-top100: Desktop profile changed; reload before continuing");
        if (!existsSync(join(profile.dir, "package.json")))
            throw new Error("dsh-top100: Desktop profile is missing; reopen Desktop first");
    };
    const runtime = createDesktopPluginRuntime({
        runPlugin(args, _cwd, signal) {
            const stdout = new PassThrough();
            const stderr = new PassThrough();
            const abort = new AbortController();
            const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
            const done = (async () => {
                const api = await load();
                combined.throwIfAborted();
                assertProfile(profile.name);
                if (!profile.packageManager)
                    throw new Error("dsh-top100: Desktop did not provide its bundled package manager; reopen or update Desktop");
                const result = await api.runPluginCommand({ profile: profile.name, dir: profile.dir,
                    installAnchor: profile.installAnchor, cwd: profile.cwd, home: profile.home }, args, {
                    ...profile.packageManager, execution: "service", signal: combined, outputBytes: 64 * 1024,
                    lockWaitMs: 120_000, idleTimeoutMs: 600_000, lookupTimeoutMs: 120_000,
                    onOutput: (text, stream) => (stream === "stdout" ? stdout : stderr).write(text),
                });
                return { ...result, signal: null };
            })().finally(() => { stdout.end(); stderr.end(); });
            return { stdout, stderr, done, cancel: () => abort.abort(new Error("cancelled")) };
        },
    }, profile.dir, profile.cwd);
    const failure = (error) => ({ exitCode: 1, timedOut: false, stdout: "",
        stderr: error instanceof Error ? error.message : String(error), cancelled: false });
    return {
        ...runtime,
        async runPlugin(name, args, meta) {
            try {
                assertProfile(name);
            }
            catch (error) {
                return failure(error);
            }
            return runtime.runPlugin(name, args, meta);
        },
        async checkProfile(name) {
            try {
                assertProfile(name);
                const api = await load();
                const loaded = api.loadProfileDirectory("dsh", profile.dir, profile.installAnchor);
                if (loaded.skippedBundles.length)
                    throw new Error(loaded.skippedBundles.map(item => `${item.packageName}: ${item.reason}`).join("\n"));
                api.composeEntries([api.readProfilePatches("dsh", profile)]);
                return { exitCode: 0, timedOut: false, stdout: "", stderr: "", cancelled: false };
            }
            catch (error) {
                return failure(error);
            }
        },
    };
}
