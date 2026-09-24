/**
 * 从 README 解析真实安装命令（精确命令优先于类型模板）
 * - 定位安装章节（Install / Setup / Getting Started / 安装 等标题）
 * - 提取代码块 / $ 前缀行中的安装类命令
 * - 清洗 shell 提示符与注释
 */

import { parseDshInstallCommandDetails, stripInstallComment } from "../../plugin/src/shared/install-source.js";

export const INSTALL_PARSER_VERSION = 3;

/** 定位 README 中的安装章节（返回章节文本） */
export function extractInstallSection(readme: string): string | null {
  const lines = readme.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,4})\s+(.+)$/);
    if (!m) continue;
    const lv = m[1].length;
    const title = m[2].toLowerCase();
    if (start < 0) {
      if (
        /^(install|installation|setup|getting started|quick start|deploy|安装|快速开始|开始使用|使用说明)/.test(
          title
        )
      ) {
        start = i;
        level = lv;
      }
    } else if (lv <= level) {
      // 遇到同级或更高级标题，章节结束
      return lines.slice(start + 1, i).join("\n");
    }
  }
  return start >= 0 ? lines.slice(start + 1).join("\n") : null;
}

const INSTALL_CMD_RE =
  /^(git clone|git submodule|git config|pnpm (add|i)\b|npm (install|i)\b|npx skills add|npx @(?!deepseek-ai\/dsh(?:@|\s))[^\s]+ add|curl .*install|pip install|uv (tool )?install|brew install|cargo install|git init)/;

/** A local tarball is README display evidence, never a vetted install target. */
function isDshInstallDisplayCommand(cmd: string): boolean {
  if (parseDshInstallCommandDetails(cmd) !== null) return true;
  const tarball = cmd.match(/\s(\.\/[A-Za-z0-9][A-Za-z0-9._-]*\.tgz)$/);
  if (!tarball) return false;
  // Keep the shared parser's command/flag restrictions without broadening its
  // allow-list of installable npm/GitHub targets to machine-local files.
  return parseDshInstallCommandDetails(cmd.slice(0, -tarball[1].length) + "dsh-local-tarball") !== null;
}

/** 判断是否为安装类命令 */
function isInstallCmd(cmd: string): boolean {
  return isDshInstallDisplayCommand(cmd) || INSTALL_CMD_RE.test(cmd);
}

/** Explicit warnings apply only to commands on that same README line. */
function isProhibitedInstallLine(line: string): boolean {
  const prose = line.replace(/`[^`\r\n]*`/g, "").replace(/[*_]/g, "");
  return /\b(?:do\s+not|don['’]t)\b|\bnever\s+(?:install|run|use|execute)\b|请勿|切勿|不要|禁止/i.test(prose);
}

/** 清洗单行命令：去提示符/注释/无意义前缀 */
function cleanCmdLine(line: string): string {
  let c = line.trim();
  c = c.replace(/^[$\#>]\s*/, "");
  c = stripInstallComment(c);
  // Author documentation often uses a profile placeholder. Substitute only
  // these exact tokens, and only if the entire resulting DSH command is safe.
  const documented = c.replace(/(\s--profile\s+)<(?:name|profile|profile-name)>((?=\s)|$)/g, "$1web");
  if (documented !== c && parseDshInstallCommandDetails(documented)) c = documented;
  // 过滤 cd/mkdir/echo 等纯前置命令（不含 && 链的）
  if (/^(cd |mkdir |echo |touch |cat >|ls |rm )/.test(c) && !c.includes("&&")) return "";
  return c;
}

/** Bounded display evidence; retain DSH commands ahead of generic prerequisites. */
function selectCommands(commands: string[]): string[] {
  return [...new Set(commands)].sort((a, b) =>
    Number(isDshInstallDisplayCommand(b)) - Number(isDshInstallDisplayCommand(a))
  ).slice(0, 32);
}

/** 从安装章节提取安装命令列表，不执行命令。 */
export function extractInstallCommands(section: string): string[] {
  section = section.replace(/[ \t]*\\\r?\n[ \t]*/g, " ");
  const cmds: string[] = [];
  const push = (line: string) => {
    if (isProhibitedInstallLine(line)) return;
    const c = cleanCmdLine(line);
    if (c && isInstallCmd(c) && !cmds.includes(c)) cmds.push(c);
  };

  // 1. 代码块内的行
  for (const m of section.matchAll(/```(?:bash|sh|shell|console|zsh|powershell|pwsh|text)?[ \t]*\r?\n([\s\S]*?)```/g)) {
    for (const line of m[1].split(/\r?\n/)) push(line);
  }
  // 2. $ / # 前缀的命令行
  for (const line of section.split(/\r?\n/)) {
    if (/^\s*[$#>]\s*/.test(line)) push(line);
  }
  const outsideFences = section.replace(/```[\s\S]*?```/g, "");
  for (const line of outsideFences.split(/\r?\n/)) {
    if (isProhibitedInstallLine(line)) continue;
    for (const match of line.matchAll(/`([^`\r\n]+)`/g)) push(match[1]);
  }
  return selectCommands(cmds);
}

/** 综合入口：从 README 提取安装命令 */
export function parseInstallCommands(readme: string | null): { commands: string[]; source: string } {
  if (!readme) return { commands: [], source: "template" };
  const section = extractInstallSection(readme);
  if (section) {
    const cmds = extractInstallCommands(section);
    const extras = extractInstallCommands(readme).filter((cmd) => isDshInstallDisplayCommand(cmd) && !cmds.includes(cmd));
    if (cmds.length > 0) return { commands: selectCommands([...cmds, ...extras]), source: extras.length ? "README" : "README install section" };
  }
  // 兜底：全文找安装命令
  const cmds = extractInstallCommands(readme);
  if (cmds.length > 0) return { commands: cmds, source: "README" };
  return { commands: [], source: "template" };
}
