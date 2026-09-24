/** Minimal host contracts shared by the plugin entry point and HTTP adapters. */
import type { HostRuntimeStatus, RuntimeBundle } from "./runtime-status.js";
import type { IncomingMessage, ServerResponse } from "node:http";
export interface WebServerService {
    register(route: {
        kind: "exact" | "prefix";
        path: string;
        handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
    }): () => void;
}
export interface PluginHost {
    webServer: WebServerService;
    restartCapability?: () => import("./restart.js").RestartCapability;
    readRuntime?: (bundles: readonly RuntimeBundle[]) => Record<string, HostRuntimeStatus>;
}
export interface PluginResolvedConfig {
    dataUrl: string;
    profile: string;
    /** Host-owned profile location, used by DSH Desktop instead of ~/.dsh/profiles/<name>. */
    profileDirectory?: string;
}
