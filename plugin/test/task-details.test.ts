import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import type { ReactNode, ReactElement } from "react";
import { TaskDetails, taskResultText } from "../src/client/TaskDetails.js";
import { zh } from "../src/client/locales.js";
import type { InstallJobSnapshot } from "../src/shared/types.js";
const t = (key: string) => zh[key] ?? key;
const base: InstallJobSnapshot = { id: "job", batchId: "batch", fullName: "dsh-plugin-shop", profile: "web", action: "uninstall", phase: "installing", lastLine: "", error: null, message: null, requiresRestart: false, activationState: "pending", provenance: null, createdAt: 1, startedAt: 1, finishedAt: null, cancelRequested: false };
function text(node: ReactNode): string { if (Array.isArray(node)) return node.map(text).join(""); if (typeof node === "string" || typeof node === "number") return String(node); return node && typeof node === "object" && "props" in node ? text((node as ReactElement<any>).props.children) : ""; }
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
describe("visible mutation feedback", () => {
  it("does not repeat the task heading or identical progress text in the dialog", () => {
    expect(text(TaskDetails({ job: { ...base, action: "install" }, t, headingPresent: true }))).toBe("");
    expect(text(TaskDetails({ job: { ...base, action: "install", lastLine: "安装中" }, t, headingPresent: true }))).toBe("");
    expect(text(TaskDetails({ job: { ...base, action: "install", lastLine: "正在检查当前 DSH profile" }, t, headingPresent: true }))).toBe("正在检查当前 DSH profile");
  });
  it("omits routine completion logs but keeps additional diagnostic details", () => {
    const job = { ...base, phase: "installed" as const, requiresRestart: true };
    expect(text(TaskDetails({ job: { ...job, lastLine: "已卸载，重启后确认运行状态" }, t, headingPresent: true }))).toBe("请重启，使卸载生效。");
    expect(text(TaskDetails({ job: { ...job, lastLine: "插件已移除；配置清理失败：保留自定义设置" }, t, headingPresent: true }))).toContain("配置清理失败");
  });
  it("reports real zero downloads and network waiting without invented progress", () => {
    const rendered = text(TaskDetails({ job: { ...base, lastLine: "Progress: resolved 84, reused 0, downloaded 0, added 0" }, t }));
    expect(rendered).toContain("已解析 84 · 复用缓存 0 · 已下载 0 · 已写入 0");
    const retry = text(TaskDetails({ job: { ...base, lastLine: "ECONNRESET. Will retry in 1 minute. 1 retries left." }, t }));
    expect(retry).toContain("正在等待重试"); expect(retry).toContain("1 minute"); expect(retry).not.toContain("安装中");
  });
  it("names the removed plugin and asks for restart to apply removal", () => {
    const result = taskResultText({ ...base, phase: "installed", requiresRestart: true }, t);
    const detail = text(TaskDetails({ job: { ...base, phase: "installed", requiresRestart: true }, t, headingPresent: true }));
    expect(detail).toBe("请重启，使卸载生效。");
    expect(result).toContain("dsh-plugin-shop · 已卸载"); expect(result).toContain("使卸载生效"); expect(result).not.toMatch(/安装|文件已写入|实际运行/);
    expect(taskResultText({ ...base, kind: "skill", phase: "installed" }, t)).not.toContain("重启");
  });
  it("shows rollback result, exact dependency and profile on build failure", () => {
    const rendered = text(TaskDetails({ job: { ...base, action: "install", phase: "failed", recovery: "restored", profileDirectory: "/tmp/test-profile", error: "[ignored-builds] Ignored build scripts: node-pty@1.1.0 Run pnpm approve-builds", lastLine: "Progress: resolved 174, added 167, done" }, t }));
    for (const value of ["原有依赖已恢复", "node-pty@1.1.0", "/tmp/test-profile", "可能不再列出"]) expect(rendered).toContain(value);
    expect(rendered).not.toContain("正在处理依赖");
  });
  it("does not claim completion when runtime or recovery is broken", () => {
    const result = taskResultText({ ...base, action: "update", phase: "installed", activationState: "broken", recovery: "failed", requiresRestart: true }, t);
    expect(result).toContain("更新失败"); expect(result).toContain("自动恢复失败"); expect(result).not.toContain("使更新生效");
  });
});
