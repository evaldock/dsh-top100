import type { PluginResolvedConfig } from "./contracts.js";
export type ConfigValue<T> = T | {
    get(): T;
};
export declare function configValue<T>(value: ConfigValue<T>): T;
/** 0.1.7 projects volatile fields; older schema packages keep the plain field. */
export declare function editableSchema<S>(schema: S): S;
/** Read a live field on every operation while retaining the older settings provider's setter. */
export declare function resolvedConfig(dataUrl: ConfigValue<string>, profile: string, profileDirectory?: string): PluginResolvedConfig;
