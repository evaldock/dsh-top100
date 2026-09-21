import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRawFile, githubFetch, rejectPrivateRepository, isGithubAuthenticationFailure } from "../src/github.js";
import { assertGithubAccess } from '../src/github-auth.js';
import { canRestorePrevious } from "../src/discovery-policy.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_TOKEN;
});

describe("GitHub raw document failure semantics", () => {
  it("only treats an actual 404 as missing documentation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    await expect(fetchRawFile("acme/repo", "README.md", "main")).resolves.toBeNull();
  });

  it.each([403, 429, 500, 503])("throws on HTTP %s instead of caching absence", async status => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("temporary failure", { status })));
    await expect(fetchRawFile("acme/repo", "README.md", "main")).rejects.toMatchObject({ status });
  });

  it.each(["TypeError", "TimeoutError"])("propagates %s read failures", async name => {
    const error = Object.assign(new Error("read unavailable"), { name });
    vi.stubGlobal("fetch", vi.fn(async () => { throw error; }));
    await expect(fetchRawFile("acme/repo", "SKILL.md", "main")).rejects.toBe(error);
  });

  it("bounds the raw request and body read with a timeout signal", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("Current document");
    });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(fetchRawFile("acme/repo", "README.md", "main")).resolves.toBe("Current document");
      expect(timeout).toHaveBeenCalledWith(30_000);
    } finally { timeout.mockRestore(); }
  });
});

describe("public catalog visibility boundary", () => {
  it.each([{ private: true }, { visibility: "private" }, { private: false, visibility: "private" }])(
    "rejects explicitly private metadata and exposes only an anonymous report: %j", visibility => {
      const requested = "fixture/old-private-name";
      const canonical = "fixture/new-private-name";
      const metadata = { ...visibility, full_name: canonical, description: "fixture confidential description" };
      const rejected = new Set<string>();
      const result = rejectPrivateRepository(metadata, requested, rejected, new Set());
      expect(result).toEqual({ fullName: "[private repository]", reason: "private repository" });
      expect(canRestorePrevious(requested.toUpperCase(), rejected)).toBe(false);
      expect(canRestorePrevious(canonical, rejected)).toBe(false);
      const serialized = JSON.stringify({ rejected: [result] });
      expect(serialized).not.toContain(requested);
      expect(serialized).not.toContain(canonical);
      expect(serialized).not.toContain(metadata.description);
    },
  );

  it.each([{}, { private: false }, { visibility: "public" }])("keeps old fixtures without a positive private flag compatible: %j", metadata => {
    const rejected = new Set<string>();
    expect(rejectPrivateRepository(metadata, "fixture/public-name", rejected, new Set())).toBeNull();
    expect(rejected.size).toBe(0);
  });
});

describe("GitHub authentication", () => {
  it('stops before discovery when no credential is configured', async () => {
    delete process.env.GITHUB_TOKEN;
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    await expect(assertGithubAccess()).rejects.toMatchObject({ code: 'github-auth-missing' });
    expect(request).not.toHaveBeenCalled();
  });
  it('latches a 401 for this credential and never logs provider bodies', async () => {
    process.env.GITHUB_TOKEN = 'invalid-fixture-only';
    const request = vi.fn(async () => new Response('sensitive provider response', { status: 401 }));
    vi.stubGlobal('fetch', request);
    await expect(assertGithubAccess()).rejects.toMatchObject({ code: 'github-auth-invalid' });
    await expect(githubFetch('/repos/example/public')).rejects.toThrow('github-auth-invalid');
    await expect(fetchRawFile('example/public', 'README.md')).rejects.toThrow('github-auth-invalid');
    expect(request).toHaveBeenCalledOnce();
    try { await githubFetch('/user'); } catch (error) {
      expect(isGithubAuthenticationFailure(new Error('wrapper', { cause: error }))).toBe(true);
      expect(JSON.stringify(error)).not.toContain('sensitive');
      expect(JSON.stringify(error)).not.toContain(process.env.GITHUB_TOKEN);
    }
  });
  it('uses the replacement credential and validates GraphQL before dispatch', async () => {
    process.env.GITHUB_TOKEN = 'replacement-fixture-only';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: {
      viewer: { login: 'fixture-owner' }, rateLimit: { remaining: 4000 },
    } }))));
    await expect(assertGithubAccess()).resolves.toBeUndefined();
  });
  it('does not confuse rate limits or GraphQL permission errors with an invalid token', async () => {
    process.env.GITHUB_TOKEN = 'limited-fixture-only';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    await expect(assertGithubAccess()).rejects.toMatchObject({ code: 'github-preflight-unavailable' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'private details' }] }))));
    await expect(assertGithubAccess()).rejects.toMatchObject({ code: 'github-permission-denied' });
  });
  it("reads GITHUB_TOKEN when the request runs instead of at module load", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("token late-token");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.GITHUB_TOKEN = "late-token";

    await expect(githubFetch<{ ok: boolean }>("/test")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
