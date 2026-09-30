/** Spawn `dsh plugin` the same way the official CLI forwards to pnpm. */
import type { InstallResult, ProgressSnapshot } from "../shared/types.js";
export declare function toolSearchDirs(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, home?: string): string[];
export declare function proxyEnvForPnpm(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare const progress: ProgressSnapshot;
export type PluginRunner = (profile: string, pluginArgs: string[], meta?: {
    fullName?: string;
}) => Promise<InstallResult>;
export interface PluginCommandRuntime {
    runPlugin: PluginRunner;
    checkProfile?(profile: string): Promise<InstallResult>;
    cancelActive(): boolean;
    dispose?(): Promise<void>;
}
export interface DesktopPnpmHandleLike {
    readonly stdout: NodeJS.ReadableStream;
    readonly stderr: NodeJS.ReadableStream;
    readonly done: Promise<{
        exitCode: number | null;
        signal: NodeJS.Signals | null;
        timedOut?: boolean;
    }>;
    cancel(): void;
}
/** Structural subset of DSH Desktop's public desktopPnpm service. */
export interface DesktopPnpmLike {
    runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandleLike;
    runExternalMarketPluginInstall?(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopPnpmHandleLike;
}
export declare function quoteCmdArg(arg: string): string;
export declare function cmdCommandLine(argv: readonly string[]): string;
/** Prevent cmd.exe environment expansion in the rare Windows shim fallback. */
export declare function isCmdSafeProfileName(profile: string): boolean;
/** Keep Node loader/runtime flags, but never forward wrapper-only eval flags to the DSH child. */
export declare function safeExecArgv(argv: readonly string[]): string[];
export declare function dshArgv(): {
    file: string;
    args: string[];
    cwd: string | undefined;
    viaShell: boolean;
};
export declare function cancelActive(): boolean;
export declare function runDshPlugin(profile: string, pluginArgs: string[], meta?: {
    fullName?: string;
}): Promise<InstallResult>;
/** Compose the selected profile without starting it, using the exact CLI that launched this plugin. */
export declare function runDshProfileCheck(profile: string): Promise<InstallResult>;
/** Adapt DSH Desktop's generation-scoped pnpm service to route orchestration. */
export declare function createDesktopPluginRuntime(service: DesktopPnpmLike, activeProfileDir: string, invokingDir?: string, timeoutMs?: number): PluginCommandRuntime;
