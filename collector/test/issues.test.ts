import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractRepoFromText, extractIntroByAuthor, fetchSubmissionRepos, fetchPackSubmissionRepos, mergeSubmissionMetadata } from "../src/sources/issues.js";

import { githubFetch, GithubError } from "../src/github.js";

vi.mock("../src/github.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/github.js")>(),
  githubFetch: vi.fn(),
}));
beforeEach(() => vi.mocked(githubFetch).mockReset());

describe("extractRepoFromText", () => {
  it("从 issue 正文提取仓库地址", () => {
    const text = "仓库：https://github.com/foo/bar 请收录";
    expect(extractRepoFromText(text)).toEqual(["foo/bar"]);
  });

  it("兼容多种 URL 后缀（tree/blob/issues/.git）", () => {
    expect(
      extractRepoFromText("https://github.com/a/b/tree/main x https://github.com/c/d/issues/1 https://github.com/e/f.git")
    ).toEqual(["a/b", "c/d", "e/f"]);
  });

  it("过滤非仓库路径（github.com 自身/本仓库/issues 等）", () => {
    const text = "https://github.com/settings https://github.com/github/foo https://github.com/2BingLing/dsh-market https://github.com/x/issues";
    expect(extractRepoFromText(text)).toEqual([]);
  });

  it("过滤 GitHub 附件域（user-attachments 图片路径不是仓库）", () => {
    const text = "截图：https://github.com/user-attachments/assets/123abc 仓库：https://github.com/foo/bar";
    expect(extractRepoFromText(text)).toEqual(["foo/bar"]);
  });

  it("大小写归一化", () => {
    expect(extractRepoFromText("https://github.com/MyOrg/MyRepo")).toEqual(["myorg/myrepo"]);
  });

  it("去重", () => {
    expect(
      extractRepoFromText("https://github.com/a/b 和 https://github.com/A/B")
    ).toEqual(["a/b"]);
  });

  it("无仓库地址返回空", () => {
    expect(extractRepoFromText("这是一个普通 issue")).toEqual([]);
  });
});

describe("extractIntroByAuthor", () => {
  it("提取模板字段（markdown 加粗：**作者自述简介**：…）", () => {
    const body = "- **作者自述简介**：用我自己的话介绍这个插件，解决日常痛点。";
    expect(extractIntroByAuthor(body)).toBe("用我自己的话介绍这个插件，解决日常痛点。");
  });

  it("兼容裸写法（作者自述：…）", () => {
    expect(extractIntroByAuthor("作者自述：一句话介绍我的插件")).toBe("一句话介绍我的插件");
  });

  it("兼容自定义简介写法", () => {
    expect(extractIntroByAuthor("自定义简介: 这是自述内容")).toBe("这是自述内容");
  });

  it("无作者自述返回 undefined", () => {
    expect(extractIntroByAuthor("- **一句话简介**：普通描述")).toBeUndefined();
    expect(extractIntroByAuthor(null)).toBeUndefined();
  });

  it("只取第一行", () => {
    expect(extractIntroByAuthor("作者自述：第一行\n第二行")).toBe("第一行");
  });

  it("方括号形式支持多行（跨行取方括号内全部内容）", () => {
    const body =
      "- **作者自述简介**：[这是我的第一行介绍，\n  第二行补充说明，\n  还有第三行。]\n- 其他字段";
    const got = extractIntroByAuthor(body);
    expect(got).toContain("这是");
    expect(got).toContain("第三行");
  });

  it("模板推荐写法（作者自述简介：[…]）", () => {
    const body = "- **作者自述简介**：[这是用我自己话写的介绍。]";
    expect(extractIntroByAuthor(body)).toBe("这是用我自己话写的介绍。");
  });

  it("方括号为空回退裸写法", () => {
    expect(extractIntroByAuthor("作者自述：[] 实际在另一行")).toBe("[] 实际在另一行");
  });
});


