<p align="center">
  <img src="./docs/assets/dsh-top100-readme-cover.png" alt="dsh-top100 · EvalDock plugin and Skills discovery" width="100%">
</p>

<h1 align="center">dsh-top100</h1>

<p align="center">
  <strong>EvalDock 旗下的插件与 Skills 发现栏目。</strong><br>
  <sub>Discover DSH plugins and Skills with EvalDock, ranked by public GitHub signals.</sub>
</p>

<p align="center">
  <a href="https://www.evaldock.ai/top100/"><img alt="在线体验" src="https://img.shields.io/badge/在线体验-Visit-5865f2?style=flat-square"></a>
  <a href="https://github.com/evaldock/dsh-top100/releases/tag/v1.3.10"><img alt="正式版本 v1.3.10" src="https://img.shields.io/badge/release-v1.3.10-2f6f68?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@dsheval/dsh-top100-plugin"><img alt="npm latest" src="https://img.shields.io/npm/v/%40dsheval%2Fdsh-top100-plugin?style=flat-square&label=npm&color=cb3837"></a>
  <a href="https://www.evaldock.ai/top100/?page=dsh#dsh"><img alt="安装 dsh-top100" src="https://img.shields.io/badge/安装指南-接入_DSH-f2b84b?style=flat-square"></a>
  <a href="./CONTRIBUTING.md"><img alt="参与贡献" src="https://img.shields.io/badge/Contribute-参与贡献-555?style=flat-square&logo=github"></a>
  <a href="https://github.com/evaldock/dsh-top100/issues/new?labels=submission&title=%5BSubmit%5D%20owner%2Frepo"><img alt="提交插件" src="https://img.shields.io/badge/提交插件-Submit-2ea44f?style=flat-square"></a>
  <a href="https://github.com/evaldock/dsh-top100/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/evaldock/dsh-top100?style=flat-square&logo=github&label=Stars"></a>
  <a href="https://www.evaldock.ai/top100/#ranking"><img alt="收录规模以实时榜单为准" src="https://img.shields.io/badge/收录-实时更新-5865f2?style=flat-square"></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/evaldock/dsh-top100?style=flat-square&label=License"></a>
  <a href="https://github.com/evaldock/dsh-top100/actions/workflows/ci.yml"><img alt="CI Status" src="https://img.shields.io/github/actions/workflow/status/evaldock/dsh-top100/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://www.evaldock.ai/top100/"><img alt="每日 06:00 自动更新" src="https://img.shields.io/badge/每日自动更新-06%3A00-2ea44f?style=flat-square"></a>
</p>

<p align="center">
  <strong>官方网站：</strong>
  <a href="https://www.evaldock.ai/top100/"><strong>https://www.evaldock.ai/top100/</strong></a>
</p>

在官网浏览榜单，也可以把榜单带进 DSH，发现、安装和管理插件。综合热度、新锐榜和 Stars 总榜提供不同的比较视角；Skills 保持独立目录。

