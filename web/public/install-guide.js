const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

export function existingDshPrefix(method, version = "") {
  if (method === "global") return "dsh";
  if (method === "source") return "pnpm dsh";
  if (method === "npx" && exactVersion.test(version.trim())) {
    return `npx @deepseek-ai/dsh@${version.trim()}`;
  }
  return null;
}

export function existingDshCommands(method, version, pluginVersion) {
  if (!exactVersion.test(pluginVersion)) return null;
  const prefix = existingDshPrefix(method, version);
  if (!prefix) return null;
  return {
    install: `${prefix} plugin --profile web add @evaldock/dsh-top100-plugin@${pluginVersion}`,
    check: `${prefix} plugin --profile web list --depth 0`,
    start: `${prefix} web`,
  };
}

export function initializeInstallGuide(root) {
  const radios = [...root.querySelectorAll('input[name="dsh-experience"]')];
  const method = root.querySelector("[data-dsh-method]");
  const version = root.querySelector("[data-dsh-version]");
  const pluginVersion = root.querySelector("[data-install-version]").textContent.trim();

  function selectPath(value) {
    for (const radio of radios) radio.checked = radio.value === value;
    for (const panel of root.querySelectorAll("[data-guide-panel]")) {
      panel.hidden = panel.dataset.guidePanel !== value;
    }
  }

  function updateCommands() {
    const isNpx = method.value === "npx";
    root.querySelector("[data-npx-version-field]").hidden = !isNpx;
    const commands = existingDshCommands(method.value, version.value, pluginVersion);
    version.setAttribute("aria-invalid", String(isNpx && version.value !== "" && !commands));
    for (const row of root.querySelectorAll("[data-existing-ready]")) row.hidden = !commands;
    for (const code of root.querySelectorAll("[data-existing-command]")) {
      code.textContent = commands?.[code.dataset.existingCommand] ?? "";
    }
    for (const button of root.querySelectorAll("[data-existing-copy]")) {
      if (commands) button.dataset.copyCommand = commands[button.dataset.existingCopy];
      else button.removeAttribute("data-copy-command");
    }
    root.querySelector("[data-existing-status]").textContent = commands
      ? ""
      : isNpx
        ? "填写完整版本号后显示命令，例如 0.1.5-rc.2。"
        : "选择后显示安装命令。";
    root.querySelector("[data-existing-location]").textContent = method.value === "source"
      ? "在原来的 DSH 源码仓库根目录执行："
      : "在原来启动 DSH 的终端环境中执行，沿用原配置目录；npx 请在 DSH 源码目录外运行。";
  }

  function revealTarget(hash) {
    if (!hash) return;
    const target = root.ownerDocument.getElementById(hash.slice(1));
    if (!target || !root.contains(target)) return;
    const panel = target.closest("[data-guide-panel]");
    if (panel) selectPath(panel.dataset.guidePanel);
    const disclosure = target.closest("details") ?? target.querySelector("details");
    if (disclosure) disclosure.open = true;
    for (let parent = target.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
  }

  root.addEventListener("change", event => {
    if (radios.includes(event.target)) selectPath(event.target.value);
    if (event.target === method) updateCommands();
  });
  version.addEventListener("input", updateCommands);
  root.addEventListener("click", event => {
    const link = event.target.closest('a[href*="#"]');
    if (link) revealTarget(new URL(link.href).hash);
  });
  window.addEventListener("hashchange", () => revealTarget(window.location.hash));
  selectPath(radios.find(radio => radio.checked)?.value ?? "new");
  updateCommands();
  revealTarget(window.location.hash);
}
