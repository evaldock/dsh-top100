import assert from "node:assert/strict";
import test from "node:test";
import { installSourceKey } from "../public/install-assessment.js";

import {
  catalogPresentation,
  catalogInstallCapability,
  installCommand,
  resolveInstallTarget,
} from "../public/catalog-presentation.js";

test("marks retained historical entries for review without claiming Bundle structure", () => {
  const entry = { fullName: "acme/demo", type: "cordis-plugin", install: {
    discovery: { status: "review-required", kind: "bundle", checkedAt: "2026-09-01T00:00:00Z", policyVersion: 0, evidence: [] },
  } };
  assert.equal(catalogPresentation(entry).formFactor, "相关项目");
  assert.equal(catalogPresentation(entry).trustLevel, "indexed");
  assert.equal(catalogInstallCapability(entry).label, "插件身份待确认");
});

test("uses the verified discovery kind consistently in ranking and compact search entries", () => {
  for (const [kind, label] of [["client", "DSH 客户端插件"], ["host", "DSH 插件"], ["bundle", "DSH 插件包"]]) {
    const discovery = { status: "verified", kind };
    for (const entry of [
      { fullName: "acme/demo", type: "cordis-plugin", install: { discovery } },
      { fullName: "acme/demo", type: "cordis-plugin", discovery },
    ]) {
      assert.equal(catalogPresentation(entry).formFactor, label);
      assert.equal(catalogPresentation(entry).installable, false);
      assert.equal(installCommand(entry), null);
    }
  }
});

test("does not infer a Bundle declaration from the legacy plugin type alone", () => {
  assert.equal(catalogPresentation({ fullName: "acme/demo", type: "cordis-plugin" }).formFactor, "DSH 插件");
});

test("does not equate an install source with zero configuration or safety", () => {
  const entry = { fullName: "acme/demo", installTarget: "github:acme/demo" };
  assert.equal(catalogInstallCapability(entry).label, "已找到安装命令");
  const checked = { ...entry, installAssessment: {
    sourceKey: installSourceKey(entry), checkedAt: new Date().toISOString(),
    status: "verified", resolvedTarget: "github:acme/demo", integrity: "sha256-reviewed",
  } };
  assert.equal(catalogInstallCapability(checked).label, "安装信息已核对");
  assert.match(catalogInstallCapability(checked).reason, /尚未实际安装或测试功能/);
  assert.equal(catalogInstallCapability({ ...checked, installAssessment: {
    ...checked.installAssessment, checkedAt: "2020-01-01T00:00:00Z",
  } }).label, "安装信息需重新核对");
  assert.equal(catalogInstallCapability({ ...entry, needsConfig: true }).label, "已找到安装命令 · 需配置");
  assert.equal(catalogInstallCapability({ ...entry, install: { needsConfig: true } }).label, "已找到安装命令 · 需配置");
  const unavailable = catalogInstallCapability({ fullName: "acme/demo", needsConfig: true });
  assert.equal(unavailable.label, "未找到安装命令");
  assert.match(unavailable.reason, /不代表无法安装/);
});

test("accepts an allow-listed npm target from a DSH add command", () => {
  const entry = {
    fullName: "acme/demo",
    type: "cordis-plugin",
    install: { packageName: "@acme/demo", commands: ["dsh plugin --profile web add @acme/demo@1.2.3"] },
  };
  assert.equal(resolveInstallTarget(entry), "@acme/demo@1.2.3");
  assert.equal(
    installCommand(entry),
    "npx @deepseek-ai/dsh plugin --profile web add @acme/demo@1.2.3",
  );
  assert.equal(catalogPresentation(entry).trustLevel, "install-source");
});

test("uses a sanitized install target from the compact search index", () => {
  const entry = {
    fullName: "acme/demo",
    type: "cordis-plugin",
    installTarget: "@acme/demo@1.2.3",
    installPackageName: "@acme/demo",
  };
  assert.equal(resolveInstallTarget(entry), "@acme/demo@1.2.3");
  assert.equal(
    installCommand(entry),
    "npx @deepseek-ai/dsh plugin --profile web add @acme/demo@1.2.3",
  );
  assert.equal(resolveInstallTarget({ ...entry, installTarget: "demo;curl bad.example" }), null);
  assert.equal(resolveInstallTarget({ ...entry, installTarget: "github:owner/repo" }), null);
});

