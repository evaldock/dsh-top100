import type { IncomingMessage } from "node:http";
export type RestartReason = "desktop" | "profile" | "disabled" | "supervised" | "debugger" | "launcher" | "remote";
export interface RestartCapability {
    available: boolean;
    reason?: RestartReason;
}
export declare function trustedRestartRequest(request: Pick<IncomingMessage, "headers" | "socket">, requireOrigin?: boolean): boolean;
export declare function restartCapability(options: {
    desktop?: boolean;
    currentProfile: boolean;
    allowRestart?: boolean;
    env?: NodeJS.ProcessEnv;
    argv?: string[];
    execArgv?: string[];
    inspectorUrl?: string | null;
}): RestartCapability;
export interface RestartHandoff {
    commit(): void | Promise<void>;
    cancel(): void;
}
/** Wait for helper readiness before acknowledging or terminating the host. No shell invocation or credentials written to disk. */
export declare function prepareRestart(port: number): Promise<RestartHandoff>;
