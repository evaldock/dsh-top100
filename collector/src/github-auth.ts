import { GithubError, githubFetch, isGithubAuthenticationFailure } from './github.js';

export type GithubAccessCode = 'github-auth-missing' | 'github-auth-invalid' | 'github-permission-denied' | 'github-preflight-unavailable';
export class GithubAccessError extends Error {
  constructor(public readonly code: GithubAccessCode) { super(code); }
}
export function githubAccessCode(error: unknown): GithubAccessCode {
  if (error instanceof GithubAccessError) return error.code;
  if (isGithubAuthenticationFailure(error)) return 'github-auth-invalid';
  return 'github-preflight-unavailable';
}

/** Read-only authentication/GraphQL capability probe before discovery or paid work. */
export async function assertGithubAccess(): Promise<void> {
  if (!process.env.GITHUB_TOKEN?.trim()) throw new GithubAccessError('github-auth-missing');
  try {
    const result = await githubFetch<{ data?: { viewer?: { login?: string }; rateLimit?: { remaining?: number } }; errors?: unknown[] }>(
      '/graphql', { method: 'POST', body: { query: 'query { viewer { login } rateLimit { remaining } }' } }, 1);
    if (result.errors?.length || !result.data?.viewer?.login) throw new GithubAccessError('github-permission-denied');
    if (!Number.isFinite(result.data.rateLimit?.remaining) || result.data.rateLimit!.remaining! <= 0) {
      throw new GithubAccessError('github-preflight-unavailable');
    }
  } catch (error) {
    if (error instanceof GithubAccessError) throw error;
    // 403 is deliberately not labelled invalid credentials: it can be rate limiting.
    throw new GithubAccessError(error instanceof GithubError && error.status === 401
      ? 'github-auth-invalid' : 'github-preflight-unavailable');
  }
}
