/**
 * dsh-Top100 host half.
 * Official plugin shape: export name + apply(ctx, config) + Config schema.
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { type ConfigValue } from "./host/live-config.js";
export declare const name = "dsh-top100";
export declare const inject: string[];
export interface Config {
    dataUrl: ConfigValue<string>;
    profile: string;
    allowRestart?: ConfigValue<boolean>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    allowRestart: z<boolean, boolean, "defined">;
    dataUrl: z<string, string, "defined">;
    profile: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    allowRestart: z<boolean, boolean, "defined">;
    dataUrl: z<string, string, "defined">;
    profile: z<string, string, "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config?: Config): void;
