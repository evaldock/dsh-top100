/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */
import { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE, normalizeInstallTarget, resolveCatalogInstallTarget } from "../shared/install-source.js";
import { parseGitHubSource, githubInstallTarget, githubRepositoryIdentity } from "../shared/github-source.js";
import { parseNpmSelector } from "./npm-selector.js";
export { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE };
// Only generated, commit-pinned sources may use &path:. Raw README targets cannot.
export const SAFE_TARGET_RE = /^[A-Za-z0-9@:./_#&+-]+$/;
export function isCordisEntry(entry) {
    const type = entry.type?.toLowerCase() ?? "";
    const method = entry.install?.method?.toLowerCase() ?? "";
    return type === "cordis-plugin" || type === "cordis" || method === "pnpm-profile";
}
export function parseInstallSpec(raw) {
    // Internal update targets can contain a SemVer range; they are resolved to an
    // exact version before any command runs. README parsing stays allow-listed.
    const npm = npmPackageSpec(raw);
    if (npm)
        return { kind: "npm", spec: raw.trim() };
    const token = normalizeInstallTarget(raw);
    if (!token)
        return null;
    const github = parseGitHubSource(token);
    if (github)
        return { kind: "github", spec: githubInstallTarget(github) };
    if (NPM_SPEC_RE.test(token) && !token.startsWith(".") && !token.includes("\\")) {
        return { kind: "npm", spec: token };
    }
    return null;
}
export function npmPackageSpec(spec) {
    const value = spec.trim();
    if (value.length > 2048 || value.startsWith("-"))
        return null;
    const separator = value.indexOf("@", value.startsWith("@") ? 1 : 0);
    const name = separator < 0 ? value : value.slice(0, separator);
    if (name.match(NPM_SPEC_RE)?.[1] !== name)
        return null;
    if (separator < 0)
        return { name, selector: null };
    const selector = parseNpmSelector(value.slice(separator + 1));
    return selector ? { name, selector: selector.value } : null;
}
export function resolveInstallSpec(entry, profile = "web") {
    const target = resolveCatalogInstallTarget(entry, { profile });
    return target ? parseInstallSpec(target) : null;
}
/** Recognize only registry versions/ranges/tags, never URLs, aliases or other protocols. */
export function isNpmRegistrySpecifier(value) {
    return parseNpmSelector(value) !== null;
}
/** Bind historical verification to the exact package still on disk and in this Profile. */
export function verifiedInstalledRepository(name, value, evidence) {
    const provenance = evidence?.provenance;
    const manifest = evidence?.manifest;
    if (!provenance || !manifest || provenance.source !== "npm" || provenance.repositoryIdentity !== "matched"
        || provenance.packageName !== name || manifest.name !== name || !provenance.version
        || value !== provenance.version || manifest.version !== provenance.version
        || provenance.resolvedTarget !== `${name}@${provenance.version}`
        || !provenance.integrity || !Number.isFinite(provenance.verifiedAt))
        return null;
    const repository = githubRepositoryIdentity(provenance.repositoryUrl);
    return repository && repository === githubRepositoryIdentity(manifest.repository) ? repository : null;
}
export function isInstalledEntry(entry, installed, profile = "web", evidence = {}) {
    const spec = resolveInstallSpec(entry, profile);
    const expectedSource = spec?.kind === "github" ? parseGitHubSource(spec.spec) : null;
    const expectedPackage = entry.install?.packageName ?? (spec?.kind === "npm" ? npmPackageSpec(spec.spec)?.name : null);
    const expectedPath = entry.install?.repositoryPath?.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "") ?? expectedSource?.path;
    for (const [name, value] of Object.entries(installed)) {
        if (expectedPackage && name.toLowerCase() !== expectedPackage.toLowerCase())
            continue;
        const source = parseGitHubSource(value);
        if (source) {
            if (source.repository === entry.fullName.toLowerCase() && (!expectedPath || source.path === expectedPath))
                return true;
        }
        else if (isNpmRegistrySpecifier(value)) {
            if (expectedPackage)
                return true;
            // Compact indexes can omit package identity. Require exact durable evidence,
            // and never infer a subpackage or Skill from its repository alone.
            if (!expectedPath && entry.type?.toLowerCase() !== "skill"
                && verifiedInstalledRepository(name, value, evidence[name]) === entry.fullName.toLowerCase())
                return true;
        }
    }
    return false;
}
