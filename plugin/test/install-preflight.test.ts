import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInstallVerificationCache } from "../src/install/install-verify.js";
import {
  clearInstallApprovals,
  consumeInstallApproval,
  createInstallPreflight,
  validateInstallApprovals,
} from "../src/host/install-preflight.js";
import type { RankingEntry } from "../src/shared/types.js";

function entry(extra: Partial<RankingEntry> = {}): RankingEntry {
  return {
    rank: 1,
    fullName: "acme/demo",
    name: "demo",
    owner: "acme",
    description: "Demo",
    descriptionZh: "演示",
    stars: 1,
    dailyStars: 0,
    weeklyStars: 0,
    hotScore: 0,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    tags: [],
    type: "cordis-plugin",
    install: { packageName: "demo", commands: ["dsh plugin add demo@latest"] },
    sources: [],
    url: "https://github.com/acme/demo",
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

afterEach(() => {
  clearInstallApprovals();
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("install preflight approval", () => {
  it("includes current-host declaration evidence without treating undeclared versions as compatible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "demo", version: "1.0.0", repository: "https://github.com/acme/demo", dist: { integrity: "sha512-test" }, dsh: { bundle: { patch: ["a.yml", "b.yml"] } } }))));
    const approval = await createInstallPreflight(entry(), "web");
    expect(approval.preflight.hostCompatibility).toMatchObject({ status: "unknown", reason: "not-declared" });
  });
  it("uses the actual destination Profile and rejects mismatches before source lookup", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      name: "demo", version: "1.4.2", repository: "https://github.com/acme/demo.git",
      dist: { integrity: "sha512-example" }, dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const plugin = entry({ install: { packageName: "demo", commands: ["corepack pnpm dsh plugin --profile research add demo@latest"] } });
    await expect(createInstallPreflight(plugin, "web")).rejects.toThrow("no trusted DSH install source");
    expect(fetchMock).not.toHaveBeenCalled();
    const approval = await createInstallPreflight(plugin, "research");
    expect(approval.preflight.profile).toBe("research");
    expect(approval.bundleTarget?.target).toBe("demo@1.4.2");
  });

  it("does not verify against public npm when the author explicitly requires another registry", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createInstallPreflight(entry({ install: { packageName: "demo", commands: ["dsh plugin --profile web add demo --registry=https://mirror.example/"] } }), "web"))
      .rejects.toThrow("no trusted DSH install source");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    "dsh plugin --profile research add github:acme/demo",
    "dsh plugin add github:acme/demo --registry=https://mirror.example/",
  ])("rejects an incompatible Skill command before source lookup: %s", async (command) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createInstallPreflight(entry({ type: "skill", install: { commands: [command] } }), "web"))
      .rejects.toThrow("no trusted DSH install source");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preflights the sidebar repository without resolving its prerequisite marketplace", async () => {
    const fullName = "e2mcc/dsh-popout-sidebar";
    const sha = "c".repeat(40);
    const fetchMock = vi.fn(async (url: string) => {
      const root = `https://api.github.com/repos/${fullName}`;
      if (!url.startsWith(root)) throw new Error(`Unexpected source: ${url}`);
      const payload = url === root ? { default_branch: "main" }
        : url.includes("/commits/") ? { sha }
          : { content: Buffer.from(JSON.stringify({
            name: "dsh-popout-sidebar",
            version: "1.0.0",
            dsh: { bundle: { patch: "./cordis.patch.yml" } },
          })).toString("base64") };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const approval = await createInstallPreflight(entry({
      fullName,
      install: { commands: [
        "dsh plugin --profile web add dshmarket",
        `dsh plugin --profile web add github:${fullName}`,
      ] },
    }), "web");
    expect(approval.preflight.provenance).toMatchObject({
      requestedTarget: `github:${fullName}`,
      resolvedTarget: `github:${fullName}#${sha}`,
      repositoryIdentity: "matched",
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith(`https://api.github.com/repos/${fullName}`))).toBe(true);
  });

  it("binds user approval to an exact npm version and its lifecycle scripts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.4.2",
      repository: "https://github.com/acme/demo.git",
      dist: { integrity: "sha512-example" },
      scripts: { postinstall: "node setup.js" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    const approval = await createInstallPreflight(entry(), "web");
    expect(approval.preflight).toMatchObject({
      fullName: "acme/demo",
      requiresExplicitApproval: true,
      activationExpectation: "restart-required",
      provenance: {
        requestedTarget: "demo@latest",
        resolvedTarget: "demo@1.4.2",
        integrity: "sha512-example",
        repositoryIdentity: "matched",
      },
      lifecycleScripts: [{ name: "postinstall", command: "node setup.js" }],
    });
    expect(() => consumeInstallApproval(
      approval.preflight.approvalToken,
      "acme/demo",
      "web",
    )).toThrow("需要明确确认");
    expect(consumeInstallApproval(
      approval.preflight.approvalToken,
      "acme/demo",
      "web",
      true,
    ).bundleTarget?.target).toBe("demo@1.4.2");
    expect(() => consumeInstallApproval(approval.preflight.approvalToken, "acme/demo", "web"))
      .toThrow("安装确认已过期");
  });

  it("pins a Skill to the verified default-branch commit", async () => {
    const sha = "d".repeat(40);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 })));
    const approval = await createInstallPreflight(entry({ type: "skill", install: undefined }), "web");
    expect(approval.preflight).toMatchObject({
      kind: "skill",
      activationExpectation: "not-applicable",
      provenance: { resolvedTarget: `github:acme/demo#${sha}`, commit: sha },
    });
  });

  it("keeps configuration-required distinct from restart-only completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.4.2",
      repository: "https://github.com/acme/demo.git",
      dist: { integrity: "sha512-example" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    const approval = await createInstallPreflight(entry({
      install: { needsConfig: true, packageName: "demo", commands: ["dsh plugin add demo@latest"] },
    }), "web");
    expect(approval.preflight.activationExpectation).toBe("configuration-required");
  });
});

