import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(await readFile(new URL("plugin/package.json", root), "utf8"));
const semver = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
if (!new RegExp(`^${semver}$`).test(version)) throw new Error("Invalid plugin version");
const check = process.argv.includes("--check");
const files = ["README.md", "plugin/README.md", "web/public/index.html", "web/public/dsh.html", "web/public/skills.html", "web/public/assets/dsh-top100-og.svg"];
const stale = [];

for (const file of files) {
  const url = new URL(file, root);
  const before = await readFile(url, "utf8");
  // Only current install instructions and release labels; historical compatibility
  // references and DSH's own version requirements must remain unchanged.
  let after = before.replace(
    new RegExp(`(--profile web add(?: -w)? @evaldock/dsh-top100-plugin)(?:@${semver})?(?=[\\s<"'\x60]|$)`, "g"),
    (_, prefix) => `${prefix}@${version}`,
  );
  for (const prefix of [
    "- '@evaldock/dsh-top100-plugin@",
    "@evaldock/dsh-top100-plugin/v/",
    "releases/tag/v",
    "正式版本 v",
    '"softwareVersion": "',
    "<dd>v",
    ">v",
    "data-install-version>",
  ]) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    after = after.replace(new RegExp(`(${escaped})${semver}`, "g"), (_, start) => `${start}${version}`);
  }
  after = after.replace(
    new RegExp(`(https://img.shields.io/badge/release-v)${semver}(-[a-f0-9]{6}\\?)`, "g"),
    (_, prefix, color) => `${prefix}${version}${color}`,
  );
  if (after === before) continue;
  stale.push(file);
  if (!check) await writeFile(url, after);
}

if (check && stale.length) {
  console.error(`Install instructions differ from plugin/package.json (${version}):\n${stale.join("\n")}\nRun npm run version:sync.`);
  process.exitCode = 1;
} else {
  console.log(check ? `Install version ${version} is synchronized.` : `Synchronized ${stale.length} files to ${version}.`);
}
