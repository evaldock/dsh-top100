/** Verify an install target exposes a real DSH bundle manifest before running pnpm. */
import type { InstallSpec, LifecycleScriptEvidence } from "../shared/types.js";
export declare class InstallVerificationError extends Error {
    fatal: boolean;
    status: number | null;
    /** A definite manifest failure is separate from installation confirmation policy. */
    reason?: "invalid-manifest";
    constructor(message: string, fatal?: boolean, status?: number | null, reason?: "invalid-manifest");
}
export interface VerifiedInstallTarget {
    requestedTarget: string;
    target: string;
    source: "npm" | "github";
    packageName: string | null;
    version: string | null;
    commit: string | null;
    integrity: string | null;
    repositoryUrl: string | null;
    repositoryIdentity: "matched" | "unavailable" | "not-applicable";
    lifecycleScripts: LifecycleScriptEvidence[];
    /** DSH peer declarations from the exact verified manifest; null means malformed. */
    dshPeers?: Record<string, string> | null;
    verifiedAt: number;
    needsBuildApproval: boolean;
    /** Exact pnpm allowBuilds keys verified for this source. */
    buildApprovalKeys: string[];
}
export interface VerifyInstallOptions {
    signal?: AbortSignal;
    /** Explicit update checks must resolve moving tags and branches again. */
    forceRefresh?: boolean;
    expectedRepository?: string;
    expectedPackageName?: string;
    expectedRepositoryPath?: string;
}
export declare function clearInstallVerificationCache(): void;
/** Ranges must resolve against the packument; the single-version endpoint only accepts versions/tags. */
export declare function fetchNpmManifest(name: string, requestedSelector?: string, signal?: AbortSignal): Promise<unknown>;
export declare function verifyInstallSpec(spec: InstallSpec, options?: VerifyInstallOptions): Promise<VerifiedInstallTarget>;
