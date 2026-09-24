import { catalogSourceStatus, discoveryNeedsReview } from "./install-assessment.js";
import { reviewedInstallCapability } from "./catalog-reviewed-install.js";
/** Conservative website presentation for public catalog entries.
 * Mirrors the DSH plugin's allow-listed install target rules without executing catalog commands.
 */

import { resolveCatalogInstallTarget } from "./install-source.js";

export function resolveInstallTarget(entry) {
  return resolveCatalogInstallTarget(entry ?? {});
}

export function installCommand(entry) {
  if (discoveryNeedsReview(entry) || catalogSourceStatus(entry) === "invalid") return null;
  const target = resolveInstallTarget(entry);
  return target
    ? `npx @deepseek-ai/dsh plugin --profile web add ${target}`
    : null;
}

export function catalogInstallCapability(entry) {
  const reviewed = reviewedInstallCapability(entry);
  if (reviewed) return reviewed;
  if (discoveryNeedsReview(entry) && (entry.install?.discovery ?? entry.discovery)?.functionReview?.decision === "held") {
    return { label: "功能说明待确认", reason: "已识别到 DSH 组件，但用于确认功能的源码发生了变化。本站尚未完成对这些变化的复核，旧简介暂停展示；请查看作者说明。" };
  }
  if (discoveryNeedsReview(entry)) return { label: "插件身份待确认", reason: "本站尚未确认该项目当前是否仍提供 DSH 插件。历史收录不代表当前仍可作为插件使用，请查看作者项目说明。" };
  const status = catalogSourceStatus(entry);
  const assessments = {
    verified: { label: "安装信息已核对", reason: "本站已核对安装包的仓库归属、插件声明及版本。尚未实际安装或测试功能。" },
    invalid: { label: "安装信息检查未通过", reason: "上次检查发现安装包不存在，或包声明、仓库归属不符合要求。具体原因见检查记录，请先查看作者安装说明。" },
    unavailable: { label: "安装信息暂未核实", reason: "已找到安装命令，但上次未能读取完整的安装包信息；这不代表项目无法安装。" },
    stale: { label: "安装信息需重新核对", reason: "已找到安装命令，但现有检查记录已过期或检查时间无效，本站需要重新核对当前安装信息。" },
  };
  if (assessments[status]) return assessments[status];
  if (!resolveInstallTarget(entry)) {
    return { label: "未找到安装命令", reason: "本站尚未找到与该插件匹配、可直接使用的 DSH 安装命令；不代表无法安装，请查看作者项目说明。" };
  }
  if ((entry?.install?.needsConfig ?? entry?.needsConfig) === true) {
    return { label: "已找到安装命令 · 需配置", reason: "已找到安装命令，尚未核对安装包信息。使用前需要按作者说明完成配置。" };
  }
  return { label: "已找到安装命令", reason: "已从作者说明中识别安装命令，尚未核对安装包信息；配置要求请查看作者说明。" };
}

export function catalogPresentation(entry) {
  const type = String(entry?.type ?? "").toLowerCase();
  const target = resolveInstallTarget(entry);
  const discovery = entry?.install?.discovery ?? entry?.discovery;
  const structured = !discoveryNeedsReview(entry) && (type === "skill" || type === "cordis-plugin" || type === "cordis");
  const formFactor = type === "skill"
    ? "技能"
    : structured
      ? discovery?.status === "verified" && discovery.kind === "bundle"
        ? "DSH 插件包"
        : discovery?.status === "verified" && discovery.kind === "client"
          ? "DSH 客户端插件"
          : "DSH 插件"
      : "相关项目";
  return {
    formFactor,
    formFactorDescription: {
      "技能": "通过技能说明指导智能体完成任务。",
      "DSH 插件包": "采用 DSH 的 Bundle 格式打包扩展内容；这个标签只表示打包形式，不代表安装或功能已测试通过。",
      "DSH 客户端插件": "扩展 DSH 客户端的界面或交互；具体适用的客户端请查看项目说明。",
      "DSH 插件": "已识别到 DSH 插件结构；具体用途见项目简介。",
      "相关项目": "已收录的相关项目，当前插件结构尚未确认。",
    }[formFactor],
    trustLevel: target ? "install-source" : structured ? "structured" : "indexed",
    trustLabel: target ? "安装源可解析" : structured ? "结构已识别" : "已进入索引",
    installable: Boolean(target),
  };
}
