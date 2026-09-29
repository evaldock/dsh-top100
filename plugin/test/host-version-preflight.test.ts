import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateHostCompatibility, readDshRuntimeVersion } from "../src/host/host-compatibility.js";

describe("DSH declaration compatibility", () => {
  it.each([
    ["^0.1.7", "0.2.0-rc.1", "mismatch"],
    ["^0.2.0-rc.1", "0.2.0-rc.2", "matched"],
    [">=0.1.0 <0.3.0", "0.2.0-rc.1", "matched"],
    ["~0.1.5", "0.2.0-rc.1", "mismatch"],
    ["nonsense", "0.2.0-rc.1", "mismatch"],
    ["", "0.2.0-rc.1", "mismatch"],
    ["workspace:^", "0.2.0-rc.1", "matched"],
  ])("checks %s against %s with official prerelease semantics", (range, runtime, status) => {
    expect(evaluateHostCompatibility({ "@deepseek-ai/dsh-tools": range }, runtime).status).toBe(status);
  });
  it("requires every DSH peer to match", () => {
    expect(evaluateHostCompatibility({ "@deepseek-ai/dsh": "*", "@deepseek-ai/dsh-tools": "<0.2.0-0" }, "0.2.0-rc.1").status).toBe("mismatch");
  });
  it("distinguishes missing runtime, missing declarations and malformed declarations", () => {
    expect(evaluateHostCompatibility({}, "0.2.0-rc.1")).toMatchObject({ status: "unknown", reason: "not-declared" });
    expect(evaluateHostCompatibility(null, "0.2.0-rc.1")).toMatchObject({ status: "unknown", reason: "invalid-declaration" });
    expect(evaluateHostCompatibility({ "@deepseek-ai/dsh": "*" }, null)).toMatchObject({ status: "unknown", reason: "runtime-unavailable", requirements: [{ matched: null }] });
  });
  it("reads the running CLI through a symlink and never guesses from unrelated manifests", () => {
    const root = mkdtempSync(join(tmpdir(), "top100-host-version-"));
    try {
      mkdirSync(join(root, "dsh", "lib"), { recursive: true });
      writeFileSync(join(root, "dsh", "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.2.0-rc.1" }));
      writeFileSync(join(root, "dsh", "lib", "bin.js"), "");
      symlinkSync(join(root, "dsh", "lib", "bin.js"), join(root, "dsh-bin"));
      expect(readDshRuntimeVersion(join(root, "dsh-bin"))).toBe("0.2.0-rc.1");
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "unrelated", version: "9.0.0" }));
      expect(readDshRuntimeVersion(join(root, "package.json"))).toBeNull();
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
