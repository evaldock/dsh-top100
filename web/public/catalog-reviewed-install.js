/** Author-source notes reviewed 2026-09-24. Apply only to the exact evidence
 * already carried by the catalog; changed documents/packages fall back to unknown.
 */
function installation(entry) {
  return entry.install ?? { packageName: entry.installPackageName, repositoryPath: entry.installRepositoryPath, discovery: entry.discovery };
}

export function reviewedInstallCapability(entry) {
  const install = installation(entry);
  if (!install || install.discovery?.status !== "verified") return null;
  if (entry.fullName.toLowerCase() === "nexu-io/open-design"
    && install.packageName === "@open-design/dsh-runtime"
    && install.repositoryPath === "packages/dsh-runtime"
    && install.discovery.readme?.documentSha256 === "ab0d00d527a3a7323609d5c1e941a9b32df63ace8f82d93045ed131c4a542a48") {
    return { label: "由 OpenDesign 安装", reason: "先安装 DSH，再在 OpenDesign 中选择 DeepSeek Harness。OpenDesign 会在征求确认后，把随应用提供的连接组件安装到 open-design 配置中。此组件不是通用的 DSH Web 一键安装包。",
      sourceUrl: "https://github.com/nexu-io/open-design/blob/HEAD/packages/dsh-runtime/README.md" };
  }
  if (entry.fullName.toLowerCase() === "dataelement/dsh-desktop"
    && install.packageName === "dsh-desktop-client-ui"
    && install.repositoryPath === "packages/dsh-desktop-client-ui"
    && install.discovery.evidence?.includes("reviewed-function-sha256:a5c7772c85a1e2b7e38e84a9e942e251e2a8d73bffb6a9bff63ac4c026330729")) {
    return { label: "桌面应用内置组件", reason: "这是 DSH Desktop 自带的品牌界面组件，随桌面应用使用。源码声明为私有包，未提供独立的 npm 安装包；本站不提供单独安装命令。",
      sourceUrl: "https://github.com/dataelement/dsh-desktop/tree/69705b23117801389aafb1eab35055dd20744312/packages/dsh-desktop-client-ui" };
  }
  return null;
}

export function reviewedInstallSetup(entry) {
  const install = installation(entry);
  if (install?.discovery?.status !== "verified") return null;
  const document = install.discovery.readme?.documentSha256;
  if (entry.fullName.toLowerCase() === "tencent/browserskill"
    && install.packageName === "@wxg-prc-cpg/browser-skill-dsh-plugin"
    && document === "80b39390c3cbf7de3e608c7a9778cde67dd885551f3ec7d739b49aa956842650")
    return "使用前需安装 bsk 命令行，并连接 Chrome 或 Edge 中的 BrowserSkill 扩展。";
  if (entry.fullName.toLowerCase() === "superdesigndev/treg" && install.packageName === "treg-dsh"
    && install.discovery.sourceRevision === "69ada8217a5662b113863ba1d2e1e77048666a0f")
    return "安装后可使用 Treg 的工具使用技能；连接 MCP 工具还需设置 TREG_TOKEN。";
  if (entry.fullName.toLowerCase() === "reactive-resume/reactive-resume"
    && install.packageName === "dsh-plugin-reactive-resume"
    && document === "9e94297dcf0211a461e3ee5750d175e78570603c0891df25f8079cb79772f7c6")
    return "使用简历工具前需设置 RXRESUME_API_KEY；自建 Reactive Resume 服务可配置对应地址。";
  return null;
}
