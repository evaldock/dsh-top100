/** Localize stable diagnostic codes; never translate by parsing raw error text. */

import type { DiagnosticBundle, DiagnosticFinding, DiagnosticReport } from "../shared/types.js";

export type DiagnosticLanguage = "zh" | "en";
export interface DiagnosticPresentation { message: string; technicalDetails: string | null }

export function diagnosticLabels(language: DiagnosticLanguage) {
  return language === "en"
    ? { technicalDetails: "Technical details", information: "Information" }
    : { technicalDetails: "技术详情", information: "提示" };
}

function parameter(finding: DiagnosticFinding, key: string): string | null {
  const value = finding.parameters?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function listParameter(finding: DiagnosticFinding, key: string): string[] | null {
  const value = finding.parameters?.[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function only<T>(items: T[]): T | undefined { return items.length === 1 ? items[0] : undefined; }

function bundleError(reason: string | null | undefined, language: DiagnosticLanguage): string {
  const messages: Record<string, [string, string]> = {
    "package-missing": ["包未解析到安装目录", "The package installation directory could not be resolved."],
    "manifest-unreadable": ["package.json 不可读", "The package.json manifest could not be read."],
    "not-dsh-bundle": ["不是 DSH bundle（缺少 dsh 清单字段）", "The package is missing the dsh manifest field required for a DSH bundle."],
    "patch-invalid": ["插件补丁缺失或无效；请查看技术详情", "The plugin patch is missing or invalid. See technical details."],
  };
  return messages[reason ?? ""]?.[language === "en" ? 1 : 0]
    ?? (language === "en" ? "The plugin could not be validated. See technical details." : "插件未通过检查，请查看技术详情");
}

export function presentDiagnosticBundleError(bundle: DiagnosticBundle, language: DiagnosticLanguage): DiagnosticPresentation | null {
  if (!bundle.error) return null;
  const message = bundleError(bundle.errorCode ?? (!bundle.directory ? "package-missing" : undefined), language);
  return { message, technicalDetails: bundle.error !== message ? bundle.error : null };
}

export function presentDiagnosticFinding(
  finding: DiagnosticFinding,
  report: DiagnosticReport,
  language: DiagnosticLanguage,
): DiagnosticPresentation {
  const en = language === "en";
  const bundle = report.bundles.find((item) => item.name === finding.subject);
  let message: string;
  switch (finding.code) {
    case "runtime-missing-services":
      message = en ? `Required services are missing: ${(listParameter(finding, "services") ?? []).join(", ")}. Check the author’s configuration and companion plugins.`
        : `缺少必需服务：${(listParameter(finding, "services") ?? []).join("、")}。请检查作者要求的配置或配套插件。`;
      break;
    case "runtime-failed":
      message = en ? "The plugin failed to load. Check logs for the cause." : "插件加载失败，请查看日志中的具体原因。";
      break;
    case "runtime-restart-required":
      message = en ? "Configuration changed. Restart, then refresh to verify." : "配置已改变，重启后刷新验证。";
      break;
    case "profile-missing":
      message = en ? "The Profile directory or package.json could not be read." : "Profile 目录或 package.json 不可读取。";
      break;
    case "catalog-unreachable":
      message = en ? "The catalog is unavailable. Check the connection and data source." : "榜单不可用，请检查连接和数据源。";
      break;
    case "catalog-stale": {
      const days = parameter(finding, "days") ?? report.catalog.staleDays;
      message = days === null
        ? en ? "The catalog snapshot is out of date." : "榜单快照已过期。"
        : en ? `The catalog snapshot is ${days} days old.` : `榜单快照已有 ${days} 天。`;
      break;
    }
    case "user-patch-invalid":
      message = en ? "The user patch could not be read or is not a valid DSH patch list." : "用户补丁不可读取或不是有效的 DSH 补丁列表。";
      break;
    case "bundle-unresolved":
      message = bundleError(parameter(finding, "reason") ?? bundle?.errorCode ?? (bundle && !bundle.directory ? "package-missing" : undefined), language);
      break;
    case "bundle-local":
      message = en ? "Local link/file plugins must be updated at their source." : "本地 link/file 插件需在来源目录更新。";
      break;
    case "bundle-unlisted":
      message = en ? "No catalog entry could be matched. This does not prevent the plugin from running." : "尚未匹配到榜单条目，不影响插件运行。";
      break;
    case "bundle-disabled":
      message = en ? "All loading entries for this plugin are disabled in the current configuration." : "当前配置已停用该插件的全部加载行。";
      break;
    case "peer-missing":
    case "peer-mismatch": {
      const missing = finding.code === "peer-missing";
      const peer = only(report.peers.filter((item) => item.plugin === finding.subject && (missing ? item.resolved === null : item.satisfied === false)));
      const dependency = parameter(finding, "dependency") ?? peer?.name;
      const range = parameter(finding, "range") ?? peer?.range;
      const resolved = parameter(finding, "resolved") ?? peer?.resolved;
      if (dependency && range && (missing || resolved)) {
        message = missing
          ? en ? `Required dependency ${dependency} is missing (declared ${range}).` : `缺少必需依赖 ${dependency}（声明 ${range}）。`
          : en ? `${dependency} requires ${range}, but resolves to ${resolved}.` : `${dependency} 声明 ${range}，解析到 ${resolved}。`;
      } else {
        message = missing
          ? en ? "A required peer dependency is missing. See technical details." : "缺少必需依赖，请查看技术详情。"
          : en ? "A peer dependency version does not satisfy the declared range. See technical details." : "依赖版本不满足声明范围，请查看技术详情。";
      }
      break;
    }
    case "host-core-dependency": {
      const dependency = parameter(finding, "dependency") ?? only(report.hostDeps.filter((item) => item.plugin === finding.subject))?.dependency;
      message = dependency
        ? en ? `Core package ${dependency} is declared in dependencies.` : `把核心包 ${dependency} 写进了 dependencies。`
        : en ? "A core package is declared in dependencies. See technical details." : "把核心包写进了 dependencies，请查看技术详情。";
      break;
    }
    case "duplicate-entry": {
      const layers = listParameter(finding, "layers") ?? report.duplicates.find((item) => item.id === finding.subject)?.layers;
      message = layers?.length
        ? en ? `The loading ID appears in ${layers.join(" / ")}.` : `加载 id 出现在 ${layers.join(" / ")}。`
        : en ? "The loading ID is declared by multiple bundles." : "多个插件声明了同一个加载 id。";
      break;
    }
    case "skill-manifest-missing":
      message = en ? "The Skill directory is missing SKILL.md." : "Skill 目录缺少 SKILL.md。";
      break;
    case "core-multi-version": {
      const versions = listParameter(finding, "versions") ?? report.multiVersion.find((item) => item.name === finding.subject)?.versions;
      message = versions?.length
        ? en ? `The lockfile contains multiple versions: ${versions.join(" / ")}.` : `锁文件里有多个版本：${versions.join(" / ")}。`
        : en ? "The lockfile contains multiple versions of this core package." : "锁文件中该核心包存在多个版本。";
      break;
    }
    case "patch-orphan":
      message = en ? "The user patch disables an ID that is absent from the current loading layers." : "用户补丁停用了一个当前加载层找不到的 id。";
      break;
    case "extra-dependency":
      message = en ? "The package is listed in package.json but not in dsh.profile.bundles loading order." : "写在 package.json 里，但不在 dsh.profile.bundles 加载顺序中。";
      break;
    default:
      message = en ? "An additional diagnostic finding was reported. See technical details." : "发现其他诊断问题，请查看技术详情。";
  }
  const technicalDetails = [finding.message !== message ? finding.message : null, finding.detail]
    .filter((value): value is string => Boolean(value)).join("\n");
  return { message, technicalDetails: technicalDetails || null };
}
