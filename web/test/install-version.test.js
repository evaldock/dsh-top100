import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const files = ["README.md", "plugin/README.md", "web/public/index.html", "web/public/dsh.html", "web/public/skills.html"];

test("a release bump fails the check until all install surfaces are synchronized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dsh-version-sync-"));
  try {
    for (const file of [...files, "web/public/assets/dsh-top100-og.svg", "scripts/sync-install-version.mjs", "plugin/package.json"]) {
      const target = join(directory, file);
      await mkdir(join(target, ".."), { recursive: true });
      await cp(new URL(file, root), target);
    }
    const manifestPath = join(directory, "plugin/package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "9.8.7";
    await writeFile(manifestPath, JSON.stringify(manifest));
    const run = (...args) => spawnSync(process.execPath, ["scripts/sync-install-version.mjs", ...args], {
      cwd: directory, encoding: "utf8",
    });
    assert.equal(run("--check").status, 1);
    assert.equal(run().status, 0);
    assert.equal(run("--check").status, 0);
    for (const file of files) {
      const content = await readFile(join(directory, file), "utf8");
      const targets = [...content.matchAll(/--profile web add(?: -w)? (@evaldock\/dsh-top100-plugin[^\s<"'`]+)/g)];
      assert.ok(targets.length, file);
      assert.ok(targets.every(([, target]) => target === "@evaldock/dsh-top100-plugin@9.8.7"), file);
      if (file.endsWith("README.md")) {
        assert.match(content, /DSH Web 0\.1\.5-rc\.2/, "existing README compatibility notes must not change");
      } else {
        assert.match(content, /npx @deepseek-ai\/dsh@0\.1\.5-rc\.2/, "a Top100 release bump must preserve the tested DSH version");
      }
      if (file.endsWith("README.md")) assert.ok(content.includes("- '@evaldock/dsh-top100-plugin@9.8.7'"));
    }
    const readme = await readFile(join(directory, "README.md"), "utf8");
    assert.ok(readme.includes("release-v9.8.7-2f6f68?style=flat-square"), "badge color is not a prerelease suffix");
    assert.ok(readme.includes("@dsheval/dsh-top100-plugin@1.1.0"), "historical compatibility version is preserved");
    assert.match(await readFile(join(directory, "web/public/assets/dsh-top100-og.svg"), "utf8"), />v9\.8\.7</);
    const before = await Promise.all(files.map((file) => readFile(join(directory, file), "utf8")));
    assert.equal(run().status, 0);
    assert.deepEqual(await Promise.all(files.map((file) => readFile(join(directory, file), "utf8"))), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
