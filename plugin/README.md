<p align="center">
  <img src="https://raw.githubusercontent.com/evaldock/dsh-top100/main/docs/assets/dsh-top100-readme-cover.png" alt="dsh-top100 · EvalDock plugin and Skills discovery" width="100%">
</p>

<h1 align="center">dsh-top100 · DSH 插件</h1>

<p align="center">
  <strong>把插件榜单带进 DSH，发现、安装和管理插件。</strong><br>
  <sub>Discover and manage DeepSeek Harness plugins in DSH Web, with Skills in a separate directory.</sub>
</p>

<p align="center">
  <a href="https://www.evaldock.ai/top100/"><img alt="在线体验" src="https://img.shields.io/badge/在线体验-Visit-5865f2?style=flat-square"></a>
  <a href="https://github.com/evaldock/dsh-top100/releases/tag/v1.3.11"><img alt="正式版本 v1.3.11" src="https://img.shields.io/badge/release-v1.3.11-2f6f68?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@evaldock/dsh-top100-plugin"><img alt="npm latest" src="https://img.shields.io/npm/v/%40evaldock%2Fdsh-top100-plugin?style=flat-square&label=npm&color=cb3837"></a>
  <a href="https://www.evaldock.ai/top100/?page=dsh#dsh"><img alt="安装 dsh-top100" src="https://img.shields.io/badge/安装指南-接入_DSH-f2b84b?style=flat-square"></a>
  <a href="https://github.com/evaldock/dsh-top100/blob/main/CONTRIBUTING.md"><img alt="参与贡献" src="https://img.shields.io/badge/Contribute-参与贡献-555?style=flat-square&logo=github"></a>
  <a href="https://github.com/evaldock/dsh-top100/issues/new?labels=submission&title=%5BSubmit%5D%20owner%2Frepo"><img alt="提交插件" src="https://img.shields.io/badge/提交插件-Submit-2ea44f?style=flat-square"></a>
  <a href="https://github.com/evaldock/dsh-top100/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/evaldock/dsh-top100?style=flat-square&logo=github&label=Stars"></a>
  <a href="https://www.evaldock.ai/top100/#ranking"><img alt="收录规模以实时榜单为准" src="https://img.shields.io/badge/收录-实时更新-5865f2?style=flat-square"></a>
  <a href="https://github.com/evaldock/dsh-top100/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/evaldock/dsh-top100?style=flat-square&label=License"></a>
  <a href="https://github.com/evaldock/dsh-top100/actions/workflows/ci.yml"><img alt="CI Status" src="https://img.shields.io/github/actions/workflow/status/evaldock/dsh-top100/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://www.evaldock.ai/top100/"><img alt="每日 06:00 自动更新" src="https://img.shields.io/badge/每日自动更新-06%3A00-2ea44f?style=flat-square"></a>
</p>

<p align="center">
  <strong>官方网站：</strong>
  <a href="https://www.evaldock.ai/top100/"><strong>https://www.evaldock.ai/top100/</strong></a>
</p>

<p align="center">
  <a href="https://github.com/evaldock/dsh-top100">GitHub 源码</a> · <a href="https://github.com/evaldock/dsh-top100/issues">问题反馈</a>
</p>

在 DeepSeek Harness Web 的设置页浏览中文榜单、搜索所需能力，并在核对来源、脚本与风险后确认安装。与官网共用榜单数据，无需自行运行采集器或数据库。

