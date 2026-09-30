import { parseGitHubSource, githubInstallTarget } from "./github-source.js";
/** Pure, allow-listed source recognition. Never execute README commands or forward their flags. */
const NPM_NAME = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
export const NPM_SPEC_RE = new RegExp(`^(${NPM_NAME})(?:@([a-z0-9][a-z0-9._+-]*))?$`, "i");
const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
const REPO = "(?!\\.{1,2}(?:$|[#/]))[A-Za-z0-9._-]{1,100}";
const REF = "[A-Za-z0-9._~+/:=-]+";
export const FULL_NAME_RE = new RegExp(`^${OWNER}/${REPO}$`);
export const GITHUB_SPEC_RE = new RegExp(`^github:(${OWNER})/(${REPO})(?:#(${REF}))?$`, "i");
const UNSAFE = /[\s|&;<>()$`\\'"!*?]/;

export interface CatalogInstallSource {
  fullName: string;
  type?: string;
  installTarget?: unknown;
  installPackageName?: unknown;
  install?: { packageName?: unknown; commands?: readonly unknown[] };
}

/** Recognized author intent, not arguments to pass to a shell or package manager. */
export interface DshInstallCommandDetails {
  target: string;
  profile: string | null;
  registry: string | null;
  saveExact: boolean;
  workspace: boolean;
}

export function normalizeInstallTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let token = value.trim();
  if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
    token = token.slice(1, -1);
  }
  if (!token || token.startsWith("-") || UNSAFE.test(token)) return null;
  const github = parseGitHubSource(token);
  if (github) return githubInstallTarget(github);
  // npm:pkg is an explicit registry source. npm aliases and other protocols stay rejected.
  if (token.startsWith("npm:")) token = token.slice(4);
  return !token.startsWith("-") && NPM_SPEC_RE.test(token) ? token : null;
}

/** A # inside a ref or a quoted token is not a shell comment. */
export function stripInstallComment(command: string): string {
  let quote = "";
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === quote) quote = "";
    else if (!quote && (char === "'" || char === '"')) quote = char;
    else if (!quote && char === "#" && (i === 0 || /\s/.test(command[i - 1]))) return command.slice(0, i).trim();
  }
  return command.trim();
}

function commandTokens(value: string): string[] | null {
  if (value.length > 8192 || /[\r\n]/.test(value)) return null;
  const command = stripInstallComment(value.trim().replace(/^[$>]\s+/, ""));
  const tokens: string[] = [];
  // Only whole-token quotes; no escaping, interpolation or shell concatenation.
  const pattern = /"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s'"\r\n]+)/gy;
  let offset = 0;
  while (offset < command.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(command);
    if (!match) return null;
    const token = match[1] ?? match[2] ?? match[3];
    if (!token || UNSAFE.test(token)) return null;
    tokens.push(token);
    offset = pattern.lastIndex;
    if (offset < command.length && !/\s/.test(command[offset])) return null;
    while (/\s/.test(command[offset] ?? "") && offset < command.length) offset++;
  }
  return tokens;
}

export function parseDshInstallCommandDetails(value: unknown): DshInstallCommandDetails | null {
  if (typeof value !== "string") return null;
  const tokens = commandTokens(value);
  if (!tokens?.length) return null;
  let offset = 1;
  if (tokens[0] === "npx") {
    if (tokens[offset] === "--yes" || tokens[offset] === "-y") offset++;
    if (tokens[offset]?.match(NPM_SPEC_RE)?.[1] !== "@deepseek-ai/dsh") return null;
    offset++;
    if (tokens[offset] === "--") offset++;
  } else if (tokens[0] === "pnpm" || tokens[0] === "corepack") {
    if (tokens[0] === "corepack" && tokens[offset++] !== "pnpm") return null;
    if (tokens[offset] === "exec") offset++;
    if (tokens[offset++] !== "dsh") return null;
  } else if (tokens[0] !== "dsh") return null;

  const args: string[] = [];
  let profile: string | null = null;
  let registry: string | null = null;
  let saveExact = false;
  let workspace = false;
  let literal = false;
  for (; offset < tokens.length; offset++) {
    const token = tokens[offset];
    if (!literal && token === "--") {
      if (args.length !== 2 || args[0] !== "plugin" || args[1] !== "add") return null;
      literal = true;
    } else if (!literal && (token === "--profile" || token.startsWith("--profile="))) {
      const value = token === "--profile" ? tokens[++offset] : token.slice(10);
      if (profile !== null || !value || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) return null;
      profile = value;
    } else if (!literal && (token === "--save-exact" || token === "-w")) {
      if (args[0] !== "plugin" || args[1] !== "add") return null;
      if (token === "--save-exact") {
        if (saveExact) return null;
        saveExact = true;
      } else {
        if (workspace) return null;
        workspace = true;
      }
    } else if (!literal && (token === "--registry" || token.startsWith("--registry="))) {
      if (registry !== null || args[0] !== "plugin" || args[1] !== "add") return null;
      const value = token === "--registry" ? tokens[++offset] : token.slice(11);
      if (!value) return null;
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
        registry = url.href;
      } catch { return null; }
    } else {
      args.push(token);
    }
  }
  if (args.length !== 3 || args[0] !== "plugin" || args[1] !== "add") return null;
  const target = normalizeInstallTarget(args[2]);
  return target ? { target, profile, registry, saveExact, workspace } : null;
}

/** Desktop hosts the Web UI too. Treat an author's standard Web destination as
 * portable to Desktop; callers still execute against their actual Profile.
 * Custom Profile requirements and non-public registries remain restricted. */
export function isDshInstallCommandCompatible(command: DshInstallCommandDetails, options: { profile?: string } = {}): boolean {
  const profile = options.profile ?? "web";
  return (command.profile === null || command.profile === profile || (profile === "desktop" && command.profile === "web"))
    && (command.registry === null || command.registry === "https://registry.npmjs.org/");
}

/** Syntax-only convenience. Installation must use the contextual catalog resolver below. */
export function parseDshInstallCommand(value: unknown): string | null {
  return parseDshInstallCommandDetails(value)?.target ?? null;
}

export function resolveCatalogInstallTarget(entry: CatalogInstallSource, options: { profile?: string } = {}): string | null {
  if (!FULL_NAME_RE.test(entry.fullName)) return null;
  // Compact indexes retain a vetted target; full entries must re-evaluate author conditions.
  const candidates = entry.install?.commands?.length ? [] : [normalizeInstallTarget(entry.installTarget)];
  const unsupported: string[] = [];
  for (const value of entry.install?.commands ?? []) {
    const command = parseDshInstallCommandDetails(value);
    if (command) (isDshInstallCommandCompatible(command, options) ? candidates : unsupported).push(command.target);
  }
  // Prefer an author-provided registry release matching the catalog identity.
  // A bare packageName is not an installation instruction; server preflight still verifies the artifact.
  const packageName = entry.install?.packageName ?? entry.installPackageName;
  if (typeof packageName === "string") {
    const npm = candidates.find((target) => target?.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase());
    if (npm) return npm;
  }
  const github = candidates.find((target) => parseGitHubSource(target)?.repository === entry.fullName.toLowerCase());
  if (github) return github;
  // A skill fallback must not sidestep the same project's explicit environment requirements.
  if (unsupported.some((target) => parseGitHubSource(target)?.repository === entry.fullName.toLowerCase()
    || (typeof packageName === "string" && target.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase()))) return null;
  return entry.type?.toLowerCase() === "skill" ? `github:${entry.fullName}` : null;
}
