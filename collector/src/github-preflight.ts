import { join } from 'node:path';
import { atomicOperationJson, readOperationJson } from './operation-state.js';
import { assertGithubAccess, githubAccessCode, type GithubAccessCode } from './github-auth.js';

export interface GithubPreflight {
  checkedAt: string;
  status: 'ready' | 'blocked';
  code?: GithubAccessCode | 'github-auth-required';
  retryAt?: string;
}
/** A failed probe pauses dispatch, without consuming collection attempts. */
export async function checkGithubPreflight(directory: string, options: {
  now?: number; probe?: () => Promise<void>;
} = {}): Promise<boolean> {
  const now = options.now ?? Date.now();
  const path = join(directory, 'github-preflight.json');
  const previous = readOperationJson<GithubPreflight>(path);
  if (previous?.status === 'blocked' && Date.parse(previous.retryAt ?? '') > now) return false;
  let result: GithubPreflight;
  try {
    await (options.probe ?? assertGithubAccess)();
    result = { checkedAt: new Date(now).toISOString(), status: 'ready' };
  } catch (error) {
    result = { checkedAt: new Date(now).toISOString(), status: 'blocked', code: githubAccessCode(error),
      retryAt: new Date(now + 15 * 60_000).toISOString() };
  }
  atomicOperationJson(path, result);
  return result.status === 'ready';
}
export function recordGithubAuthFailure(directory: string, now = Date.now()): void {
  atomicOperationJson(join(directory, 'github-preflight.json'), {
    checkedAt: new Date(now).toISOString(), status: 'blocked', code: 'github-auth-required',
    retryAt: new Date(now + 15 * 60_000).toISOString(),
  } satisfies GithubPreflight);
}
