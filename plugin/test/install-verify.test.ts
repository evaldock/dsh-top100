import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InstallVerificationError,
  clearInstallVerificationCache,
  verifyInstallSpec,
} from "../src/install/install-verify.js";

afterEach(() => {
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
});

describe("install source verification", () => {
  it.each([
    ["^1.0.0", "1.9.0"], ["~1.2.0", "1.2.8"], [">=1.2.0 <1.8.0", "1.2.8"],
    ["1.0.0 - 1.2.8", "1.2.8"], ["1.x || 2.x", "2.4.0"], ["^2.5.0-beta.1", "2.5.0-beta.3"],
  ])("resolves npm range %s against the packument and pins %s", async (selector, expected) => {
    const versions = Object.fromEntries(["1.0.0", "1.2.8", "1.9.0", "2.4.0", "2.5.0-beta.3", "3.0.0"].map((version) => [version, {
      name: "demo", version, dist: { integrity: `sha512-${version}` }, dsh: { bundle: { patch: "./patch.yml" } },
    }]));
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://registry.npmjs.org/demo");
      return new Response(JSON.stringify({ versions }));
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyInstallSpec({ kind: "npm", spec: `demo@${selector}` })).toMatchObject({
      requestedTarget: `demo@${selector}`, target: `demo@${expected}`, version: expected,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a registry exact-version response that silently changes the requested version", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      name: "demo", version: "2.0.0", dist: { integrity: "sha512-test" }, dsh: { bundle: { patch: "patch.yml" } },
    }))));
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo@1.0.0" })).rejects.toThrow("不满足请求的更新范围");
  });

  it("rejects an unavailable range without falling back to latest", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ "dist-tags": { latest: "3.0.0" }, versions: { "3.0.0": { version: "3.0.0" } } }))));
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo@^1.0.0" })).rejects.toThrow("没有满足更新范围");
  });

  it("does not guess main when GitHub default-branch metadata is unavailable", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/demo" })).rejects.toThrow("没有返回可核对的默认分支");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the original GitHub branch in requestedTarget when adding an inferred monorepo path", async () => {
    const sha = "f".repeat(40);
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/commits/release%2F1.x") ? { sha } : {
      content: Buffer.from(JSON.stringify({ name: "demo", version: "1.0.0", dsh: { bundle: { patch: "patch.yml" } } })).toString("base64"),
    })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/mono#release/1.x" }, {
      expectedRepositoryPath: "packages/demo", expectedPackageName: "demo",
    })).resolves.toMatchObject({ requestedTarget: "github:acme/mono#release/1.x&path:/packages/demo",
      target: `github:acme/mono#${sha}&path:/packages/demo` });
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/acme/mono/commits/release%2F1.x", expect.anything());
  });

  it("looks up an exact npm tag and recognizes lifecycle scripts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "@acme/demo",
      version: "2.0.0-next.3",
      repository: { url: "git+https://github.com/acme/demo.git" },
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { postinstall: "node install.js" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec(
      { kind: "npm", spec: "@acme/demo@next" },
      { expectedRepository: "acme/demo" },
    )).resolves.toMatchObject({
      requestedTarget: "@acme/demo@next",
      target: "@acme/demo@2.0.0-next.3",
      source: "npm",
      packageName: "@acme/demo",
      version: "2.0.0-next.3",
      integrity: "sha512-demo",
      repositoryIdentity: "matched",
      lifecycleScripts: [{ name: "postinstall", command: "node install.js" }],
      needsBuildApproval: true,
      buildApprovalKeys: ["@acme/demo"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@acme%2Fdemo/next",
      expect.any(Object),
    );
  });

  it("fails closed when an npm package is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 404,
      statusText: "Not Found",
    })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "missing-plugin" }))
      .rejects.toMatchObject<Partial<InstallVerificationError>>({ fatal: true });
  });

  it("allows dev-only workspace tooling in a published npm package", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      devDependencies: { "@acme/build-tools": "workspace:*" },
    }), { status: 200 })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" })).resolves.toMatchObject({
      packageName: "demo",
      needsBuildApproval: false,
      buildApprovalKeys: [],
    });
  });

  it("reports exhausted GitHub verification quota", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", {
      status: 403,
      statusText: "Forbidden",
      headers: { "x-ratelimit-remaining": "0" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/demo" }))
      .rejects.toThrow("GitHub 安装源验证额度已用尽");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies an explicit GitHub monorepo path selector", async () => {
    const manifest = Buffer.from(JSON.stringify({
      name: "demo",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    })).toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "b".repeat(40) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/repo#path:/packages/demo" }))
      .resolves.toMatchObject({
        target: `github:acme/repo#${"b".repeat(40)}&path:/packages/demo`,
        packageName: "demo",
        commit: "b".repeat(40),
      });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/acme/repo/contents/packages/demo/package.json?ref=${"b".repeat(40)}`,
      expect.any(Object),
    );
  });

  it("uses the Collector-selected monorepo path instead of guessing a package", async () => {
    const sha = "e".repeat(40);
    const manifest = Buffer.from(JSON.stringify({
      name: "@acme/selected-plugin",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    })).toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec(
      { kind: "github", spec: "github:acme/repo" },
      {
        expectedRepository: "acme/repo",
        expectedRepositoryPath: "packages/selected",
        expectedPackageName: "@acme/selected-plugin",
      },
    )).resolves.toMatchObject({
      target: `github:acme/repo#${sha}&path:/packages/selected`,
      packageName: "@acme/selected-plugin",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/acme/repo/contents/packages/selected/package.json?ref=${sha}`,
      expect.any(Object),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("git/trees"),
      expect.anything(),
    );
  });

  it("rejects an install target that resolves to a different selected package name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "@acme/other-plugin",
      version: "1.0.0",
      repository: { url: "https://github.com/acme/repo.git", directory: "packages/other" },
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));

    await expect(verifyInstallSpec(
      { kind: "npm", spec: "@acme/other-plugin" },
      {
        expectedRepository: "acme/repo",
        expectedRepositoryPath: "packages/selected",
        expectedPackageName: "@acme/selected-plugin",
      },
    )).rejects.toThrow("与目录选中的插件包 @acme/selected-plugin 不一致");
  });

  it("writes both stable and commit-pinned GitHub build approval keys", async () => {
    const sha = "a".repeat(40);
    const manifest = Buffer.from(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { prepare: "npm run build" },
    })).toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/repo" }))
      .resolves.toMatchObject({
        target: `github:acme/repo#${sha}`,
        buildApprovalKeys: [
          "demo@git+https://github.com/acme/repo.git",
          `demo@https://codeload.github.com/acme/repo/tar.gz/${sha}`,
        ],
      });
  });

  it("rejects an npm package whose declared GitHub repository conflicts with the catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("api.github.com") ? { id: url.endsWith("acme/demo") ? 1 : 2, full_name: "acme/demo" } : {
      name: "demo",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      repository: "https://github.com/other/repository.git",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    await expect(verifyInstallSpec(
      { kind: "npm", spec: "demo" },
      { expectedRepository: "acme/demo" },
    )).rejects.toThrow("与目录条目 acme/demo 不一致");
  });

  it("rejects registry metadata for a different npm package name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "other-package",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" }))
      .rejects.toThrow("与请求目标 demo 不一致");
  });

  it("rejects a GitHub install target that points at a different catalog repository", async () => {
    await expect(verifyInstallSpec(
      { kind: "github", spec: "github:other/repository" },
      { expectedRepository: "acme/demo" },
    )).rejects.toThrow("与目录条目 acme/demo 不一致");
  });

  it("keeps a monorepo path when pinning a GitHub build target", async () => {
    const sha = "c".repeat(40);
    const manifest = Buffer.from(JSON.stringify({
      name: "demo",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { prepare: "npm run build" },
    })).toString("base64");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 })));
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/repo#path:/packages/demo" }))
      .resolves.toMatchObject({ target: `github:acme/repo#${sha}&path:/packages/demo` });
  });

  it("caches a successful verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const spec = { kind: "npm", spec: "demo" } as const;
    await verifyInstallSpec(spec);
    await verifyInstallSpec(spec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes a moving target only when requested and updates the ordinary cache", async () => {
    let version = "1.0.0";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      name: "demo", version, dist: { integrity: `sha512-${version}` },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const spec = { kind: "npm", spec: "demo@latest" } as const;
    await expect(verifyInstallSpec(spec)).resolves.toMatchObject({ version: "1.0.0" });
    version = "1.1.0";
    await expect(verifyInstallSpec(spec)).resolves.toMatchObject({ version: "1.0.0" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(verifyInstallSpec(spec, { forceRefresh: true })).resolves.toMatchObject({ version: "1.1.0" });
    await expect(verifyInstallSpec(spec)).resolves.toMatchObject({ version: "1.1.0" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("GitHub repository authority verification", () => {
  function mockRepository(repository: string) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      name: "@acme/demo", version: "1.2.3", repository,
      dist: { integrity: "sha512-demo" }, dsh: { bundle: { patch: "./patch.yml" } },
    }))));
  }

  it.each([
    "https://github.com/acme/demo",
    "git+https://github.com/acme/demo.git",
    "https://GITHUB.COM/ACME/DEMO.git/",
    "https://github.com/acme/demo/tree/main/packages/plugin",
    "git://github.com/acme/demo.git",
    "ssh://git@github.com/acme/demo.git",
    "git+ssh://git@github.com/acme/demo.git",
    "ssh://git@github.com:22/acme/demo.git",
    "git@github.com:acme/demo.git",
  ])("recognizes legitimate repository URL %s", async (repository) => {
    mockRepository(repository);
    await expect(verifyInstallSpec({ kind: "npm", spec: "@acme/demo@latest" }, {
      expectedRepository: "acme/demo", expectedPackageName: "@acme/demo",
    })).resolves.toMatchObject({ repositoryIdentity: "matched" });
  });

  it.each([
    "https://notgithub.com/acme/demo",
    "https://evil.test/github.com/acme/demo",
    "https://github.com.evil.test/acme/demo",
    "https://github.com@evil.test/acme/demo",
    "https://evil.test/?repo=https://github.com/acme/demo",
    "https://github.com:8443/acme/demo",
    "ftp://github.com/acme/demo",
    "https://github.com\\@evil.test/acme/demo",
    "https://user:password@github.com/acme/demo",
  ])("does not bind misleading repository URL %s", async (repository) => {
    mockRepository(repository);
    await expect(verifyInstallSpec({ kind: "npm", spec: "@acme/demo@latest" }, {
      expectedRepository: "acme/demo", expectedPackageName: "@acme/demo",
    })).resolves.toMatchObject({ repositoryIdentity: "unavailable" });
  });
});

