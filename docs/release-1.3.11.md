# 1.3.11 npm 包迁移到 EvalDock

Top100 的正式 npm 包改为 `@evaldock/dsh-top100-plugin`，与 EvalDock 官网和 GitHub 组织一致。1.3.10 的浅色界面、榜单和 DSH 兼容能力继续保留。

## 新安装

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@1.3.11
npx @deepseek-ai/dsh@0.1.5-rc.2 web
```

已有 DSH 请沿用原来的启动方式、版本、Profile 和 `DSH_HOME`。使用 `0.1.6-alpha.2` 的用户将示例中的宿主版本替换为该版本。若环境拦截刚发布的版本，按 README 为新包的精确版本添加 `minimumReleaseAgeExclude`，保留其他限制。

## 从旧包迁移

1. 停止 DSH，备份当前 Profile 目录和 `DSH_HOME/settings.yaml`。默认 `DSH_HOME` 为用户主目录下的 `.dsh`。
2. 使用原来的 CLI 前缀，先移除旧包，再安装新包：

```sh
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web remove @dsheval/dsh-top100-plugin
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web add @evaldock/dsh-top100-plugin@1.3.11
npx @deepseek-ai/dsh@0.1.5-rc.2 plugin --profile web list --depth 0
```

3. 确认列表中只有新包，然后按原方式启动 DSH。不要同时保留两个 Top100 包。

设置命名空间、加载行 ID、缓存目录及本地操作记录名称继续使用 `dsh-top100`，自定义榜单地址继续生效。若自行编写了包含旧包名的加载补丁，需将其中的包名替换为 `@evaldock/dsh-top100-plugin`，保留原 ID 和配置。仅按 ID 修改配置的补丁无需改动。

安装失败时不要启动缺少插件的中间状态。可移除已安装的新包，再重新安装 `@dsheval/dsh-top100-plugin@1.3.10`，必要时恢复备份的自定义加载补丁，然后启动 DSH。旧包与历史版本继续保留，弃用提示不表示安全漏洞。

## 验证范围

本地类型检查、1810 项测试通过，1 项原有测试跳过；8 项安装包检查通过。实际候选包分别在隔离的 DSH Web `0.1.5-rc.2` 和 `0.1.6-alpha.2` 中执行旧包安装、移除、新包安装和启动；确认旧包不再存在，设置及用户补丁逐字节保留，运行时仍使用迁移前的自定义数据源，并返回当天榜单。

2026-09-21 补充浏览器验收：新包在 DSH Web `0.1.5-rc.2` 上通过插件搜索、Skill 榜单、已安装自身识别与保护、诊断和数据源保存检查；在 `0.1.6-alpha.2` 上通过新插件管理页的配置展示与保存、停用后重新启用、配置恢复及榜单加载检查。两种宿主均保持浅色界面，自定义数据源继续生效。验收未配置模型凭据或触发模型请求。未验证 Windows 或第三方 Desktop 宿主。
