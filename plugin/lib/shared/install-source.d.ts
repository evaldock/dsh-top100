export declare const NPM_SPEC_RE: RegExp;
export declare const FULL_NAME_RE: RegExp;
export declare const GITHUB_SPEC_RE: RegExp;
export interface CatalogInstallSource {
    fullName: string;
    type?: string;
    installTarget?: unknown;
    installPackageName?: unknown;
    install?: {
        packageName?: unknown;
        commands?: readonly unknown[];
    };
}
/** Recognized author intent, not arguments to pass to a shell or package manager. */
export interface DshInstallCommandDetails {
    target: string;
    profile: string | null;
    registry: string | null;
    saveExact: boolean;
    workspace: boolean;
}
export declare function normalizeInstallTarget(value: unknown): string | null;
/** A # inside a ref or a quoted token is not a shell comment. */
export declare function stripInstallComment(command: string): string;
export declare function parseDshInstallCommandDetails(value: unknown): DshInstallCommandDetails | null;
/** Desktop hosts the Web UI too. Treat an author's standard Web destination as
 * portable to Desktop; callers still execute against their actual Profile.
 * Custom Profile requirements and non-public registries remain restricted. */
export declare function isDshInstallCommandCompatible(command: DshInstallCommandDetails, options?: {
    profile?: string;
}): boolean;
/** Syntax-only convenience. Installation must use the contextual catalog resolver below. */
export declare function parseDshInstallCommand(value: unknown): string | null;
export declare function resolveCatalogInstallTarget(entry: CatalogInstallSource, options?: {
    profile?: string;
}): string | null;