describe("persisted GitHub sources", () => {
  it("keeps both an existing immutable commit and its exact package path", async () => {
    const sha = "c".repeat(40);
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`https://api.github.com/repos/acme/mono/contents/packages/Demo/package.json?ref=${sha}`);
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({
        name: "@acme/demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } },
      })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const verified = await verifyInstallSpec({ kind: "github", spec: `git+https://github.com/acme/mono.git#${sha}&path:/packages/Demo` }, {
      expectedRepository: "acme/mono", expectedPackageName: "@acme/demo", expectedRepositoryPath: "packages/Demo",
    });
    expect(verified.target).toBe(`github:acme/mono#${sha}&path:/packages/Demo`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat distinct case-sensitive package paths as equivalent", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/mono#path:/packages/Other" }, {
      expectedRepository: "acme/mono", expectedPackageName: "@acme/demo", expectedRepositoryPath: "packages/other",
    })).rejects.toThrow("不一致");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe("verification cache path identity", () => {
  it("keeps case-sensitive monorepo directories in separate cache entries", async () => {
    const sha = "d".repeat(40);
    const content = Buffer.from(JSON.stringify({ name: "demo", dsh: { bundle: { patch: "cordis.patch.yml" } } })).toString("base64");
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("/commits/") ? { sha } : url.includes("/contents/") ? { content } : { default_branch: "main" },
    )));
    vi.stubGlobal("fetch", fetchMock);
    const spec = { kind: "github" as const, spec: "github:acme/mono" };
    const common = { expectedRepository: "acme/mono", expectedPackageName: "demo" };
    const upper = await verifyInstallSpec(spec, { ...common, expectedRepositoryPath: "packages/Plugin" });
    const lower = await verifyInstallSpec(spec, { ...common, expectedRepositoryPath: "packages/plugin" });
    expect(upper.target).toBe(`github:acme/mono#${sha}&path:/packages/Plugin`);
    expect(lower.target).toBe(`github:acme/mono#${sha}&path:/packages/plugin`);
    expect(fetchMock).toHaveBeenCalledWith(`https://api.github.com/repos/acme/mono/contents/packages/plugin/package.json?ref=${sha}`, expect.any(Object));
    const requests = fetchMock.mock.calls.length;
    expect(await verifyInstallSpec(spec, { ...common, expectedRepositoryPath: "packages/Plugin" })).toBe(upper);
    expect(await verifyInstallSpec(spec, { ...common, expectedRepositoryPath: "packages/plugin" })).toBe(lower);
    expect(fetchMock).toHaveBeenCalledTimes(requests);
  });
});
