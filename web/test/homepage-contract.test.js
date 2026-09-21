import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dsh = await readFile(new URL("../public/dsh.html", import.meta.url), "utf8");
const skills = await readFile(new URL("../public/skills.html", import.meta.url), "utf8");
const categorySystem = await readFile(new URL("../public/category-system.js", import.meta.url), "utf8");
const categoryStyles = await readFile(new URL("../public/category-system.css", import.meta.url), "utf8");
const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8")
);
const devServer = await readFile(new URL("../../scripts/serve-dev.mjs", import.meta.url), "utf8");

test("describes installation evidence without promising install success", () => {
  assert.match(html, /仅看有安装源/);
  assert.doesNotMatch(html, /仅看可安装/);
  assert.match(html, /不代表已安装验证/);
});

test("keeps install actions hidden when no matching source is available", () => {
  assert.match(html, /\.plugin-list \.plugin \.quick-install\[hidden\],[\s\S]*?\.plugin-list \.plugin \.install-action\[hidden\] \{\s*display: none;/);
  assert.match(html, /if \(command\) \{\s*installAction\.hidden = false/);
  assert.match(html, /class="github-link quick-install"[^>]* hidden/);
  assert.match(html, /class="plugin-action install-action"[^>]* hidden/);
});

test("places editorial 000 inside the table using shared row styles, without a score", () => {
  const aside = html.match(/<aside class="plugin featured-plugin"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(aside);
  assert.match(aside, /#000/);
  assert.match(aside, /本站出品 · 不参与排名/);
  assert.match(aside, /data-content-switch="dsh"/);
  assert.match(aside, /class="github-link"[^>]*href="https:\/\/github\.com\/evaldock\/dsh-top100"/);
  assert.match(aside, /aria-label="在 GitHub 打开 dsh-top100"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.doesNotMatch(aside, /class="stars"|data-copy-command|data-rank=/);
  assert.match(aside, /class="rank"/);
  assert.match(aside, /class="plugin-name"/);
  assert.match(aside, /class="plugin-description"/);
  assert.match(aside, /把插件榜单带进 DSH，发现、安装和管理插件。/);
  assert.ok(html.indexOf(aside) > html.indexOf('id="plugin-list"'));
  assert.match(html, /fragment\.prepend\(featuredPlugin\)/);
  assert.match(html, /\.plugin-list\.is-top100-list \.featured-plugin\[hidden\] \{ display: none; \}/);
  assert.match(html, /featuredPlugin\.hidden = !showFeaturedPlugin/);
  assert.match(html, /view: currentView === "top100" \? "hot" : currentView === "all" \? "total" : currentView/);
});

test("boots from lightweight hot data and never falls back to the full catalog", () => {
  assert.match(html, /const MANIFEST_URL = "\/data\/manifest\.json"/);
  assert.match(html, /hot: "\/data\/rankings-hot\.json"/);
  assert.match(html, /total: "\/data\/rankings-total\.json"/);
  assert.match(html, /await fetchJson\(MANIFEST_URL, \{ manifestRequest: true \}\)/);
  assert.match(html, /await fetchJson\(manifest\.datasets\.hot\.url\)/);
  assert.match(html, /falling back to the lightweight legacy hot list/);
  assert.doesNotMatch(html, /["']\/data\/rankings\.json["']/);
});

test("loads deferred datasets through their manifest URLs", () => {
  assert.match(html, /manifest\.datasets\.rising\.url/);
  assert.match(html, /manifest\.datasets\.total\.pages/);
  assert.match(html, /manifest\?\.datasets\?\.search\?\.url/);
  assert.match(html, /manifest\?\.categories\?\.find/);
  assert.match(html, /totalPageLoadPromise/);
  assert.match(html, /categoryPageLoadPromises/);
  assert.match(html, /viewSwitchGeneration/);
  assert.match(html, /switchGeneration !== viewSwitchGeneration/);
  assert.match(html, /searchGenerations/);
  assert.match(html, /if \(!isCurrentSearchRequest\(\)\) return/);
  assert.match(html, /isCurrentSearchRequest\(\) && currentView === view/);
  assert.match(html, /initialDataPromise = loadManifestAndHot\(\)/);
  assert.match(html, /if \(initialDataPromise\) await initialDataPromise/);
  assert.match(html, /dataSearchGeneration !== searchGenerations\[requestedRankingView\]/);
  assert.match(html, /await ensureViewData\(view\)/);
  assert.match(html, /const requestedRankingView = currentView/);
  assert.match(html, /if \(requestedCategory\) await loadNextCategoryPage\(\)/);
  assert.match(html, /else await loadNextTotalPage\(\)/);
  assert.doesNotMatch(html, /if \(currentView === "all"\) await loadNextTotalPage\(\)/);
  assert.match(html, /loadMore\.disabled = !indexed/);
  assert.match(html, /else if \(isSameRankingContext\(\)\) renderRanking\(\)/);
});

test("contains the homepage conversion, privacy and SEO contracts", () => {
  assert.match(html, /id="hero-search-form"/);
  assert.doesNotMatch(html, /market-radar|radar-item|renderMarketRadar/);
  assert.match(html, /data-content-switch="dsh"/);
  assert.match(dsh, /data-copy-command="npx @deepseek-ai\/dsh@0\.1\.5-rc\.2 plugin/);
  assert.match(html, /data-track-ranking-view="hot"/);
  assert.match(html, /track\("search_used"/);
  assert.match(html, /closest\("a\.github-link"\)/);
  assert.doesNotMatch(html, /closest\("\.github-link"\)/);
  assert.doesNotMatch(html, /track\([^\n]+state\.query/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.evaldock\.ai\/top100\/"/);
  assert.match(html, /type="application\/ld\+json"/);
  assert.doesNotMatch(html, /github\.githubassets\.com\/favicons/);
});

test("uses the EvalDock violet palette", () => {
  assert.match(html, /--paper: #f8f8ff/);
  assert.match(html, /--hero: #f0f1fe/);
  assert.match(html, /--hero-ink: #1c2024/);
  assert.match(html, /--hero-accent: #5b5bd6/);
  assert.match(html, /--code-surface: #e9e9f1/);
  assert.match(html, /--line: rgba\(28, 32, 36, 0\.26\)/);
  assert.match(html, /--line-strong: #92929f/);
  assert.match(html, /--signal-brass: #9b8e63/);
  assert.match(html, /--signal-sage: #7f9f95/);
  assert.match(html, /<meta name="theme-color" content="#f0f1fe" \/>/);
  assert.match(html, /\.dsh-step-number \{[\s\S]*?border-radius: 50%/);
  assert.match(html, /\.dsh-copy-button \{[\s\S]*?color: var\(--accent\);[\s\S]*?background: var\(--card\)/);
  assert.doesNotMatch(html, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(html, /color-scheme:\s*dark/);
  assert.doesNotMatch(html, /#f1c75b|rgba\(241,\s*199,\s*91|#d39b1d|#fffaf0/i);
  assert.doesNotMatch(html, /#a95a5a|#fbf4f3/i);
});

test("uses the shared footer and keeps Skills outside plugin totals", () => {
  assert.match(html, /<footer class="dsh-site-footer">/);
  assert.match(html, /查看 Agent 能力评测/);
  assert.match(html, /href="\.\/skills\.html#ranking">Skills 榜单/);
  assert.match(html, /manifest\.datasets\.skills\?\.count/);
  assert.doesNotMatch(html, /隐藏 Skill 仓库|hideSkills|manifestSkillCount/);
  assert.match(skills, /manifest\?\.datasets\?\.skills\?\.url/);
  assert.match(html, /plugin\.type\?\.toLowerCase\(\) === "cordis-plugin"/);
  assert.match(skills, /const LEGACY_FULL_URL = "\/data\/rankings\.json"/);
  assert.match(skills, /legacy\?\.rankings\?\.total \?\? legacy\?\.rankings \?\? \[\]/);
  assert.match(skills, /entry\?\.type === "skill"/);
  assert.match(skills, /不参与插件 Top 100/);
});

test("shares one category interaction system across Plugin and Skills directories", () => {
  assert.match(html, /href="\.\/category-system\.css\?v=20260919-evaldock1"/);
  assert.match(skills, /href="\.\/category-system\.css\?v=20260919-evaldock1"/);
  assert.match(html, /renderCategoryOptions\(document\.querySelector\("#plugin-category-options"\)/);
  assert.match(skills, /renderCategoryOptions\(document\.querySelector\("#skill-category-options"\)/);
  assert.match(categorySystem, /label: "Agent 增强"/);
  assert.match(categorySystem, /id: "knowledge",\s*label: "知识"/);
  assert.match(categorySystem, /className = "category-icon"/);
  assert.match(categoryStyles, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(categoryStyles, /scroll-snap-type: inline proximity/);
  assert.match(categoryStyles, /@media \(min-width: 641px\) and \(max-width: 1100px\)[\s\S]*?\.category-count \{ display: none; \}/);
  assert.doesNotMatch(skills, /<select[^>]+id="category"/);
  assert.match(skills, /aria-label="Skill 分类"/);
  assert.match(html, /旧快照已过滤.*个非参榜项目.*刷新页面获取最新榜单/);
});

test("aligns installation controls and badges while keeping utility text readable", () => {
  const badge = html.match(/\.trust-pill,\s*\.type-pill\s*\{([^}]+)\}/)?.[1];
  const skillsLink = html.match(/\.skill-filter\s*\{([^}]+)\}/)?.[1];
  const listHead = html.match(/\.list-head\s*\{([^}]+)\}/)?.[1];
  assert.ok(badge && skillsLink && listHead);
  assert.match(badge, /align-items: center/);
  assert.match(badge, /justify-content: center/);
  assert.match(badge, /font: 600 11px\/1\.4 var\(--sans\)/);
  assert.match(skillsLink, /font: 700 14px\/1\.4 var\(--sans\)/);
  assert.match(skillsLink, /justify-content: center/);
  assert.match(listHead, /font: 700 13px\/1\.4 var\(--sans\)/);
  assert.match(html, /\.meta-growth\s*\{[^}]*font: 600 13px\/1\.5 var\(--sans\)/);
  assert.match(html, /\.meta-growth:not\(\[hidden\]\)[^}]*display: inline-flex/);
  assert.match(html, /\.growth-period \{ white-space: nowrap;/);
  assert.match(html, /period\.className = "growth-period"/);
  assert.match(html, /id="tab-rising"[^>]*>\s*新锐榜\s*<\/button>/);
});

test("keeps category counts and tooltip totals legible without compressing digits", () => {
  const countStyle = categoryStyles.match(/\.category-count\s*\{([^}]+)\}/)?.[1];
  const titleStyle = categoryStyles.match(/\.category-description-title\s*\{([^}]+)\}/)?.[1];
  assert.ok(countStyle && titleStyle);
  assert.match(countStyle, /font: 600 12px\/1\.4 var\(--sans\)/);
  assert.match(countStyle, /flex-shrink: 0/);
  assert.match(countStyle, /color: var\(--muted\)/);
  assert.match(titleStyle, /font: 700 13px\/1\.4 var\(--sans\)/);
  for (const style of [countStyle, titleStyle]) {
    assert.match(style, /font-variant-numeric: tabular-nums/);
    assert.match(style, /letter-spacing: normal/);
  }
});

test("distinguishes the toggle filter from the quieter ranking result count", () => {
  const rowStyle = html.match(/\.search-status-row\s*\{([^}]+)\}/)?.[1];
  const resultStyle = html.match(/\.search-result\s*\{([^}]+)\}/)?.[1];
  const filterStyle = html.match(/\.install-filter\s*\{([^}]+)\}/)?.[1];
  assert.ok(rowStyle && resultStyle && filterStyle);
  assert.match(rowStyle, /font: 500 13px\/20px var\(--sans\)/);
  assert.match(rowStyle, /color: var\(--muted\)/);
  assert.match(rowStyle, /font-variant-numeric: tabular-nums/);
  assert.match(rowStyle, /letter-spacing: normal/);
  assert.match(resultStyle, /font: inherit/);
  assert.match(resultStyle, /color: inherit/);
  assert.match(filterStyle, /font: 600 14px\/20px var\(--sans\)/);
  assert.match(filterStyle, /color: var\(--ink\)/);
  assert.match(filterStyle, /background: var\(--card\)/);
  assert.match(filterStyle, /border: 1px solid var\(--line\)/);
  assert.match(filterStyle, /min-height: 44px/);
  assert.match(filterStyle, /align-items: center/);
  assert.match(filterStyle, /justify-content: center/);
});

test("uses a native toggle button with an accessible state and a selected checkmark", () => {
  const button = html.match(/<button class="install-filter"[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /id="installable-only" type="button" aria-pressed="false"/);
  assert.match(button, /aria-hidden="true"/);
  assert.match(button, /<span>仅看有安装源<\/span>/);
  assert.match(html, /installableToggle\.addEventListener\("click",/);
  assert.match(html, /installableOnly = !installableOnly/);
  assert.match(html, /installableToggle\.setAttribute\("aria-pressed", String\(installableOnly\)\)/);
  assert.doesNotMatch(html, /installableToggle\.checked/);
  assert.match(html, /\.install-filter\[aria-pressed="true"\] \{[^}]*background: var\(--accent-soft\)/);
  assert.match(html, /\.install-filter\[aria-pressed="true"\] \.filter-check \{ display: block; \}/);
  assert.match(html, /\.install-filter:focus-visible \{[^}]*outline: 2px solid var\(--accent\)/);
});

test("keeps Skills utility text legible and aligned with Plugin typography", () => {
  assert.match(skills, /--muted: #60646c/);
  assert.match(skills, /\.directory-head p \{[^}]*font-size: 14px;[^}]*font-weight: 400/);
  assert.match(skills, /\.status \{[^}]*font-size: 13px;[^}]*font-weight: 500/);
  assert.match(skills, /class="github-link"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(skills, /link\.setAttribute\("aria-label"/);
});

test("keeps discovery views ordered and uses one persistent ranking search", () => {
  assert.match(html, /id="tab-top100"[\s\S]*id="tab-rising"[\s\S]*id="tab-all"/);
  assert.doesNotMatch(html, /id="tab-category"|data-view="category"|分类榜/);
  assert.match(html, /id="category-filter-panel"/);
  assert.doesNotMatch(html, /id="category-filter-panel" hidden/);
  assert.match(categorySystem, /button\.dataset\.category = definition\.id/);
  assert.match(html, /id="ranking-search"/);
  assert.match(html, /data-search-sort="rank"/);
  assert.match(html, /data-search-sort="relevance"/);
  assert.match(html, /filterDiscoveryEntries\(categoryScoped/);
  assert.match(html, /let activeSearchSort = "relevance"/);
  assert.match(html, /for \(const nextState of Object\.values\(viewState\)\)/);
  assert.doesNotMatch(html, /id="search-(?:top100|rising|all)"/);
});

test("serves local assets with same-origin production ranking data", () => {
  assert.equal(packageJson.scripts.serve, "node scripts/serve-dev.mjs");
  assert.match(devServer, /requestUrl\.pathname\.startsWith\("\/data\/"\)/);
  assert.match(devServer, /https:\/\/www\.dsheval\.ai/);
  assert.match(devServer, /requestUrl\.pathname === "\/api\/events"/);
});

test("keeps the install guide focused and uses the canonical brand name", () => {
  assert.match(html, /<title>插件榜单 · Top100 · EvalDock<\/title>/);
  assert.match(html, /class="top100-section-title" href="\.\/">[\s\S]*?<span>Top100<\/span>[\s\S]*?<\/a>/);
  for (const page of [html, dsh, skills]) assert.doesNotMatch(page, /dsh-Top100|DSH-Top100/);
  assert.match(html, /body:has\(#dsh-view:not\(\[hidden\]\)\) \.hero \{\s*display: none/);
  assert.match(html, /body:has\(#dsh-view:not\(\[hidden\]\)\) \.ranking \{[^}]*scroll-margin-top: var\(--site-header-height\)/);
  assert.match(html, /#dsh-view \{\s*max-width: 800px/);
  assert.match(html, /<h1 class="inline-docs-title" id="inline-dsh-title">安装指南<\/h1>/);
  assert.match(html, /class="dsh-brand-link" href="\/" aria-label="EvalDock 首页"/);
  assert.doesNotMatch(dsh, /dsh-brief-grid|section-kicker|dsh-data-note|3 步完成安装/);
  assert.match(dsh, /网站与插件使用同一份榜单数据/);
  assert.match(dsh, /每日更新/);
  assert.doesNotMatch(dsh, /Manifest 哈希校验/);
  assert.match(dsh, /EvalDock 排行服务/);
  assert.doesNotMatch(dsh, />rankings\.json</);
});

test("shows the beginner guide by default and offers an accessible existing-user path", () => {
  const choices = [...dsh.matchAll(/<input\b[^>]*name="dsh-experience"[^>]*>/g)].map((match) => match[0]);
  assert.equal(choices.length, 2);
  for (const choice of choices) assert.match(choice, /type="radio"/);
  const beginnerChoice = choices.find((choice) => /value="new"/.test(choice));
  const existingChoice = choices.find((choice) => /value="existing"/.test(choice));
  assert.ok(beginnerChoice && existingChoice);
  assert.match(beginnerChoice, /\schecked(?:\s|>|=)/);
  assert.doesNotMatch(existingChoice, /\schecked(?:\s|>|=)/);
  const beginnerPanel = dsh.match(/<[^>]+data-guide-panel="new"[^>]*>/)?.[0];
  const existingPanel = dsh.match(/<[^>]+data-guide-panel="existing"[^>]*>/)?.[0];
  assert.ok(beginnerPanel && existingPanel);
  assert.doesNotMatch(beginnerPanel, /\shidden(?:\s|>|=)/);
  assert.match(existingPanel, /\shidden(?:\s|>|=)/);
  assert.ok(dsh.indexOf('name="dsh-experience"') < dsh.indexOf('id="install"'));
  assert.doesNotMatch(dsh, /class="dsh-method"|id="other-methods"/);
});

test("lets existing users choose their own DSH installation method", () => {
  const existing = dsh.match(/<section\b[^>]*id="existing-install"[\s\S]*?<\/section>/)?.[0];
  assert.ok(existing);
  const methods = existing.match(/<select\b[^>]*data-dsh-method[^>]*>[\s\S]*?<\/select>/)?.[0];
  assert.ok(methods);
  for (const method of ["npx", "global", "source"]) {
    assert.match(methods, new RegExp(`<option[^>]*value="${method}"`));
  }
  assert.match(methods, /<option value="">/);
  const versionInput = existing.match(/<input\b[^>]*data-dsh-version[^>]*>/)?.[0];
  assert.ok(versionInput);
  assert.doesNotMatch(versionInput, /\svalue="[^"]+"/);
  const steps = [...existing.matchAll(/<li\b[^>]*class="dsh-install-step"[^>]*>/g)];
  assert.equal(steps.length, 2);
  for (const [step] of steps) assert.doesNotMatch(step, /\shidden(?:\s|>|=)/);
  const readyGroups = [...existing.matchAll(/<[^>]+data-existing-ready[^>]*>/g)];
  assert.equal(readyGroups.length, 2);
  for (const [group] of readyGroups) assert.match(group, /\shidden(?:\s|>|=)/);
  for (const command of ["install", "check", "start"]) {
    assert.match(existing, new RegExp(`<code[^>]*data-existing-command="${command}"[^>]*><\\/code>`));
    assert.match(existing, new RegExp(`<button[^>]*data-existing-copy="${command}"`));
  }
  assert.doesNotMatch(existing, /data-copy-command="npx @deepseek-ai\/dsh@0\.1\.5-rc\.2/);
});

test("keeps setup before the main three-step installation flow and folds recovery guidance", () => {
  const prepare = dsh.match(/<aside\b[^>]*class="dsh-prepare"[\s\S]*?<\/aside>/)?.[0];
  const install = dsh.match(/<section\b[^>]*id="install"[\s\S]*?<\/section>/)?.[0];
  const confirm = dsh.match(/<section\b[^>]*id="confirm"[\s\S]*?<\/section>/)?.[0];
  const help = dsh.match(/<section\b[^>]*id="help"[\s\S]*?<\/section>/)?.[0];
  assert.ok(prepare && install && confirm && help);
  assert.ok(dsh.indexOf(prepare) < dsh.indexOf(install));
  assert.equal((install.match(/class="dsh-install-step"/g) ?? []).length, 2);
  assert.match(prepare, /href="https:\/\/nodejs\.org\/en\/download"/);
  assert.match(prepare, /Node\.js 24/);
  assert.match(prepare, /npm install -g pnpm@11\.24\.0/);
  assert.ok(prepare.indexOf("Node.js 24") < prepare.indexOf("<details"));
  assert.ok(prepare.indexOf("npm install -g pnpm") < prepare.indexOf("<details"));
  assert.match(confirm, /class="dsh-step-number"[^>]*>3<\/span>/);
  assert.match(confirm, /设置[\s\S]*插件排行/);
  assert.ok(confirm.includes(`<span data-install-version>${packageJson.version}</span>`));
  assert.match(dsh, /不会自动安装榜单中的项目/);
  assert.match(html, /\.dsh-open-target strong \{[^}]*color: var\(--ink\)/);
  assert.match(html, /#dsh-view \.dsh-step-content > \.dsh-success \{[^}]*color: var\(--muted\)/);
  assert.doesNotMatch(html, /#dsh-view \.dsh-step-content > \.dsh-success \{[^}]*font-size/);
  assert.match(help, /^<section[^>]*>\s*<details\b/);
  assert.doesNotMatch(help, /<details[^>]*\sopen(?:\s|>|=)/);
  assert.match(help, /pnpm/);
  assert.match(help, /安装后找不到/);
  assert.match(help, /发布等待期|minimumReleaseAge/);
  assert.match(help, /npx 长时间没有输出/);
  assert.match(help, /id="features"/);
  assert.match(help, /EvalDock 排行服务/);
  assert.match(dsh, /安装和启动必须使用相同的命令前缀/);
  assert.match(help, /不要单独添加 <code>--legacy-peer-deps/);
});

test("keeps displayed commands equal to copied commands and pins the beginner DSH version", () => {
  const decode = (value) => value.replace(/&#10;|&#x0a;/gi, "\n").replace(/&amp;/g, "&");
  const commands = [...dsh.matchAll(/data-copy-command="([^"]+)"/g)].map((match) => decode(match[1]));
  const displayed = [...dsh.matchAll(/<code class="dsh-install-command">([^<]+)<\/code>/g)].map((match) => decode(match[1]));
  assert.deepEqual(commands, displayed);
  for (const command of [
    "node --version\nnpm --version\npnpm --version",
    "npm install -g pnpm@11.24.0",
    `npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@${packageJson.version}`,
    "npx @deepseek-ai/dsh@0.1.5-rc.2 web",
    "npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web list --depth 0",
  ]) assert.ok(commands.includes(command), `missing copyable command: ${command}`);
  assert.doesNotMatch(dsh, /npx @deepseek-ai\/dsh (?:plugin|web|--version)/);
  const labels = [...dsh.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(labels).size, labels.length);
});

test("keeps other-plugin instructions optional after installation succeeds", () => {
  const usage = dsh.match(/<section\b[^>]*id="use-plugins"[\s\S]*?<\/section>/)?.[0];
  assert.ok(usage);
  assert.match(usage, /^<section[^>]*>\s*<details\b/);
  assert.doesNotMatch(usage, /<details[^>]*\sopen(?:\s|>|=)/);
  for (const action of ["安装", "配置", "重启", "查看项目"]) assert.ok(usage.includes(action));
  assert.match(usage, /来源校验不等于安全审核/);
  assert.match(usage, /href="#restart"/);
  assert.ok(dsh.indexOf('id="restart"') > dsh.indexOf('id="help"'));
  assert.ok(dsh.indexOf('class="dsh-scope-note"') < dsh.indexOf('id="install"'));
  assert.ok(dsh.indexOf('id="install"') < dsh.indexOf('id="confirm"'));
  assert.ok(dsh.indexOf('id="existing-install"') < dsh.indexOf('id="confirm"'));
  assert.ok(dsh.indexOf('id="confirm"') < dsh.indexOf('id="use-plugins"'));
  assert.ok(dsh.indexOf('id="use-plugins"') < dsh.indexOf('id="help"'));
});

test("uses a small success screenshot and keeps the installation example in optional help", async () => {
  const confirm = dsh.match(/<section\b[^>]*id="confirm"[\s\S]*?<\/section>/)?.[0];
  const usage = dsh.match(/<section\b[^>]*id="use-plugins"[\s\S]*?<\/section>/)?.[0];
  assert.ok(confirm && usage);
  assert.doesNotMatch(dsh, /id="preview"/);
  assert.match(confirm, /本地开发版截图/);
  assert.match(confirm, /dsh-plugin-market\.png/);
  assert.doesNotMatch(confirm, /<details/);
  const example = usage.match(/<details class="dsh-detail dsh-install-example">[\s\S]*?<\/details>/)?.[0];
  assert.ok(example);
  assert.match(example, /dsh-install-confirm\.png/);
  assert.doesNotMatch(example, /<details[^>]*\sopen(?:\s|>|=)/);
  for (const section of [confirm, example]) {
    const images = [...section.matchAll(/<img src="([^"]+)" width="(\d+)" height="(\d+)" loading="lazy" decoding="async" alt="([^"]+)">/g)];
    assert.equal(images.length, 1);
    const [, src, width, height] = images[0];
    assert.match(src, /^\.\/assets\/dsh-(plugin-market|install-confirm)\.png$/);
    const image = await readFile(new URL(src.replace("./", "../public/"), import.meta.url));
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), Number(width));
    assert.equal(image.readUInt32BE(20), Number(height));
    assert.ok(image.length < 400_000);
    assert.ok(section.includes(`href="${src}" target="_blank" rel="noopener noreferrer"`));
  }
  assert.match(html, /#dsh-view \.dsh-preview-link:focus-visible/);
  assert.match(html, /#dsh-view \.dsh-market-preview \{\s*max-width: 320px/);
  assert.match(html, /#dsh-view \.dsh-confirm-preview \{\s*max-width: 480px/);
  assert.doesNotMatch(html, /\.dsh-preview-grid/);
});

test("keeps guide-only contrast readable", () => {
  const guideStyle = html.match(/#dsh-view \{([^}]+)\}/)?.[1];
  assert.ok(guideStyle);
  assert.match(guideStyle, /--muted: #4b4f58/);
  assert.match(guideStyle, /--code-surface: #272962/);
  assert.match(guideStyle, /--code-ink: #f8f8ff/);
  assert.match(html, /#dsh-view \.doc-section > h2 \{[^}]*font-size: 20px/);
  assert.match(html, /\.dsh-detail summary \{[^}]*font: 600 16px/);
  assert.match(html, /\.dsh-detail-body \{[^}]*padding: 0;/);
  assert.doesNotMatch(html, /\.dsh-detail-body \{[^}]*border-left/);
  assert.match(html, /\.dsh-detail summary \{[^}]*color: var\(--ink\)/);
  assert.doesNotMatch(html, /\.dsh-detail\[open\] summary \{/);
  assert.match(html, /\.dsh-command-group \.dsh-command-row \{\s*border: 0/);
  assert.doesNotMatch(html, /\.dsh-method \+ \.dsh-method \{[^}]*border-top/);
  assert.doesNotMatch(html, /\.dsh-detail-body \.dsh-command-row \+ \.dsh-command-row/);
  const luminance = (hex) => hex.match(/[a-f\d]{2}/gi)
    .map((part) => parseInt(part, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const color = (name) => guideStyle.match(new RegExp(name + ": (#[a-f0-9]{6})"))?.[1];
  for (const [foreground, background] of [
    [color("--muted"), "#f8f8ff"],
    [color("--code-ink"), color("--code-surface")],
    ["#ffffff", "#5b5bd6"],
  ]) {
    const light = luminance(foreground), dark = luminance(background);
    assert.ok((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05) >= 4.5);
  }
});

test("keeps ranking rows subtly banded and clamps long plugin names", () => {
  assert.doesNotMatch(html, /tone-soft|tone-paper/);
  assert.doesNotMatch(html, /\.plugin:nth-child\(-n \+ 4\)/);
  assert.match(html, /\.plugin-list\.is-top100-list \.plugin:nth-child\(even\) \{[\s\S]*?var\(--accent-soft\) 22%/);
  assert.doesNotMatch(html, /\.plugin-list\.is-top100-list \.plugin:nth-child\(-n \+ 3\)/);
  assert.doesNotMatch(html, /ranking-(?:glow|orbit-drift)/);
  assert.doesNotMatch(html, /class="signal-field"|class="signal-core"/);
  assert.match(html, /class="hero-side">[\s\S]*?class="install-console"/);
  assert.match(html, /class="release-grid"/);
  assert.match(html, /class="hero-command-row"/);
  assert.match(html, />安装 Top100 到 DSH<\/a>/);
  assert.doesNotMatch(html, /hero-release-version/);
  assert.doesNotMatch(html, /class="release-band"/);
  assert.ok(html.includes(`data-copy-command="npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@${packageJson.version}"`));
  assert.ok(dsh.includes(`@evaldock/dsh-top100-plugin/v/${packageJson.version}`));
  assert.match(dsh, /npx @deepseek-ai\/dsh@0\.1\.5-rc\.2 plugin --profile web add @evaldock\/dsh-top100-plugin/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(html, /\.plugin-name \{[\s\S]*?line-height: 1\.14/);
  assert.match(html, /\.plugin-name-text \{[\s\S]*?padding-bottom: 0\.08em/);
  assert.match(html, /nameText\.title = name/);
  assert.match(html, /\.plugin:hover,[\s\S]*?box-shadow: inset 3px 0 0 var\(--accent\)/);
});
