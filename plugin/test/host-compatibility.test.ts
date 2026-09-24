import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { satisfies } from "semver";

describe("declared DSH compatibility", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  it.each(["3.18.2", "3.18.4"])("accepts schemastery %s shipped by supported hosts", (version) => {
    expect(satisfies(version, manifest.peerDependencies["@deepseek-ai/schemastery"])).toBe(true);
  });
  it.each(["0.1.5-rc.2", "0.1.5-rc.3", "0.1.6-alpha.2", "0.1.7-rc.1"])("accepts %s with ordinary npm prerelease resolution", (version) => {
    for (const [name, range] of Object.entries(manifest.peerDependencies)) {
      if (name.startsWith("@deepseek-ai/dsh-")) expect(satisfies(version, range as string), name).toBe(true);
    }
  });
});
