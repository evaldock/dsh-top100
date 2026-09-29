import type { HostCompatibility } from "../shared/types.js";
export declare function readDshRuntimeVersion(entry?: string): string | null;
/** Mirrors app-boot's DSH-peer semantics, including prereleases and range upper bounds.
 * Exemptions and actual activation remain owned by DSH; this is declaration evidence only.
 */
export declare function evaluateHostCompatibility(peers: Record<string, string> | null | undefined, runtimeVersion?: string | null): HostCompatibility;
