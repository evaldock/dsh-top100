/** Optional settings namespace so operators can change the catalog URL without editing YAML. */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { PluginResolvedConfig } from "./contracts.js";
export declare const TOP100_SETTINGS_NS = "dsh-top100";
export interface Top100Settings {
    dataUrl: string;
}
export declare const Top100Settings: z<Schemastery.ObjectS<NoInfer<{
    dataUrl: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    dataUrl: z<string, string, "defined">;
}>>, "plain">;
export declare function installTop100Settings(ctx: Context, resolved: PluginResolvedConfig): void;
