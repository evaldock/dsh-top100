/** Read runtime metadata without importing plugin code or using development peers. */
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { satisfies, valid } from "semver";
import type { HostCompatibility } from "../shared/types.js";

export function readDshRuntimeVersion(entry = process.argv[1]): string | null {
  if (!entry) return null;
  let directory: string;
  try { directory = dirname(realpathSync(resolve(entry))); } catch { return null; }
  for (let depth = 0; depth < 12; depth++) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      if (manifest.name === "@deepseek-ai/dsh" && typeof manifest.version === "string" && valid(manifest.version)) return manifest.version;
    } catch { /* Try the next ancestor; unknown is preferable to guessing. */ }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/** Mirrors app-boot's DSH-peer semantics, including prereleases and range upper bounds.
 * Exemptions and actual activation remain owned by DSH; this is declaration evidence only.
 */
export function evaluateHostCompatibility(peers: Record<string, string> | null | undefined, runtimeVersion = readDshRuntimeVersion()): HostCompatibility {
  const runtime = runtimeVersion && valid(runtimeVersion) ? runtimeVersion : null;
  const requirements = Object.entries(peers ?? {}).map(([name, range]) => ({
    name, range, matched: runtime ? range.trim() !== "" && satisfies(runtime,
      ["workspace:^", "workspace:~", "workspace:*"].includes(range) ? runtime : range,
      { includePrerelease: true }) : null,
  }));
  const reason = peers == null ? "invalid-declaration" : !requirements.length ? "not-declared" : !runtime ? "runtime-unavailable" : "checked";
  return { runtimeVersion: runtime, requirements, reason,
    status: reason !== "checked" ? "unknown" : requirements.every((item) => item.matched) ? "matched" : "mismatch" };
}