describe("submission migration", () => {
  const issue = (number: number, body = "https://github.com/example/plugin", extra = {}) => ({
    number, title: "[Submit] example/plugin", body, labels: [], state: "open", ...extra,
  });
  const ref = (repository: string, number: number) => ({
    repository, number, url: `https://github.com/${repository}/issues/${number}`,
  });

  it("读取新仓库的无标签 #32，保留作者自述并排除自引用", async () => {
    vi.mocked(githubFetch).mockResolvedValueOnce([issue(32,
      "https://github.com/lemonxiny55/dsh-lint-loop\nhttps://github.com/evaldock/dsh-top100/issues/32\n**作者自述简介:** 零配置 lint 反馈闭环。")]).mockResolvedValueOnce([]);
    expect(await fetchSubmissionRepos()).toEqual(new Map([["lemonxiny55/dsh-lint-loop", {
      submissionIssues: [ref("evaldock/dsh-top100", 32)], introByAuthor: "零配置 lint 反馈闭环。",
    }]]));
    expect(githubFetch).toHaveBeenNthCalledWith(1, "/repos/evaldock/dsh-top100/issues?state=open&per_page=100&page=1");
    expect(githubFetch).toHaveBeenNthCalledWith(2, "/repos/2BingLing/dsh-market/issues?state=open&per_page=100&page=1");
  });

  it("仅排除入口仓库，不排除同作者或组织的其他插件", () => {
    expect(extractRepoFromText("https://github.com/2BingLing/dsh-market https://github.com/EvalDock/dsh-top100 "
      + "https://github.com/2BingLing/plugin https://github.com/evaldock/plugin")).toEqual(["2bingling/plugin", "evaldock/plugin"]);
  });

  it("分页读取并保留新旧仓库同号提交，新仓库自述优先", async () => {
    vi.mocked(githubFetch)
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => issue(i + 100, "", { title: "普通问题" })))
      .mockResolvedValueOnce([issue(32, "https://github.com/example/plugin\n作者自述：新入口简介")])
      .mockResolvedValueOnce([issue(32, "https://github.com/example/plugin\n作者自述：旧入口简介")]);
    const repos = await fetchSubmissionRepos();
    expect(repos.get("example/plugin")).toEqual({ submissionIssues: [ref("evaldock/dsh-top100", 32), ref("2BingLing/dsh-market", 32)], introByAuthor: "新入口简介" });
    expect(githubFetch).toHaveBeenNthCalledWith(2, "/repos/evaldock/dsh-top100/issues?state=open&per_page=100&page=2");
  });

  it.each(["plugin", "pack"])("%s 通道区分整合包、插件、PR 和关闭的 issue", async kind => {
    const issues = [issue(1), issue(2, "https://github.com/example/pack", { title: "[Submit pack] example/pack", labels: [{ name: "submission" }] }),
      issue(3, "https://github.com/example/pull", { pull_request: {} }), issue(4, "https://github.com/example/closed", { state: "closed" }),
      issue(5, "https://github.com/example/label", { title: "请收录", labels: [{ name: "submission" }] })];
    vi.mocked(githubFetch).mockResolvedValueOnce(issues).mockResolvedValueOnce([]);
    const repos = await (kind === "plugin" ? fetchSubmissionRepos() : fetchPackSubmissionRepos());
    expect([...repos.keys()]).toEqual(kind === "plugin" ? ["example/plugin", "example/label"] : ["example/pack"]);
    if (kind === "pack") expect(repos.get("example/pack")?.submissionIssues).toEqual([ref("evaldock/dsh-top100", 2)]);
  });

  it("某页失败后保留已读提交并继续旧仓库", async () => {
    vi.mocked(githubFetch).mockResolvedValueOnce(Array.from({ length: 100 }, () => issue(32)))
      .mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce([issue(40)]);
    expect((await fetchSubmissionRepos()).get("example/plugin")?.submissionIssues)
      .toEqual([ref("evaldock/dsh-top100", 32), ref("2BingLing/dsh-market", 40)]);
  });

  it("401 继续遵守全局终止语义", async () => {
    vi.mocked(githubFetch).mockRejectedValueOnce(new GithubError("github-auth-invalid", 401, "https://api.github.com"));
    await expect(fetchSubmissionRepos()).rejects.toMatchObject({ status: 401 });
    expect(githubFetch).toHaveBeenCalledOnce();
  });

  it("搜索先加入候选后仍合并作者自述，按仓库和编号去重", () => {
    const target: Parameters<typeof mergeSubmissionMetadata>[0] = {};
    const metadata = { submissionIssues: [ref("evaldock/dsh-top100", 32)], introByAuthor: "作者自述" };
    mergeSubmissionMetadata(target, metadata);
    mergeSubmissionMetadata(target, metadata);
    mergeSubmissionMetadata(target, { submissionIssues: [ref("2BingLing/dsh-market", 32)] });
    expect(target).toEqual({ submissionIssues: [ref("evaldock/dsh-top100", 32), ref("2BingLing/dsh-market", 32)], introByAuthor: "作者自述" });
  });
});
