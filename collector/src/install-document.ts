/** Audited installation documents, scoped to the exact selected package.
 * They supplement installation evidence only, never the functional summary.
 */
import { fetchRawFile } from "./github.js";
import { parseInstallCommands } from "./install-parse.js";
import type { CachedInstallIdentity } from "./install-cache.js";

export async function supplementInstallDocument(identity: CachedInstallIdentity,
  parsed: ReturnType<typeof parseInstallCommands>, revision: string,
  read: (fullName: string, path: string, revision: string) => Promise<string | null> = fetchRawFile,
): Promise<ReturnType<typeof parseInstallCommands>> {
  if (identity.fullName.toLowerCase() !== "superdesigndev/treg"
    || identity.packageName !== "treg-dsh" || identity.repositoryPath) return parsed;
  const path = "docs/DSH-PLUGIN.md";
  const document = await read(identity.fullName, path, revision);
  if (document === null) return parsed;
  const commands = parseInstallCommands(document).commands;
  if (!commands.length) return parsed;
  return { commands: [...new Set([...commands, ...parsed.commands])].slice(0, 32), source: path };
}
