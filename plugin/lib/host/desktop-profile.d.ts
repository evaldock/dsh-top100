import { type PluginCommandRuntime } from "../install/dsh-cli.js";
/** Structural contract keeps old hosts free of new runtime dependencies. */
export interface DesktopProfileContext {
    readonly name: string;
    readonly dir: string;
    readonly installAnchor: string;
    readonly cwd: string;
    readonly home: string;
    readonly patchPath: string;
    readonly startedBundles: readonly string[];
    readonly overlays: readonly unknown[];
    readonly telemetryDisabledEnv?: string;
    readonly packageManager?: {
        readonly command: string;
        readonly args: readonly string[];
        readonly env: Readonly<Record<string, string>>;
    };
}
export interface DesktopProfileModules {
    runPluginCommand(context: {
        profile: string;
        dir: string;
        installAnchor: string;
        cwd: string;
        home: string;
    }, args: readonly string[], options: {
        command: string;
        args: readonly string[];
        env: Readonly<Record<string, string>>;
        execution: "service";
        signal?: AbortSignal;
        outputBytes: number;
        lockWaitMs: number;
        idleTimeoutMs: number;
        lookupTimeoutMs: number;
        onOutput(text: string, stream: "stdout" | "stderr"): void;
    }): Promise<{
        exitCode: number;
        timedOut?: boolean;
    }>;
    loadProfileDirectory(bin: string, dir: string, anchor: string): {
        skippedBundles: Array<{
            packageName: string;
            reason: string;
        }>;
    };
    readProfilePatches(bin: string, context: DesktopProfileContext): unknown[];
    composeEntries(layers: unknown[][]): unknown;
}
export declare function loadDesktopProfileModules(profile: DesktopProfileContext): Promise<DesktopProfileModules>;
export declare function createDesktopProfileRuntime(profile: DesktopProfileContext, loadModules?: typeof loadDesktopProfileModules): PluginCommandRuntime;
