import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GithubRateLimitGate } from '../src/github-rate-limit.js';
import { githubFetch } from '../src/github.js';

let fixture = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-21T03:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubEnv('GITHUB_TOKEN', `rate-limit-fixture-${++fixture}`);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function limited(seconds: number, status = 403): Response {
  return new Response('{}', { status, headers: {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String((Date.now() + seconds * 1000) / 1000),
  } });
}

describe('GitHub shared rate-limit cooldown', () => {
  it('waits past the actual primary reset, including waits longer than one minute', async () => {
    const calls: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls.push(Date.now());
      return calls.length === 1 ? limited(35 * 60) : new Response('{"ok":true}');
    }));
    const result = githubFetch('/repos/example/project');
    await vi.advanceTimersByTimeAsync(34 * 60_000);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(61_000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(calls[1] - calls[0]).toBe(35 * 60_000 + 1000);
  });

  it('holds other REST workers too while GraphQL remains available', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (fetchMock.mock.calls.length === 1) return limited(120);
      return new Response(JSON.stringify({ url }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = githubFetch('/repos/example/one');
    await vi.advanceTimersByTimeAsync(0);
    const second = githubFetch('/repos/example/two');
    const graphql = githubFetch('/graphql', { method: 'POST', body: {} });
    await expect(graphql).resolves.toEqual({ url: 'https://api.github.com/graphql' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(61_000);
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('honors Retry-After above one minute across REST and GraphQL', async () => {
    const gate = new GithubRateLimitGate();
    expect(await gate.observe(new Response('', { status: 429, headers: { 'retry-after': '180' } }), 'core', 0)).toBe(true);
    const finished = vi.fn();
    const wait = gate.wait('graphql', () => {}).then(finished);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await wait;
    expect(finished).toHaveBeenCalledOnce();
  });

  it('keeps a primary 429 cooldown scoped to its resource', async () => {
    const gate = new GithubRateLimitGate();
    expect(await gate.observe(limited(3600, 429), 'core', 0)).toBe(true);
    expect(gate.retryAt('core')).toBe(Date.now() + 3_601_000);
    expect(gate.retryAt('graphql')).toBe(0);
  });

  it('backs off secondary limits without disclosing response bodies', async () => {
    const gate = new GithubRateLimitGate();
    const response = new Response(JSON.stringify({ message: 'secondary rate limit; fixture secret details' }), { status: 403 });
    expect(await gate.observe(response, 'core', 1)).toBe(true);
    expect(gate.retryAt('graphql')).toBe(Date.now() + 120_000);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret');
  });

  it('does not confuse a permission 403 with a rate limit just because reset is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Resource not accessible"}', {
      status: 403, headers: { 'x-ratelimit-remaining': '4200', 'x-ratelimit-reset': String(Date.now() / 1000 + 3600) },
    })));
    await expect(githubFetch('/repos/example/project')).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('records the last successful quota response without losing its data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => limited(120, 200)));
    await expect(githubFetch('/repos/example/project')).resolves.toEqual({});
    await expect(githubFetch('/repos/example/project', {}, 1)).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns rate-limited preflights promptly and does not re-probe during cooldown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => limited(120)));
    await expect(githubFetch('/graphql', { method: 'POST' }, 1)).rejects.toMatchObject({ status: 403 });
    await expect(githubFetch('/graphql', { method: 'POST' }, 1)).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after bounded retries even if a provider continues throttling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => limited(60)));
    const result = expect(githubFetch('/repos/example/project', {}, 2)).rejects.toMatchObject({ status: 403 });
    await vi.advanceTimersByTimeAsync(61_000);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks authentication during a long cooldown', async () => {
    const gate = new GithubRateLimitGate();
    await gate.observe(limited(3600), 'core', 0);
    let invalid = false;
    const error = new Error('github-auth-invalid');
    const wait = gate.wait('core', () => { if (invalid) throw error; });
    const result = expect(wait).rejects.toBe(error);
    invalid = true;
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
  });
});
