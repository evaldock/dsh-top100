import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { isProtectedPackage } from "../src/host/patch-toggle.js";
import { applyDshPatches, readDshPatch } from "../src/host/dsh-patch.js";
import { TOP100_SETTINGS_NS } from "../src/host/settings.js";

it("keeps both package identities protected from self-removal or toggling", () => {
  expect(isProtectedPackage("@dsheval/dsh-top100-plugin")).toBe(true);
  expect(isProtectedPackage("@evaldock/dsh-top100-plugin")).toBe(true);
  expect(isProtectedPackage("@someone/dsh-top100-plugin")).toBe(false);
});

it("preserves existing row-targeted configuration after replacing the old bundle", () => {
  const bundle = readDshPatch(readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8"));
  const custom = readDshPatch('- id: dsh-top100\n  config:\n    dataUrl: https://catalog.example/data\n    profile: work\n');
  const rows = applyDshPatches([...bundle, ...custom]);
  expect(rows).toEqual([{id:"dsh-top100", name:"@evaldock/dsh-top100-plugin",config:{dataUrl:"https://catalog.example/data",profile:"work"}}]);
  expect(TOP100_SETTINGS_NS).toBe("dsh-top100");
});
