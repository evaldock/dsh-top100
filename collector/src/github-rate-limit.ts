/** Process-wide GitHub cooldowns. Never retain or log credentials/provider bodies. */
export type GithubResource = 'core' | 'search' | 'graphql';

export function githubResource(url: string): GithubResource {
  const path = new URL(url).pathname;
  return path === '/graphql' ? 'graphql' : path.startsWith('/search/') ? 'search' : 'core';
}

export class GithubRateLimitGate {
  private readonly primary = new Map<GithubResource, number>();
  private secondary = 0;

  retryAt(resource: GithubResource): number {
    return Math.max(this.primary.get(resource) ?? 0, this.secondary);
  }

  async wait(resource: GithubResource, assertHealthy: () => void): Promise<void> {
    for (;;) {
      assertHealthy();
      const remaining = this.retryAt(resource) - Date.now();
      if (remaining <= 0) return;
      // Short sleeps let an authentication failure in another worker abort this wait.
      await new Promise(resolve => setTimeout(resolve, Math.min(remaining, 60_000)));
    }
  }

  /** Record successful last-quota responses too, before the next worker dispatches. */
  async observe(response: Response, resource: GithubResource, attempt: number): Promise<boolean> {
    const limitedStatus = response.status === 403 || response.status === 429;
    const exhausted = response.headers.get('x-ratelimit-remaining') === '0';
    const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    const now = Date.now();
    if (exhausted && (response.ok || limitedStatus)) {
      const until = Number.isFinite(reset) && reset > now ? reset + 1000 : now + 60_000;
      this.extend(resource, until);
    }
    if (!limitedStatus) return false;

    let secondary = !exhausted && response.status === 429 || Number.isFinite(retryAfter) && retryAfter > 0;
    if (!exhausted && !secondary && response.status === 403) {
      try {
        const body = await response.json() as { message?: unknown };
        secondary = typeof body.message === 'string' && /secondary rate limit|abuse detection/i.test(body.message);
      } catch { /* An ordinary permission failure must remain an immediate 403. */ }
    }
    if (secondary) {
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter + 1000 : 60_000 * 2 ** Math.min(attempt, 6);
      this.extend('secondary', now + delay);
    }
    return exhausted || secondary;
  }

  private extend(resource: GithubResource | 'secondary', until: number): void {
    const previous = resource === 'secondary' ? this.secondary : this.primary.get(resource) ?? 0;
    if (until <= previous) return;
    if (resource === 'secondary') this.secondary = until;
    else this.primary.set(resource, until);
    console.warn(`[github-rate-limit] resource=${resource} retryAt=${new Date(until).toISOString()}`);
  }
}