Top100 是 [EvalDock](https://www.evaldock.ai/) 旗下的插件与 Skills 发现栏目；收录与排行依据公开项目信息，不代表项目已通过能力评测。评测结果与方法请访问 [EvalDock 主站](https://www.evaldock.ai/results)。

## 可以做什么

- **发现插件**：查看中文简介、增长趋势和综合热度，按功能分类、关键词与安装来源筛选。
- **在 DSH 中安装和管理**：核对来源、版本、脚本与风险后确认安装；在设置页查看已安装项和诊断信息。更新默认保留原频道、版本范围或分支，已是最新时不会重复安装。
- **批量更新**：单次最多检查 200 项，逐项说明无需更新或检查失败的原因，可更新项目统一确认后执行。
- **浏览与管理 Skills**：使用独立技能库，不混入插件排名。Skill 由所有 Profile 共用，替换或卸载前完整备份原目录、本地修改和新增文件，操作结果显示备份路径。
- **在对话中获取推荐**：自带 `recommend-dsh-plugins` Skill，通过 `dsh_top100_search` 查询榜单，为具体需求推荐插件。

## 界面预览

截图摄于 2026-09-03：官网为线上页面，DSH 界面为本地开发版截图。界面与榜单数据会随版本和每日更新变化。

### 官网 · 浏览与筛选榜单

<a href="./web/public/assets/dsh-website-preview.jpg">
  <img src="./web/public/assets/dsh-website-preview.jpg" alt="dsh-top100 官网：综合热度榜、分类筛选、搜索和插件列表" width="960">
</a>

### DSH 插件 · 把榜单带进设置页

<a href="./web/public/assets/dsh-plugin-market.png">
  <img src="./web/public/assets/dsh-plugin-market.png" alt="dsh-top100 插件：DSH 设置中的插件市场、已安装和诊断入口" width="640">
</a>

<details>
<summary>查看安装确认界面</summary>

点击「安装」后，先核对精确安装源、将执行的脚本及风险，再确认本次操作。来源校验不等于安全审核。

<a href="./web/public/assets/dsh-install-confirm.png">
  <img src="./web/public/assets/dsh-install-confirm.png" alt="插件安装确认：精确版本、生命周期脚本、重启提醒和风险确认" width="480">
</a>

</details>

## 安装到 DSH

建议使用 **Node.js 24 LTS** 和 **DSH Web 0.1.5-rc.2**。本版同时适配 **DSH Web 0.1.6-alpha.2**，无需为插件升级切换到 alpha。实际验证与限制见[兼容说明](./docs/release-1.3.10.md)。普通 npm/npx 用户请在 DSH 源码目录外，依次运行：

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @dsheval/dsh-top100-plugin@1.3.10
npx @deepseek-ai/dsh@0.1.5-rc.2 web
```

<details>
<summary>新版本被 24 小时等待期拦截怎么办？</summary>

如果提示 `ERR_PNPM_NO_MATURE_MATCHING_VERSION` 或 `minimumReleaseAge`，说明当前环境要求等待新版本发布满一定时间。需要立即安装时，在当前 Web Profile 的 `pnpm-workspace.yaml` 中合并以下条目，保留其他配置和已有例外：

```yaml
minimumReleaseAgeExclude:
  - '@dsheval/dsh-top100-plugin@1.3.10'
```

默认文件位于用户主目录下的 `.dsh/profiles/web/pnpm-workspace.yaml`；设置了 `DSH_HOME` 时使用该目录下的 `profiles/web/pnpm-workspace.yaml`。首次安装命令会准备 Profile；尚未创建 Profile 时，可先运行 `npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web list`。若 Profile 已存在但缺少 `pnpm-workspace.yaml`，请在该 Profile 目录中创建此文件，再加入上述配置。全局或源码用户需沿用各自的命令前缀。

保存后，用同一种方式重新安装：

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add -w @dsheval/dsh-top100-plugin@1.3.10
```

该例外只放行这个版本，其他依赖仍遵守原等待期；如果报错指向其他包，应单独核对该包。后续升级须使用新版安装指引，不要沿用旧版本例外。

</details>

打开 DSH Web，进入 **设置 → 插件排行**。安装和启动必须使用同一种命令前缀；全局 CLI、源码运行及问题排查见 [安装指南](https://www.evaldock.ai/top100/?page=dsh#dsh)。

这里只安装榜单插件，不会自动安装榜单中的其他项目。安装其他插件前，仍需核对来源、脚本与风险；安装后按提示重启 DSH 并检查运行状态。

插件与官网使用 DSHeval 发布的同一套榜单数据，无需自行运行 Collector 或数据库。插件功能与安装边界详见 [插件 README](./plugin/README.md)，版本变更见 [CHANGELOG](./CHANGELOG.md)。

## 01 · 产品与榜单

dsh-top100 是 DeepSeek Harness 公开插件生态的发现、验证和趋势索引。Plugin 排名单位是 GitHub 仓库；同一仓库即使包含多个插件子包也只占一个名次。Skills 进入独立目录。

| 榜单 | 信号 | 用途 |
| --- | --- | --- |
| **Top 100** | 60%平滑近7日增长＋40%平滑累计 Stars | 查看近期持续受关注的 Plugin 仓库，最多100项 |
| **新锐榜** | 近3日净增长，按原有仓库规模修正 | 兼顾中小项目的近期涨势，最多100项 |
| **Stars 总榜** | 当前 GitHub Stars 总数 | 浏览全部活跃、已验证 Plugin |
| **Skills 技能库** | 独立目录，默认按 Stars 稳定浏览 | 发现可复用的 Agent Skills；不产生 Plugin 名次 |

Agent 增强、外观、编程、知识、工具和安全是目录筛选条件，不是第四张榜。DeepSeek 依据 README 为每个仓库选择 1 个主分类，并增加 1–2 个有明确依据的相关分类；分类可以叠加在综合热度、涨势或 Stars 排序之上。分类结果在后端生成并保存到 SQLite，公开 JSON 同步携带分类、置信度和简短依据。模型不可用时使用可追踪的规则回退，后续任务会继续补齐智能分类。

两榜使用所属 GitHub 仓库 Stars，不代表具体插件的使用量或质量。增长展示保留负数，未知显示数据不足。旧历史不补造成功观测时间；过渡期可使用截止日期内的历史快照，来源与估算限制统一在排名方法说明，准确观测优先，超过固定窗口后不再回退。数据不足允许短榜或空榜。

## 02 · 如何尽可能完整地发现仓库

GitHub 没有 DSH 官方全局插件注册表，因此系统采用多来源召回，再使用同一验证器过滤噪声。

```text
多来源候选 → 合并去重 → 结构验证 → README 智能分类 → SQLite 快照 → 公开榜单 JSON
```

1. **Repository Search**：搜索 DSH 名称、描述、README 与 topics。
2. **Code Search**：寻找 `SKILL.md`、DSH/Cordis 配置和依赖等强结构标记。
3. **生态来源**：补充 npm、Awesome 列表、相关组织仓库、历史目录和用户提交。
4. **递归分片**：每周完整发现按创建时间切分，必要时再按 Stars 和仓库大小切分，避免 GitHub 单次搜索 1,000 条结果上限造成静默遗漏。
5. **稳定去重**：优先使用 GitHub repository ID；同一仓库从多个来源命中时合并并保留全部来源证据。

## 03 · 什么仓库可以进入榜单或目录

Topic 和关键词只负责召回，不直接证明兼容性。只有通过 DSH/Cordis 结构验证的 Plugin 才能参与榜单；通过 Skill 结构验证的仓库进入独立 Skills 技能库。

| 检查 | 通过条件 | 处理方式 |
| --- | --- | --- |
| 仓库状态 | 公开、未归档、不是 fork | 不符合则排除 |
| 结构证据 | Skill 文件、Cordis/DSH 配置、package 声明或可解析插件子目录 | 按证据类型进入 Plugin 榜单或 Skills 目录 |
| 数据完整性 | 仓库 ID、名称、Stars、更新时间和来源可读取 | 失败时保留上次有效数据 |
| 社区提交 | 与自动发现候选使用相同验证规则 | 提交不等于直接入榜 |

## 04 · Top 100 如何计算

Top 100 使用 100 分加权模型。榜单按综合热度分排序，同时保留真实 GitHub Stars 和增长数据供比较；Stars 总榜则按 GitHub Stars 总数排序。

热度榜：`60 × √G7/(√G7+√20) + 40 × √S/(√S+√100)`，至少10星且有有效7日观测。

新锐榜（近期涨势）：原始得分 `R=G3 / √(B3+50)`，新锐指数 `100×√R/(√R+√5)`（0～100分，按未换算原始值排序），至少3日净增3星且有有效3日观测。

S 为当前仓库 Stars，B3 为3日前 Stars，G3/G7 为对应窗口的非负净增。资料完整度、中文简介和提交频率不加分。
实际观测间隔与目标窗口相差不超过6小时，缺日或刷新失败不能制造日增。完整口径与过渡规则见 [排行规则](docs/ranking.md)。

## 05 · 数据、更新与可靠性

系统使用 SQLite 保存仓库状态、每日 Stars、中文简介来源、README 分类和采集审计；静态前端只读取发布后的 JSON，不连接数据库，也不持有 GitHub 或模型 API Key。

| 公开文件 | 内容 |
| --- | --- |
| `/data/manifest.json` | 官网使用的短缓存入口，引用同一 `snapshotId` 下的不可变榜单分片 |
| `/data/snapshots/{snapshotId}/hot.json` | 官网首屏使用的精简 Top 100 综合热度榜 |
| `/data/snapshots/{snapshotId}/rising.json` | 点击新锐榜后按需加载的精简数据 |
| `/data/snapshots/{snapshotId}/skills.json` | 独立 Skills 技能库；不参与 Plugin 排名 |
| `/data/snapshots/{snapshotId}/total/page-NNN.json` | GitHub Stars 总榜，每页 100 条 |
| `/data/snapshots/{snapshotId}/categories/{id}/page-NNN.json` | 六个 Plugin 分类筛选结果的独立 100 条分页 |
| `/data/snapshots/{snapshotId}/search.json` | 用户首次全站搜索时才加载的紧凑索引 |
| `/data/rankings.json` | 完整聚合数据、Plugin 榜单定义、分类定义和 Skills 目录 |
| `/data/rankings-hot.json` | Top 100 独立数据 |
| `/data/rankings-rising.json` | 新锐榜独立数据 |
| `/data/rankings-total.json` | Plugin Stars 总榜的完整仓库数据 |
| `/data/rankings-skills.json` | Skills 技能库兼容接口 |
| `/data/rankings-search.json` | 面向插件总榜、搜索和 Agent 推荐的紧凑索引 |

官网与当前源码插件优先消费 `manifest + snapshot 分片`；插件安装校验通过紧凑索引定位单个总榜分页。已有 `rankings*.json` 接口继续发布，供已发布的 `@dsheval/dsh-top100-plugin@1.1.0` 和其他既有消费者兼容使用。

安装目标优先选择 README 中明确指向当前仓库的 GitHub 命令；npm 命令必须与 Collector 在选中插件目录中识别的 `package.json` 包名一致，不能把前置市场或其他依赖的安装命令当作当前项目。搜索快照中的可选 `installTarget` 只保留语法白名单内的单一目标，npm 目标同时携带 `installPackageName`。缺少包名依据的旧 npm 索引只提供项目链接，重新生成快照后再按新证据展示安装入口；这不等同于代码安全审计或 npm 发布者认证。

- 北京时间每天 `06:00` 运行增量发现并刷新全部已收录仓库。
- 每周启动完整分片发现，在当日日更发布验收后分段运行；中断后续跑，候选分批验证，不阻塞已有榜单的日常发布。
- 公开 JSON 先写临时文件，再原子替换，避免读到半成品数据。
- 网络或模型调用失败时保留上一次有效数据，不阻断榜单发布。
- 数据库、快照和缓存集中保存在 `runtime/`，可整体备份与迁移。

## 面向生态索引与榜单

其他 Awesome 列表、插件市场、研究项目或排行榜可以将 dsh-top100 识别为：

- **名称**：dsh-top100
- **类型**：DeepSeek Harness plugin directory and ranking index
- **覆盖对象**：DSH plugins、DSH Skills、Cordis integrations、agent tools
- **更新频率**：每日增量、每周完整发现
- **主要信号**：仓库累计 Stars 与有效窗口增长；来源验证独立展示
- **数据输出**：公开 JSON
- **许可证**：MIT

## License

[MIT](./LICENSE)

### 校对简介的维护

`collector/config/reviewed-descriptions.json` 是服务端的固定复核源；来源绑定、质量判断、待复核和撤回均在采集与发布阶段执行。最终 `descriptionZh`、`descriptionStatus` 与 `descriptionPolicy: "server-v1"` 一起进入所有不可变快照和兼容数据文件，快照 ID 包含最终结果，普通文案修改后重新发布服务端数据即可，官网和新版插件无需重新构建。插件与官网只使用已发布结果并清理展示格式，不打包复核表或从作者描述补写中文。

升级到此架构仍需发布一次新版插件。旧版 1.3.7 及更早版本含本地复核逻辑，无法保证服从后续服务端修订，应提示用户升级；新版遇到无 `descriptionPolicy` 的旧缓存/旧协议仅隐藏简介，保留排名与安装信息。已知 v2 manifest 后不再降级到旧兼容文件；离线只显示当前已知快照的缓存，缺少该分片时报错。缓存有效期仍为 30 分钟，可手动刷新；有效期内或完全离线时无法获知尚未收到的撤回，不承诺即时同步。过期请求等待刷新，失败可使用当前快照并显示缓存状态。

`descriptionPolicy: "server-v1"` 是稳定的数据契约标记，不是文案、prompt、模型或复核规则的版本号；这些服务端内容变化不能改动该标记或要求同步升级 npm 插件。只有不兼容的数据契约、插件功能/UI 或宿主兼容改动才需要评估插件发版。

`npm run descriptions:build` 仅生成官网展示格式与安装评估脚本。修订服务端文案后执行相关离线回归与 `npm run check`，再按部署流程重发服务端数据。无需付费模型或全库重跑。

### npm 插件打包检查

安装开发依赖后运行 `npm run plugin:pack:check`，与 CI 使用同一检查。命令通过 `npm pack` 执行插件的 `prepack` 完整构建，并检查实际安装包中的声明入口、类型文件、DSH 前端注册、Bundle 配置、技能文件，并确认安装包不含简介复核表及服务端语义规则。技能与配置会同当前源码比对，防止遗漏或打入旧内容。

该命令会重建 `plugin/lib` 和 `plugin/client`；临时安装包检查后自动清理，不发布到 npm。CI 每次运行都执行该步骤，保留现有安全审计、测试和镜像构建。

用 `node --import tsx scripts/check-description-decoupling.mts /绝对路径/候选包.tgz` 可离线验收文案解耦：脚本解开同一安装包，只连接临时本地 HTTP 服务，发布模拟修订、撤回和待复核快照；检查网站与包内宿主代码同步、离线缓存不复活旧文案，并输出安装包哈希。模拟文案仅存在测试进程，不改写正式复核文件。