describe("atomic install batch approval", () => {
  function mockPackages(extra: Record<string, unknown> = {}) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const name = url.includes("other") ? "other" : "demo";
      return new Response(JSON.stringify({
        name, version: "1.2.3", repository: `https://github.com/acme/${name}`,
        dist: { integrity: "sha512-demo" }, dsh: { bundle: { patch: "./patch.yml" } }, ...extra,
      }));
    }));
  }
  const reference = (approval: Awaited<ReturnType<typeof createInstallPreflight>>, risksAccepted = true) => ({
    fullName: approval.preflight.fullName, approvalToken: approval.preflight.approvalToken, risksAccepted,
  });
  const other = () => entry({ fullName: "acme/other", name: "other", install: { packageName: "other", commands: ["dsh plugin add other@latest"] } });

  it("preserves earlier approvals when a later token is invalid", async () => {
    mockPackages();
    const approval = await createInstallPreflight(entry(), "web");
    expect(() => validateInstallApprovals([reference(approval), {
      fullName: "acme/other", approvalToken: "invalid", risksAccepted: true,
    }], "web")).toThrow("已过期");
    expect(validateInstallApprovals([reference(approval)], "web")).toEqual([approval]);
  });

  it("preserves earlier approvals when a later approval has expired", async () => {
    vi.useFakeTimers(); mockPackages();
    const expired = await createInstallPreflight(other(), "web");
    vi.advanceTimersByTime(60_000);
    const fresh = await createInstallPreflight(entry(), "web");
    vi.advanceTimersByTime(9 * 60_000);
    expect(() => validateInstallApprovals([reference(fresh), reference(expired)], "web")).toThrow("已过期");
    expect(validateInstallApprovals([reference(fresh)], "web")).toEqual([fresh]);
  });

  it("preserves the whole batch when a later risk has not been accepted", async () => {
    mockPackages({ scripts: { postinstall: "node setup.js" } });
    const first = await createInstallPreflight(entry(), "web");
    const second = await createInstallPreflight(other(), "web");
    expect(() => validateInstallApprovals([reference(first), reference(second, false)], "web")).toThrow("需要明确确认");
    expect(validateInstallApprovals([reference(first), reference(second)], "web")).toEqual([first, second]);
    expect(() => validateInstallApprovals([reference(first)], "web")).toThrow("已过期");
    expect(() => validateInstallApprovals([reference(second)], "web")).toThrow("已过期");
  });

  it("rejects duplicate names and tokens without consuming approvals", async () => {
    mockPackages();
    const first = await createInstallPreflight(entry(), "web");
    const duplicate = await createInstallPreflight(entry(), "web");
    expect(() => validateInstallApprovals([reference(first), reference(duplicate)], "web")).toThrow("重复");
    expect(() => validateInstallApprovals([reference(first), { ...reference(first), fullName: "acme/other" }], "web")).toThrow("重复");
    expect(validateInstallApprovals([reference(first)], "web")).toEqual([first]);
    expect(validateInstallApprovals([reference(duplicate)], "web")).toEqual([duplicate]);
  });

  it("keeps binding to repository and profile during atomic validation", async () => {
    mockPackages();
    const first = await createInstallPreflight(entry(), "web");
    const second = await createInstallPreflight(other(), "another");
    expect(() => validateInstallApprovals([reference(first), reference(second)], "web")).toThrow("不匹配");
    expect(() => validateInstallApprovals([{ ...reference(first), fullName: "acme/wrong" }], "web")).toThrow("不匹配");
    expect(validateInstallApprovals([reference(first)], "web")).toEqual([first]);
    expect(validateInstallApprovals([reference(second)], "another")).toEqual([second]);
  });

  it("rejects empty batches", () => {
    expect(() => validateInstallApprovals([], "web")).toThrow("请选择");
  });

  it("requires explicit source approval for a misleading repository hostname", async () => {
    mockPackages({ repository: "https://notgithub.com/acme/demo" });
    const approval = await createInstallPreflight(entry(), "web");
    expect(approval.preflight).toMatchObject({
      requiresExplicitApproval: true,
      provenance: { repositoryIdentity: "unavailable" },
      risks: expect.arrayContaining([expect.objectContaining({ code: "repository-identity", severity: "warning" })]),
    });
    expect(() => validateInstallApprovals([reference(approval, false)], "web")).toThrow("需要明确确认");
    expect(validateInstallApprovals([reference(approval)], "web")).toEqual([approval]);
  });
});