test("derives a GitHub install target only for a valid Skill repository", () => {
  const entry = { fullName: "acme/useful-skill", type: "skill", install: {} };
  assert.equal(resolveInstallTarget(entry), "github:acme/useful-skill");
  assert.equal(catalogPresentation(entry).formFactor, "技能");
  assert.equal(resolveInstallTarget({ fullName: ".hidden/useful-skill", type: "skill" }), null);
});

test("rejects shell syntax and untrusted URLs from catalog commands", () => {
  for (const target of [
    "demo;curl bad.example",
    "https://bad.example/install.tgz",
    "demo && echo unsafe",
    "file:../demo",
    "github:.hidden/demo",
  ]) {
    assert.equal(resolveInstallTarget({
      fullName: "acme/demo",
      type: "cordis-plugin",
      install: { commands: [`dsh plugin add ${target}`] },
    }), null);
  }
});

test("does not offer install for an indexed-only ecosystem project", () => {
  const entry = { fullName: "acme/project", type: "candidate", install: {} };
  assert.equal(installCommand(entry), null);
  assert.deepEqual(catalogPresentation(entry), {
    formFactor: "相关项目",
    formFactorDescription: "已收录的相关项目，当前插件结构尚未确认。",
    trustLevel: "indexed",
    trustLabel: "已进入索引",
    installable: false,
  });
});

test("chooses the project's GitHub target over a prerequisite market, including stale indexes", () => {
  const entry = {
    fullName: "e2mcc/dsh-popout-sidebar",
    type: "cordis-plugin",
    installTarget: "dshmarket",
    install: { commands: [
      "dsh plugin --profile web add dshmarket",
      "dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar",
    ] },
  };
  assert.equal(installCommand(entry),
    "npx @deepseek-ai/dsh plugin --profile web add github:e2mcc/dsh-popout-sidebar");
  assert.equal(resolveInstallTarget({ ...entry, install: undefined }), null);
});

test("only selects npm commands matching the detected package name", () => {
  const entry = {
    fullName: "acme/demo",
    type: "cordis-plugin",
    install: { packageName: "@acme/demo", commands: [
      "dsh plugin add dshmarket",
      "dsh plugin add @acme/demo@latest",
    ] },
  };
  assert.equal(resolveInstallTarget(entry), "@acme/demo@latest");
  assert.equal(resolveInstallTarget({ ...entry, install: { commands: entry.install.commands } }), null);
  assert.equal(resolveInstallTarget({ ...entry, install: { ...entry.install, commands: ["dsh plugin add dshmarket"] } }), null);
});

test("binds installation notes to the reviewed package document in full and compact rows", () => {
  const install = { packageName: '@open-design/dsh-runtime', repositoryPath: 'packages/dsh-runtime', discovery: {
    status: 'verified', readme: { documentSha256: 'ab0d00d527a3a7323609d5c1e941a9b32df63ace8f82d93045ed131c4a542a48' },
  } };
  const entry = { fullName: 'nexu-io/open-design', install };
  assert.equal(catalogInstallCapability(entry).label, '由 OpenDesign 安装');
  assert.equal(catalogInstallCapability({ fullName: entry.fullName, installPackageName: install.packageName,
    installRepositoryPath: install.repositoryPath, discovery: install.discovery }).label, '由 OpenDesign 安装');
  assert.equal(catalogInstallCapability({ ...entry, install: { ...install, packageName: 'different' } }).label, '未找到安装命令');
  assert.equal(catalogInstallCapability({ ...entry, install: { ...install, discovery: { status: 'verified', readme: { documentSha256: 'changed' } } } }).label, '未找到安装命令');
});

test("does not offer quick installation for unresolved discovery or known source errors", () => {
  const entry = { fullName: 'acme/demo', installTarget: 'github:acme/demo' };
  assert.equal(installCommand({ ...entry, discovery: { status: 'review-required' } }), null);
  assert.equal(installCommand({ ...entry, installAssessment: { status: 'invalid',
    checkedAt: '2020-01-01', sourceKey: '["acme/demo","github:acme/demo",null,null]' } }), null);
});