Top100 是 [EvalDock](https://www.evaldock.ai/) 旗下的插件与 Skills 发现栏目；收录与排行依据公开项目信息，不代表项目已通过能力评测。评测结果与方法请访问 [EvalDock 主站](https://www.evaldock.ai/results)。

## 可以做什么

- **插件市场**：综合热度 Top 100、新锐榜（新锐指数0～100分）与 Stars 总榜；支持中文搜索、功能分类和安装来源筛选。
- **Skills 技能库**：独立浏览与搜索，不参与插件排名。
- **已安装**：查看当前配置中的插件与本地 Skill，按操作边界进行更新、启停和卸载。更新会先核对精确版本、来源与脚本；确认后执行，失败或中断时尝试按原锁文件恢复，恢复失败会明确提示。
- **诊断**：只读检查加载冲突、peer 依赖、榜单数据源与用户补丁。
- **对话推荐**：自带 `recommend-dsh-plugins` Skill，通过 `dsh_top100_search` 查询榜单后给出推荐。

## 快速开始

建议使用 **Node.js 24 LTS** 和 **DSH Web 0.1.5-rc.2**。本版同时适配 **DSH Web 0.1.6-alpha.2**，无需为插件升级切换到 alpha。实际验证与限制见[兼容说明](https://github.com/evaldock/dsh-top100/blob/main/docs/release-1.3.11.md)。普通 npm/npx 用户请在 DSH 源码目录外，依次运行：

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@1.3.11
npx @deepseek-ai/dsh@0.1.5-rc.2 web
```

<details>
<summary>新版本被 24 小时等待期拦截怎么办？</summary>

如果提示 `ERR_PNPM_NO_MATURE_MATCHING_VERSION` 或 `minimumReleaseAge`，说明当前环境要求等待新版本发布满一定时间。需要立即安装时，在当前 Web Profile 的 `pnpm-workspace.yaml` 中合并以下条目，保留其他配置和已有例外：

```yaml
minimumReleaseAgeExclude:
  - '@evaldock/dsh-top100-plugin@1.3.11'
```

默认文件位于用户主目录下的 `.dsh/profiles/web/pnpm-workspace.yaml`；设置了 `DSH_HOME` 时使用该目录下的 `profiles/web/pnpm-workspace.yaml`。首次安装命令会准备 Profile；尚未创建 Profile 时，可先运行 `npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web list`。若 Profile 已存在但缺少 `pnpm-workspace.yaml`，请在该 Profile 目录中创建此文件，再加入上述配置。全局或源码用户需沿用各自的命令前缀。

保存后，用同一种方式重新安装：

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add -w @evaldock/dsh-top100-plugin@1.3.11
```

该例外只放行这个版本，其他依赖仍遵守原等待期；如果报错指向其他包，应单独核对该包。后续升级须使用新版安装指引，不要沿用旧版本例外。

</details>

### 已安装旧包的用户

本版包名改为 `@evaldock/dsh-top100-plugin`。请先停止 DSH，备份当前 Web Profile 和 `DSH_HOME/settings.yaml`，然后使用原来的 CLI 前缀依次执行：

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web remove @dsheval/dsh-top100-plugin
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@1.3.11
npx @deepseek-ai/dsh@0.1.5-rc.2 web
```

同一 Profile 只保留一个 Top100 包。安装失败时可重新安装旧包 `@dsheval/dsh-top100-plugin@1.3.10`，恢复后再启动。榜单设置仍使用原来的 `dsh-top100` 命名空间；不要删除设置或缓存目录。若自己写过包含旧包名的加载补丁，需将其中的包名改为新包名，保留 `id: dsh-top100` 和配置。DSH alpha 用户将命令中的宿主版本换成自己正在使用的 `0.1.6-alpha.2`。

打开 DSH Web，进入 **设置 → 插件排行**。安装和启动必须使用同一种命令前缀。

DSH 0.1.5-rc.2 的榜单数据源位于 **设置 → 插件 → 插件配置 → 榜单数据源**；0.1.6-alpha.2 移到侧栏 **插件 → top100-plugin**。检查更新不会自动安装；榜单地址仅在点击保存后通过 DSH 设置服务写入，当前连接无写入权限时显示为只读。

这里只安装榜单插件，不会自动安装榜单中的其他项目。安装其他插件前，仍需核对来源、脚本与风险；来源校验不等于安全审核。安装后按提示重启 DSH 并检查运行状态。

## 界面预览

截图摄于 2026-09-03：官网为线上页面，DSH 界面为本地开发版截图。界面与榜单数据会随版本和每日更新变化。

### 在 DSH 中浏览和管理插件

<a href="https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/dsh-plugin-market.png">
  <img src="https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/dsh-plugin-market.png" alt="dsh-top100 插件：DSH 设置中的插件市场、已安装和诊断入口" width="640">
</a>

### 也可以先在官网发现插件

<a href="https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/dsh-website-preview.jpg">
  <img src="https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/dsh-website-preview.jpg" alt="dsh-top100 官网：综合热度榜、分类筛选、搜索和插件列表" width="960">
</a>

<details>
<summary>查看安装确认界面</summary>

点击「安装」后，先展示精确安装源、将执行的脚本及风险；只有你确认后才会安装。

<a href="https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/dsh-install-confirm.png">
  <img src="https://raw.githubusercontent.com/evaldock/dsh-top100/main/web/public/assets/dsh-install-confirm.png" alt="插件安装确认：精确版本、生命周期脚本、重启提醒和风险确认" width="480">
</a>

</details>

## 更新插件与保留 Skill 修改

“已安装”页默认沿用原版本范围、npm 频道或 GitHub 分支。通过 Top100 安装时会保存精确版本及原来源记录；没有来源记录的精确 npm 版本按兼容范围检查（`1.x` 及以上保留主要版本，`0.x` 保留次要版本）。只有明确选择“切换到最新版”才改用 npm `latest` 或 GitHub 默认分支。无法确认原分支的 GitHub SHA 安装需要明确选择更新方式。

当前版本已最新时不会重复安装，也不会把降级当成更新。列表区分版本检查失败和暂无更新，可主动刷新。批量检查每组最多 20 项，单次最多 200 项；失败和无需更新的项目单独列出，可更新项统一确认后按 Profile 串行执行。检查会话最长 1 小时，全部核验结束后有 10 分钟确认时间；过期需重新核验。

旧安装若直接使用 `beta/latest` 等频道名，pnpm 可能在操作其他包时顺带更新它。“已安装”页会要求先确认“固定当前版本并保留频道”：只把当前版本写成精确依赖、同步锁文件，并保存原频道；不下载、不升级、不执行脚本。该整理支持独立 Profile 的 pnpm v9 锁文件，复杂 workspace、自定义 hook 或范围外依赖会明确停止，需按原工作区方式维护。来源记录注明其依据是既有安装与本地锁文件，后续更新仍重新核验远端目标。

Skills 由所有 Profile 共用。在 Skills 目录点击“安装 / 更新 Skill”即可核对来源并替换原内容；替换或卸载前会将整个原目录移到 `$DSH_HOME/skill-backups/`（未设置 `DSH_HOME` 时为 `~/.dsh/skill-backups/`）。备份包括用户新增文件和本地修改，操作结果会显示路径。失败或取消会尝试恢复原目录；遇到操作期间的外部修改时保留现场和备份，并提示处理。需要恢复时先核对当前目录中的新修改，再从备份目录取回所需文件。

## 在对话中获取推荐

安装插件后，可以在 DSH 对话中直接询问：

```text
推荐几个适合做浏览器自动化的 DSH 插件
我需要长期记忆能力，应该安装哪个插件？
```

模型会通过随包提供的 Skill 和搜索工具查询对应目录的全库数据。推荐功能不会复制或覆盖用户自己的 `~/.dsh/skills` 文件；卸载插件后也会一起移除。

## 其他安装方式与帮助

<details>
<summary>使用全局 dsh 或 DSH 源码</summary>

请选择与你启动 DSH 相同的方式，不要混用命令前缀。

### 从 DSH 源码运行

源码启动需要先准备依赖和构建文件。以下以 DSH Web `0.1.5-rc.2` 为基线；请按该源码版本的 Node 和 pnpm 要求准备环境，把路径替换为本机 DSH 源码仓库的实际绝对路径。

**首次准备，或拉取新的 DSH 源码后：**在源码根目录依次执行，上一条成功后再继续。

```sh
cd /path/to/deepseek-harness
pnpm install
pnpm run build
```

pnpm 是依赖管理和命令运行工具。首次安装会下载整个源码工作区的依赖，因此即使用 Web，也可能看到其他平台、Desktop 或第三方 SDK 的包；这不表示已安装 Top100，也不表示正在调用模型。下载会复用已有缓存，但依赖变化或缓存缺失仍会产生下载。出现 `ECONNRESET` 表示连接中断，请查看是否仍在重试及最终退出结果；平台或循环依赖的 `WARN` 本身不等于失败。无需因升级通知立即升级 pnpm，优先沿用仓库声明的版本。

**首次安装或升级 Top100：**依赖和构建准备成功后执行（不是每次启动都要执行）。

```sh
pnpm dsh plugin --profile web add @evaldock/dsh-top100-plugin@1.3.11
```

**日常启动：**保持终端运行，在浏览器打开终端输出的 Web 地址；结束使用时按 `Ctrl+C` 停止。

```sh
cd /path/to/deepseek-harness
pnpm dsh web
```

源码启动脚本可能先检查、同步工作区依赖，因此不能保证每次完全不下载。若提示客户端构建文件缺失或要求 `pnpm run build`，先停止启动命令，在源码根目录完成构建，再启动 Web。构建报错时保留最后的错误输出，先处理该错误，不要反复安装 Top100 或修改 Profile 试图修复宿主构建。

### 已有全局 CLI

如果 `dsh --version` 可以正常返回，也可以直接使用：

```sh
dsh plugin --profile web add @evaldock/dsh-top100-plugin@1.3.11
dsh web
```

</details>

<details>
<summary>npx 长时间没有输出</summary>

部分 npm 环境可能在首次解析 DSH 依赖时长时间无输出并持续占用 CPU。该问题发生在 DSH npm 发布包的依赖解析阶段，并非 dsh-top100 插件安装失败。如果 `npx @deepseek-ai/dsh --version` 也无法完成，请停止命令并改用源码方式。不要单独添加 `--legacy-peer-deps`，否则可能漏装 DSH 运行时依赖。参见 [DSH 上游讨论](https://github.com/deepseek-ai/deepseek-harness/discussions/3786)。

</details>

更多操作说明见 [官网安装指南](https://www.evaldock.ai/top100/?page=dsh#dsh)。

## 数据源

Host 端读取 EvalDock 的同一份榜单快照，优先从 manifest 定位对应的不可变分片：

```text
https://www.evaldock.ai/data/manifest.json
```

同时保留兼容数据接口：

```text
https://www.evaldock.ai/data/rankings-hot.json
https://www.evaldock.ai/data/rankings-rising.json
https://www.evaldock.ai/data/rankings-search.json
https://www.evaldock.ai/data/rankings.json
```

总榜、分类、全库搜索和 Agent 推荐读取紧凑检索索引；详情和安装预检会按需读取权威总榜分页，补齐 README 摘要、项目元数据与安装证据。成功响应会缓存在 `$DSH_HOME/cache/dsh-top100/`；缓存过期后先返回上一次有效榜单，再在后台刷新，因此短时网络波动不会阻塞已缓存页面。相同数据请求会自动合并，避免并发重复下载。

分类筛选与网页版共用数据中的 `categories` 和每个条目的 `categories` 字段。目前受控分类为 Agent 增强、外观、编程、知识、工具和安全；线上名称、说明和数量更新后，插件会随目录数据同步。Plugin 榜单与 Skills 技能库使用不同数据集。

插件市场的排名、Stars、涨幅、标签和分类来自 EvalDock 发布的快照。中文简介优先使用包内与网站共用的校对数据；只有原始资料匹配，或缺少 README 的搜索条目属于已校对快照时才应用。资料变化后回退到新的有效简介。长简介默认展示两行，可展开全文。浏览器端不会额外请求 GitHub 生成文案。GitHub 用于用户主动打开项目，以及由 Host 预检安装源、获取精确版本内容；实际安装仍需用户确认。

可用环境变量或插件配置覆盖：

```sh
DSH_TOP100_DATA_URL=http://127.0.0.1:8080/data dsh web
```

```yaml
- id: dsh-top100
  name: '@evaldock/dsh-top100-plugin'
  config:
    dataUrl: https://www.evaldock.ai/data
    profile: web
```

## 安装边界

- 浏览器不直连榜单域名，由 Host 拉取。
- 设置页只为已识别安装源的条目提供安装入口；目标通过预检、用户确认后才会安装。「未识别安装源」的条目保留项目链接，不代表项目无法安装。
- 多条命令优先选择当前仓库的 GitHub 来源；npm 目标必须匹配 Collector 识别的插件包名，缺少依据时只保留项目链接。旧搜索索引需要重新发布并刷新缓存后才能恢复有依据的 npm 安装入口。
- 不执行 README 里的安装命令。
- 用户确认前，npm selector 会解析成精确版本，GitHub 来源会解析成 40 位 commit；确认页展示目录声明、实际安装目标、完整性信息、生命周期脚本和风险。
- npm 包声明的 GitHub repository 如与目录仓库冲突会停止安装；未声明可识别仓库时会明确提示身份无法自动绑定。
- GitHub 验证会复用 `GITHUB_TOKEN` 或 `GH_TOKEN`（如已配置）并缓存成功结果；没有 Token 时受 GitHub 匿名额度限制。
- Cordis 插件写入当前 profile；Skill 固定到预检 commit 后只复制仓库内的合法目录到 `~/.dsh/skills`，拒绝源及目标目录的符号链接，并记录文件清单与 SHA-256 内容摘要。
- 安装来源证据写入当前 Profile 的 `.dsh-top100/provenance.json`；一次性确认 Token 不会落盘。
- 同一 profile 的 `pnpm add` 串行执行；Skill 下载最多 3 路并发。
- 安装前后都会执行 DSH profile 配置检查；安装失败或取消时按保存的锁文件恢复依赖并验证，恢复失败会明确提示。配置检查通过只表示 Profile 可组合，界面会继续显示“需重启/运行时未知”，不会宣称插件已经运行。
- 安装接口只接受同源 POST。
- 启停只写当前 profile 的用户 `cordis.patch.yml`，保留原有文件权限和子功能设置；重新启用移除本插件追加的停用项。停用记录或文件被其他操作修改时会保留当前配置并提示检查。
- 更新和卸载复用同一 profile 串行队列；官方包、排行插件自身及 `link:` / `file:` 源按保护规则限制操作。

这些检查只核对结构与来源一致性，不构成代码安全审核，也不保证第三方插件的运行结果。

## 开发

在本仓库根目录验证和构建：

```sh
npm run typecheck -w @evaldock/dsh-top100-plugin
npm run test -w @evaldock/dsh-top100-plugin
npm run build -w @evaldock/dsh-top100-plugin
dsh web --dump-config
```

本地挂载使用 `link:`。把示例路径替换为本机 `plugin` 目录的实际绝对路径，命令前缀与你启动 DSH 的方式保持一致：

```sh
dsh plugin --profile web add link:/path/to/dsh-top100/plugin
```

源码按职责拆分：`src/host` 负责 DSH 接入、HTTP API、推荐 Skill 和模型搜索工具，`src/install` 负责受控安装，`src/client` 负责设置页界面，`src/shared` 只放两端共享的数据契约。Skill 原文位于 `skills/recommend-dsh-plugins/SKILL.md`，发布包会保留该目录。

组成符合官方双端插件手册：`apply` + `Config` schema + `dsh.bundle.patch` + `exports["./client"]`。
