import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repo = new URL("../../", import.meta.url);
const githubReadme = await readFile(new URL("README.md", repo), "utf8");
const npmReadme = await readFile(new URL("plugin/README.md", repo), "utf8");
const pluginPackage = JSON.parse(await readFile(new URL("plugin/package.json", repo), "utf8"));
const assets = ["dsh-website-preview.jpg", "dsh-plugin-market.png", "dsh-install-confirm.png"];
const rawAssets = "https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/";

test("both READMEs introduce the same product and link to the installation guide", () => {
  for (const readme of [githubReadme, npmReadme]) {
    assert.match(readme, /<h1 align="center">dsh-top100\b[^<]*<\/h1>/);
    assert.ok(readme.includes("https://www.evaldock.ai/top100/?page=dsh#dsh"));
    assert.match(readme, /发现、安装和管理插件/);
    assert.match(readme, /Skills/);
    assert.doesNotMatch(readme, /一键下载|dsh-Top100/);
  }
});

test("quick starts use the same DSH launcher and retain scope and safety boundaries", () => {
  const commands = `npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@${pluginPackage.version}\nnpx @deepseek-ai/dsh@0.1.5-rc.2 web`;
  for (const readme of [githubReadme, npmReadme]) {
    assert.ok(readme.includes(commands));
    assert.match(readme, /Node\.js 24 LTS/);
    assert.match(readme, /DSH Web 0\.1\.5-rc\.2/);
    assert.match(readme, /设置 → 插件排行/);
    assert.match(readme, /不会自动安装榜单中的其他项目/);
    assert.match(readme, /来源校验不等于安全审核/);
    assert.match(readme, /重启 DSH/);
  }
});

test("GitHub and npm reference the same real screenshots using platform-safe paths", async () => {
  for (const asset of assets) {
    assert.ok(githubReadme.includes(`src="./web/public/assets/${asset}"`));
    assert.ok(npmReadme.includes(`src="${rawAssets}${asset}"`));
    const bytes = await readFile(new URL(`web/public/assets/${asset}`, repo));
    if (asset.endsWith(".png")) {
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(bytes.readUInt32BE(16) >= 960, `${asset} keeps legible native width`);
      assert.ok(bytes.readUInt32BE(20) >= 800, `${asset} keeps legible native height`);
    } else {
      assert.deepEqual([...bytes.subarray(0, 3)], [255, 216, 255], "website screenshot uses its native JPEG format");
    }
  }
  for (const readme of [githubReadme, npmReadme]) {
    assert.match(readme, /本地开发版截图/);
    for (const [, src] of readme.matchAll(/<img\b[^>]*src="([^"]+)"/g)) {
      assert.doesNotMatch(src, /localhost|127\.0\.0\.1|file:|\/Users\/|\/var\//);
    }
  }
  for (const [, src] of npmReadme.matchAll(/<img\b[^>]*src="([^"]+)"/g)) {
    assert.ok(
      src.startsWith(rawAssets)
        || src === "https://raw.githubusercontent.com/evaldock/dsh-top100/main/docs/assets/dsh-top100-readme-cover.png"
        || src.startsWith("https://img.shields.io/"),
      "npm screenshots, cover and badges must use public absolute URLs",
    );
  }
});

test("npm documentation keeps install review details without bundling website assets", () => {
  assert.match(npmReadme, /精确版本/);
  assert.match(npmReadme, /40 位 commit/);
  assert.match(npmReadme, /生命周期脚本/);
  assert.match(npmReadme, /不构成代码安全审核/);
  assert.match(npmReadme, /未识别安装源/);
  assert.deepEqual(pluginPackage.files, ["lib", "client", "skills", "cordis.patch.yml"]);
});
