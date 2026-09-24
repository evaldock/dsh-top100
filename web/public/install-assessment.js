// plugin/src/shared/github-source.ts
var REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
var PORTS = { "https:": "443", "http:": "80", "ssh:": "22", "git:": "9418" };
function parseGitHubSource(value, purpose = "install") {
  if (typeof value !== "string") return null;
  let source = value.trim().replace(/^git\+/i, "");
  if (!source || source.length > 2048 || /[\\\s]/.test(source)) return null;
  let repository;
  let selector = "";
  if (/^github:/i.test(source) || REPOSITORY.test(source.split("#")[0].replace(/\.git$/i, ""))) {
    const parts = source.replace(/^github:/i, "").split("#");
    if (parts.length > 2) return null;
    repository = parts[0].replace(/\.git$/i, "");
    selector = parts[1] ?? "";
  } else {
    source = source.replace(/^git@github\.com:/i, "ssh://git@github.com/");
    let url;
    try {
      url = new URL(source);
    } catch {
      return null;
    }
    if (!Object.hasOwn(PORTS, url.protocol) || url.hostname.toLowerCase() !== "github.com") return null;
    if (url.port && url.port !== PORTS[url.protocol] || url.search || url.password) return null;
    if (url.username && !(url.protocol === "ssh:" && url.username === "git")) return null;
    const rawPath = source.replace(/^[^:]+:\/\/[^/]+/, "").split("#")[0];
    if (rawPath.split("/").some((part) => part === "." || part === ".." || /%/i.test(part))) return null;
    const match = /^\/([^/]+)\/([^/]+?)(?:\.git)?(\/.*)?$/i.exec(url.pathname);
    if (!match) return null;
    if (purpose === "install" && match[3] && match[3] !== "/") return null;
    repository = `${match[1]}/${match[2]}`;
    selector = url.hash.slice(1);
  }
  if (!REPOSITORY.test(repository)) return null;
  if (purpose === "repository") return { repository: repository.toLowerCase(), ref: null, path: null };
  let ref = null;
  let path = null;
  for (const parameter of selector ? selector.split("&") : []) {
    if (parameter.startsWith("path:")) {
      if (path !== null) return null;
      path = parameter.slice(5).replace(/^\/+|\/+$/g, "");
      if (!path || !/^[A-Za-z0-9@._/-]+$/.test(path) || path.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;
    } else {
      if (ref !== null || !/^[A-Za-z0-9._~+/:=-]+$/.test(parameter)) return null;
      ref = parameter;
    }
  }
  return { repository: repository.toLowerCase(), ref, path };
}
function githubInstallTarget(source) {
  const selector = [source.ref, source.path ? `path:/${source.path}` : null].filter(Boolean).join("&");
  return `github:${source.repository}${selector ? `#${selector}` : ""}`;
}

// plugin/src/shared/install-source.ts
var NPM_NAME = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
var NPM_SPEC_RE = new RegExp(`^(${NPM_NAME})(?:@([a-z0-9][a-z0-9._+-]*))?$`, "i");
var OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
var REPO = "(?!\\.{1,2}(?:$|[#/]))[A-Za-z0-9._-]{1,100}";
var REF = "[A-Za-z0-9._~+/:=-]+";
var FULL_NAME_RE = new RegExp(`^${OWNER}/${REPO}$`);
var GITHUB_SPEC_RE = new RegExp(`^github:(${OWNER})/(${REPO})(?:#(${REF}))?$`, "i");
var UNSAFE = /[\s|&;<>()$`\\'"!*?]/;
function normalizeInstallTarget(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  let token = value.trim();
  if (token.startsWith('"') && token.endsWith('"') || token.startsWith("'") && token.endsWith("'")) {
    token = token.slice(1, -1);
  }
  if (!token || token.startsWith("-") || UNSAFE.test(token)) return null;
  const github = parseGitHubSource(token);
  if (github) return githubInstallTarget(github);
  if (token.startsWith("npm:")) token = token.slice(4);
  return !token.startsWith("-") && NPM_SPEC_RE.test(token) ? token : null;
}
function stripInstallComment(command) {
  let quote = "";
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === quote) quote = "";
    else if (!quote && (char === "'" || char === '"')) quote = char;
    else if (!quote && char === "#" && (i === 0 || /\s/.test(command[i - 1]))) return command.slice(0, i).trim();
  }
  return command.trim();
}
function commandTokens(value) {
  if (value.length > 8192 || /[\r\n]/.test(value)) return null;
  const command = stripInstallComment(value.trim().replace(/^[$>]\s+/, ""));
  const tokens = [];
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
function parseDshInstallCommandDetails(value) {
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
  const args = [];
  let profile = null;
  let registry = null;
  let saveExact = false;
  let workspace = false;
  let literal = false;
  for (; offset < tokens.length; offset++) {
    const token = tokens[offset];
    if (!literal && token === "--") {
      if (args.length !== 2 || args[0] !== "plugin" || args[1] !== "add") return null;
      literal = true;
    } else if (!literal && (token === "--profile" || token.startsWith("--profile="))) {
      const value2 = token === "--profile" ? tokens[++offset] : token.slice(10);
      if (profile !== null || !value2 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value2)) return null;
      profile = value2;
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
      const value2 = token === "--registry" ? tokens[++offset] : token.slice(11);
      if (!value2) return null;
      try {
        const url = new URL(value2);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
        registry = url.href;
      } catch {
        return null;
      }
    } else {
      args.push(token);
    }
  }
  if (args.length !== 3 || args[0] !== "plugin" || args[1] !== "add") return null;
  const target = normalizeInstallTarget(args[2]);
  return target ? { target, profile, registry, saveExact, workspace } : null;
}
function isDshInstallCommandCompatible(command, options = {}) {
  return (command.profile === null || command.profile === (options.profile ?? "web")) && (command.registry === null || command.registry === "https://registry.npmjs.org/");
}
function resolveCatalogInstallTarget(entry, options = {}) {
  if (!FULL_NAME_RE.test(entry.fullName)) return null;
  const candidates = entry.install?.commands?.length ? [] : [normalizeInstallTarget(entry.installTarget)];
  const unsupported = [];
  for (const value of entry.install?.commands ?? []) {
    const command = parseDshInstallCommandDetails(value);
    if (command) (isDshInstallCommandCompatible(command, options) ? candidates : unsupported).push(command.target);
  }
  const packageName = entry.install?.packageName ?? entry.installPackageName;
  if (typeof packageName === "string") {
    const npm = candidates.find((target) => target?.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase());
    if (npm) return npm;
  }
  const github = candidates.find((target) => parseGitHubSource(target)?.repository === entry.fullName.toLowerCase());
  if (github) return github;
  if (unsupported.some((target) => parseGitHubSource(target)?.repository === entry.fullName.toLowerCase() || typeof packageName === "string" && target.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase())) return null;
  return entry.type?.toLowerCase() === "skill" ? `github:${entry.fullName}` : null;
}

// plugin/src/shared/install-assessment.ts
var SOURCE_ASSESSMENT_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function installSourceKey(entry, profile = "web") {
  return JSON.stringify([
    entry.fullName.toLowerCase(),
    resolveCatalogInstallTarget(entry, { profile }),
    entry.install?.packageName ?? entry.installPackageName ?? null,
    entry.install?.repositoryPath ?? entry.installRepositoryPath ?? null
  ]);
}
function catalogSourceStatus(entry, profile = "web", now = Date.now()) {
  if (!resolveCatalogInstallTarget(entry, { profile })) return "unidentified";
  const assessment = entry.install?.assessment ?? entry.installAssessment;
  if (!assessment || assessment.sourceKey !== installSourceKey(entry, profile)) return "identified";
  if (assessment.status === "invalid") return "invalid";
  const checkedAt = Date.parse(assessment.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > SOURCE_ASSESSMENT_TTL_MS) return "stale";
  if (assessment.status === "verified" && (!assessment.resolvedTarget || !assessment.integrity)) return "identified";
  return ["verified", "invalid", "unavailable"].includes(assessment.status) ? assessment.status : "identified";
}
function discoveryNeedsReview(entry) {
  return (entry.install?.discovery ?? entry.discovery)?.status === "review-required";
}
export {
  SOURCE_ASSESSMENT_TTL_MS,
  catalogSourceStatus,
  discoveryNeedsReview,
  installSourceKey
};
