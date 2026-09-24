/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */
import type { InstallProvenance, InstallSpec, RankingEntry } from "../shared/types.js";
import { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE } from "../shared/install-source.js";
export { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE };
export declare const SAFE_TARGET_RE: RegExp;
export declare function isCordisEntry(entry: Pick<RankingEntry, "type" | "install">): boolean;
export declare function parseInstallSpec(raw: string): InstallSpec | null;
export declare function npmPackageSpec(spec: string): {
    name: string;
    selector: string | null;
} | null;
export declare function resolveInstallSpec(entry: RankingEntry, profile?: string): InstallSpec | null;
/** Recognize only registry versions/ranges/tags, never URLs, aliases or other protocols. */
export declare function isNpmRegistrySpecifier(value: string): boolean;
export interface InstalledEntryEvidence {
    manifest: {
        name?: unknown;
        version?: unknown;
        repository?: unknown;
    } | null;
    provenance: InstallProvenance | null;
}
/** Bind historical verification to the exact package still on disk and in this Profile. */
export declare function verifiedInstalledRepository(name: string, value: string, evidence?: InstalledEntryEvidence): string | null;
export declare function isInstalledEntry(entry: RankingEntry, installed: Record<string, string>, profile?: string, evidence?: Record<string, InstalledEntryEvidence>): boolean;
