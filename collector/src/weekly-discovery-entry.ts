import { fstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGithubAccess, GithubAccessError, githubAccessCode } from './github-auth.js';
import { isGithubAuthenticationFailure } from './github.js';
import { runWeeklyDiscovery } from './weekly-discovery.js';

// This entrypoint never imports enrichment, model clients, or publication code.
process.env.DSH_MODEL_REQUESTS_ENABLED = '0';
try {
  if (process.env.DSH_OPERATION_LOCK_FD !== '9') throw new Error('weekly-discovery requires the scheduler lock');
  fstatSync(9);
  await assertGithubAccess();
  const result = await runWeeklyDiscovery({
    dataDir: join(dirname(fileURLToPath(import.meta.url)), '../../data'),
    maxRequests: Number(process.env.DSH_WEEKLY_DISCOVERY_MAX_REQUESTS ?? '300'),
    maxDurationMs: Number(process.env.DSH_WEEKLY_DISCOVERY_SLICE_MS ?? '1200000'),
  });
  console.log(`weekly-discovery status=${result.status} requests=${result.requests} queued=${result.queued}`);
} catch (error) {
  const code = error instanceof GithubAccessError || isGithubAuthenticationFailure(error)
    ? githubAccessCode(error) : 'weekly-discovery-failed';
  console.error(`weekly-discovery failed: ${code}`);
  process.exitCode = code === 'github-auth-invalid' || code === 'github-auth-missing' || code === 'github-permission-denied' ? 78 : 1;
}
