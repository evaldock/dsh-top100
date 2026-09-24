/** Persist enable/disable through the profile user patch layer. */
import { chmodSync, lstatSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { INBOX_BUNDLES, profileDir } from "./profile.js";
import { applyDshPatches, disabledRowIds, insertedRows, readDshPatch, writeDshPatch, type DshPatch } from "./dsh-patch.js";

const SELF_PACKAGES = new Set(["dsh-top100", "dsh-top100-plugin", "@dsheval/dsh-top100-plugin", "@evaldock/dsh-top100-plugin"]);
export interface PatchState { disables: string[]; forced: string[] }
export function userPatchPath(profile: string, explicitDir?: string): string {
  return join(profileDir(profile, explicitDir), "cordis.patch.yml");
}
export function parseDshPatchText(source: string): DshPatch[] | null {
  try { return readDshPatch(source); } catch { return null; }
}
function missing(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
/** A missing user layer is optional; unreadable or malformed existing files are not. */
export function readUserPatch(patchPath: string): DshPatch[] {
  try { return readDshPatch(readFileSync(patchPath, "utf8")); }
  catch (error) { if (missing(error)) return []; throw error; }
}
export function userPatchPackageReferences(patchPath: string, packageName: string): string[] | null {
  try {
    return [...new Set(insertedRows(readUserPatch(patchPath)).map((row) => row.name)
      .filter((name): name is string => typeof name === "string"
        && (name === packageName || name.startsWith(`${packageName}/`))))];
  } catch { return null; }
}
export function isProtectedPackage(name: string): boolean {
  return INBOX_BUNDLES.has(name) || SELF_PACKAGES.has(name) || name.startsWith("@deepseek-ai/");
}
export function userPatchState(patches: readonly DshPatch[], knownRows: readonly DshPatch[] = []): PatchState {
  const names = new Map([...knownRows, ...insertedRows(patches)].map((row) => [row.id, row.name]));
  const states = new Map<string, unknown>();
  for (const patch of patches) {
    if (!Object.hasOwn(patch, "insert") && typeof patch.id === "string" && Object.hasOwn(patch, "disabled")) {
      if (!patch.name || (names.has(patch.id) && patch.name === names.get(patch.id))) states.set(patch.id, patch.disabled);
    }
  }
  return {
    disables: [...states].filter(([, disabled]) => disabled === true).map(([id]) => id),
    forced: [...states].filter(([, disabled]) => disabled === false).map(([id]) => id),
  };
}
export function readUserPatchState(patchPath: string): PatchState {
  return userPatchState(readUserPatch(patchPath));
}
export function parseInsertedIds(source: string): string[] {
  return [...new Set(insertedRows(readDshPatch(source)).map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
}
/** Resolve the declared layer only; missing declarations/files must not guess a package-name id. */
export function bundlePatchEntries(packageDirectory: string): { path: string; ids: string[]; patches: DshPatch[] } {
  const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as { dsh?: { bundle?: { patch?: unknown } } };
  const declared = manifest?.dsh?.bundle?.patch;
  const files = typeof declared === "string" ? [declared] : Array.isArray(declared) ? declared : [];
  if (!files.length || files.some((file) => typeof file !== "string" || !file.trim())) throw new Error("缺少或无效的 dsh.bundle.patch 声明");
  // DSH applies multiple declared patch files in order, including later edits.
  // Read all of them before returning; a bad later file must not look valid.
  const paths = files.map((file) => join(packageDirectory, file));
  const patches = paths.flatMap((path) => readDshPatch(readFileSync(path, "utf8")));
  return { path: paths[0]!, ids: [...new Set(insertedRows(patches).map((row) => row.id).filter((id): id is string => typeof id === "string"))], patches };
}
function hostInstallDirectory(): string | null {
  if (!process.argv[1]) return null;
  let directory = dirname(process.argv[1]);
  for (let depth = 0; depth < 10; depth += 1) {
    try { if (JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name === "@deepseek-ai/dsh") return directory; } catch { /* not the host root */ }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}
function packageLayer(profile: string, packageName: string, explicitDir?: string): ReturnType<typeof bundlePatchEntries> {
  const directory = profileDir(profile, explicitDir);
  const host = hostInstallDirectory();
  const candidates = [join(directory, "node_modules", packageName), ...(host ? [join(host, "node_modules", packageName)] : []), join(dirname(directory), "node_modules", packageName)];
  for (const packageDirectory of candidates) {
    try { return bundlePatchEntries(packageDirectory); }
    catch (error) {
      // Parent resolution is allowed only when this package itself is absent.
      try { readFileSync(join(packageDirectory, "package.json"), "utf8"); } catch (manifestError) {
        if (missing(manifestError)) continue;
      }
      throw error;
    }
  }
  throw new Error("找不到插件 package.json，无法确定真实加载 id");
}
export function rowIdsForPackage(profile: string, packageName: string, explicitDir?: string): string[] {
  return packageLayer(profile, packageName, explicitDir).ids;
}
/** Resolve the profile's declared order, including groups inserted by earlier bundles. */
function profilePatchLayers(profile: string, packageName: string, own: ReturnType<typeof bundlePatchEntries>, explicitDir?: string): DshPatch[] {
  let manifest: { dependencies?: Record<string, unknown>; dsh?: { profile?: { bundles?: unknown } } };
  try { manifest = JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "package.json"), "utf8")); }
  catch (error) { if (missing(error)) return own.patches; throw error; }
  const declared = manifest.dsh?.profile?.bundles;
  const names = Array.isArray(declared) ? declared.filter((name): name is string => typeof name === "string") : Object.keys(manifest.dependencies ?? {});
  if (!names.length) return own.patches;
  if (!names.includes(packageName)) throw new Error("当前 profile 未加载该插件，无法确认开关状态");
  return [...new Set(names)].flatMap((name) => {
    if (name === packageName) return own.patches;
    // A missing host layer is diagnosed separately. Before mutation, every
    // managed loader must still resolve in the composed context below.
    try { return packageLayer(profile, name, explicitDir).patches; } catch { return []; }
  });
}
interface PatchSection { patches: DshPatch[]; owner?: string }
interface PatchDocument { source: string | null; mode: number; sections: PatchSection[] }
const BLOCK_START = /^# dsh-top100:disable-v1 (\S+) ([a-f0-9]{64})\r?\n/gm;
const BLOCK_END = "# dsh-top100:end-disable-v1";
function digest(patches: DshPatch[]): string { return createHash("sha256").update(writeDshPatch(patches)).digest("hex"); }
function parseSection(source: string): DshPatch[] { return source.replace(/^#.*$/gm, "").replace(/^---\s*$/gm, "").trim() ? readDshPatch(source) : []; }
/** The original settings stay in the file. A removable, checksummed overlay is
 * committed with them in one rename, so restart needs no sidecar recovery. */
function readPatchDocument(path: string): PatchDocument {
  let source: string;
  let mode = 0o600;
  try {
    const info = lstatSync(path);
    if (!info.isFile()) throw new Error("用户补丁不是普通文件，已拒绝替换");
    mode = info.mode & 0o777;
    source = readFileSync(path, "utf8");
  } catch (error) { if (missing(error)) return { source: null, mode, sections: [] }; throw error; }
  const allPatches = readDshPatch(source);
  const sections: PatchSection[] = [];
  const owners = new Set<string>();
  let cursor = 0;
  let patchCursor = 0;
  for (const match of source.matchAll(BLOCK_START)) {
    if (match.index! < cursor) throw new Error("插件停用标记重叠，请先检查用户补丁");
    const beforeCount = parseSection(source.slice(0, match.index)).length;
    if (beforeCount > patchCursor) sections.push({ patches: allPatches.slice(patchCursor, beforeCount) });
    const bodyStart = match.index! + match[0].length;
    const end = source.indexOf(`\n${BLOCK_END}`, bodyStart);
    if (end < 0 || (source[end + 1 + BLOCK_END.length] && !/[\r\n]/.test(source[end + 1 + BLOCK_END.length]))) throw new Error("插件停用标记不完整，请先检查用户补丁");
    const patches = parseSection(source.slice(bodyStart, end));
    const owner = decodeURIComponent(match[1]);
    if (!owner || owners.has(owner) || patches.length === 0 || digest(patches) !== match[2]
      || patches.some((patch) => typeof patch.id !== "string" || patch.disabled !== true
        || Object.keys(patch).some((key) => !["id", "name", "disabled"].includes(key)))) {
      throw new Error("插件停用块已被修改，已保留当前配置；请先检查该块");
    }
    owners.add(owner);
    sections.push({ owner, patches });
    patchCursor = beforeCount + patches.length;
    cursor = end + 1 + BLOCK_END.length;
  }
  const trailing = source.slice(cursor);
  if (trailing.includes(BLOCK_END)) throw new Error("插件停用标记不完整，请先检查用户补丁");
  if (allPatches.length > patchCursor) sections.push({ patches: allPatches.slice(patchCursor) });
  return { source, mode, sections };
}
function writePatchAtomic(patchPath: string, document: PatchDocument): void {
  const parts = document.sections.filter((section) => section.patches.length).map((section) => {
    const body = writeDshPatch(section.patches);
    return section.owner ? `# dsh-top100:disable-v1 ${encodeURIComponent(section.owner)} ${digest(section.patches)}\n${body}${BLOCK_END}\n` : body;
  });
  const output = parts.join("") || "[]\n";
  readDshPatch(output);
  const temporary = `${patchPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, output, { encoding: "utf8", flag: "wx", mode: document.mode });
    chmodSync(temporary, document.mode);
    let current: string | null = null;
    let currentMode = document.mode;
    try {
      const info = lstatSync(patchPath);
      if (!info.isFile()) throw new Error("用户补丁已被替换，已取消写入");
      currentMode = info.mode & 0o777;
      current = readFileSync(patchPath, "utf8");
    } catch (error) { if (!missing(error)) throw error; }
    if (current !== document.source || currentMode !== document.mode) throw new Error("用户补丁已被其他操作修改，请刷新后重试");
    renameSync(temporary, patchPath);
  } finally { rmSync(temporary, { force: true }); }
}
export function setRowDisabled(patchPath: string, rowId: string, disabled: boolean): { ok: boolean; reason: string | null } {
  try {
    if (!rowId) throw new Error("无效的补丁行 id");
    const document = readPatchDocument(patchPath);
    document.sections.push({ patches: [{ id: rowId, disabled }] });
    writePatchAtomic(patchPath, document);
    return { ok: true, reason: null };
  } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
}
export function removeRowBlocks(patchPath: string, rowIds: readonly string[]): void {
  if (rowIds.length === 0) return;
  const document = readPatchDocument(patchPath);
  const wanted = new Set(rowIds);
  let changed = false;
  for (const section of document.sections) section.patches = section.patches.flatMap((patch) => {
    if (Object.hasOwn(patch, "insert") || typeof patch.id !== "string" || !wanted.has(patch.id) || typeof patch.disabled !== "boolean") return [patch];
    changed = true;
    const { disabled: _disabled, ...rest } = patch;
    return Object.keys(rest).every((key) => key === "id" || key === "name") ? [] : [rest];
  });
  if (changed) writePatchAtomic(patchPath, document);
}
export function packageIsDisabled(profile: string, packageName: string, explicitDir?: string): boolean {
  try {
    const layer = packageLayer(profile, packageName, explicitDir);
    const rows = applyDshPatches([...profilePatchLayers(profile, packageName, layer, explicitDir), ...readUserPatch(userPatchPath(profile, explicitDir))]);
    const disabled = disabledRowIds(rows);
    return layer.ids.length > 0 && layer.ids.every((id) => disabled.has(id));
  } catch { return false; } // Inventory stays available; diagnostics reports invalid layers.
}
export function setPackageEnabled(profile: string, packageName: string, enabled: boolean, explicitDir?: string) {
  if (isProtectedPackage(packageName)) return { ok: false, reason: "该插件属于宿主或本排行插件，不能在这里开关", rows: [] as string[] };
  let rows: string[] = [];
  try {
    const layer = packageLayer(profile, packageName, explicitDir);
    rows = layer.ids;
    const baseLayers = profilePatchLayers(profile, packageName, layer, explicitDir);
    if (rows.length === 0) throw new Error("插件未声明可管理的真实加载 id");
    const path = userPatchPath(profile, explicitDir);
    const document = readPatchDocument(path);
    const owned = document.sections.find((section) => section.owner === packageName);
    if (enabled) {
      if (owned) document.sections = document.sections.filter((section) => section !== owned);
      else {
        // Legacy/user disable flags can be lifted without forcing default-off
        // optional rows on. Never replace conditional or expression overrides.
        const defaults = disabledRowIds(applyDshPatches(baseLayers));
        for (const section of document.sections) {
          if (section.owner) continue;
          section.patches = section.patches.filter((patch) => !(rows.includes(String(patch.id))
            && !defaults.has(String(patch.id)) && patch.disabled === true
            && Object.keys(patch).every((key) => key === "id" || key === "disabled")));
        }
        const restored = disabledRowIds(applyDshPatches([...baseLayers, ...document.sections.flatMap((section) => section.patches)]));
        if (rows.every((id) => restored.has(id))) throw new Error("当前停用来自插件默认值或带配置的用户补丁，无法安全自动启用；请在配置中调整");
      }
    } else if (!owned) {
      const effective = insertedRows([{ insert: applyDshPatches([...baseLayers, ...document.sections.flatMap((section) => section.patches)]) }]);
      const names = new Map(effective.map((row) => [row.id, row.name]));
      if (rows.some((id) => !names.has(id))) throw new Error("无法在当前 profile 补丁层中解析全部加载行，已取消停用");
      document.sections.push({ owner: packageName, patches: rows.map((id) => ({ id, ...(typeof names.get(id) === "string" ? { name: names.get(id) } : {}), disabled: true })) });
    } else {
      const current = disabledRowIds(applyDshPatches([...baseLayers, ...document.sections.flatMap((section) => section.patches)]));
      if (!rows.every((id) => current.has(id))) throw new Error("插件加载行或用户补丁已变化，原停用块不再完全生效；请先恢复后重新停用");
      return { ok: true, reason: null, rows };
    }
    writePatchAtomic(path, document);
    return { ok: true, reason: null, rows };
  } catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error), rows }; }
}
