# Production Deployment

## Current deployment baseline (reviewed 2026-10-02)

The public site is `https://www.evaldock.ai/top100/`. Current production operations
run on the migrated Linux deployment with a managed scheduler and an independent
watchdog. Website assets, data publication and the shared gateway have separate
deployment scopes; a plugin release or a description update does not imply that
all production services were rebuilt from the same commit.

Use the approved production Compose configuration, pinned images and existing
persistent mounts when maintaining that deployment. This repository's
`docker-compose.yml` is the baseline for a separate self-hosted installation;
it must not replace coordinated production overrides. Private deployment
receipts, credentials and budget configuration remain outside the public repository.

Plugin 1.3.14 is the release baseline at this review date; see the
[release notes](release-1.3.14.md). Future maintenance must verify Git, registry
and running-service state separately. The September 18 Mac mini preparation is
retained below as history, rather than the current deployment procedure.

## Server requirements

- Linux server with Docker Engine 24+ and Docker Compose v2.
- At least 2 CPU cores and 2 GB RAM for the baseline. Size disk storage from the actual runtime, retained snapshots, image cache and backup requirements; historical sample sizes are not a production capacity estimate. Managed capacity checks are described in [daily operations](daily-operations.md).
- A domain, reverse proxy and TLS certificate for public access.
- A GitHub token with public repository metadata and contents read access.
- Model credentials are not needed for collection, rankings and valid content reuse with paid requests disabled.

Model enrichment is disabled by default. GitHub collection, local ranking calculations and valid existing content reuse continue without model requests. Enabling paid work requires an explicitly approved private scope and current price/budget configuration; a key or request-count limit alone is insufficient. See [model budget](model-budget.md) for fixed trials and daily source-change processing.

Requests use `deepseek-flash`, explicit disabled thinking, at most 256 output tokens and three concurrent requests. The shared persistent ledger enforces CNY 5/day and CNY 50/month, including in-flight reservations and retries. Keep its runtime mount across deployments; expired prices pause paid work. Leave `RUN_COLLECT_ON_STARTUP=false` for the legacy scheduler. Managed mode ignores this switch and resumes eligible unfinished stages from its persistent journal; it does not repeat completed stages. See [daily operations](daily-operations.md).

## CI checks

CI runs for pull requests and pushes to `main`; a new commit cancels the older
run for the same ref. Branch pushes and release tags do not start duplicate CI.
Before releasing a tag, verify the tagged commit passed the `main` checks.

Dependency installation uses `npm ci --no-audit --no-fund`. A separate
`npm run audit:security` checks the complete dependency tree once per run and
blocks on high/critical findings or audit errors. Each audit request has a
five-minute timeout and one retry. Docker builds do not repeat this audit;
manual releases must also have a successful audit for the target commit.

Typechecks, all tests, runtime publication and Compose validation are retained.
`npm run plugin:pack:check` also builds the actual npm tarball and verifies its entry points, types and skills, and ensures server editorial data and semantic policy are absent from the plugin archive.
Both web and scheduler images are built using separate GitHub Actions cache
scopes, loaded locally on the runner and never pushed. No path-based skipping
is enabled in this first optimization pass.

## First deployment

```bash
git clone <your-repository-url> dsh-top100
cd dsh-top100
cp .env.example .env
```

These commands apply to a new self-hosted installation. Edit `.env`, including
`DSH_PUBLIC_ORIGIN` for the deployment being checked, then run:

```bash
./scripts/prepare-runtime.sh
docker compose up -d --build web scheduler
docker compose ps
curl --fail http://127.0.0.1:8080/
```

`prepare-runtime.sh` creates missing directories and copies seed files only when
the corresponding runtime files do not exist. The checked-in `data/plugins.json`
and `data/zh-cache.json` are historical samples dated August 19, 2026 (UTC metadata), not a
current production backup. A successful page or health check does not establish
catalog freshness. Without sufficient valid Stars observations, rankings may be
short or empty; do not fabricate history or trigger full paid enrichment to fill them.
An existing deployment must migrate its complete runtime instead of replacing it
with these samples.

The default setup retains the legacy scheduler. To use managed operations,
configure the public origin, activation date and any approved private read-only
mounts described in [daily operations](daily-operations.md), set
`DSH_AUTOMATION_ENABLED=1` in `.env`, and include the independent watchdog:

```bash
docker compose --profile automation up -d --build web scheduler watchdog
docker compose --profile automation ps
```

For an existing production deployment, apply this setup through its own approved
Compose configuration and preserve current settings and completed daily stages.

Keep port 8080 private when possible. Terminate HTTPS at Nginx, Caddy, Traefik or the cloud load balancer and proxy to `127.0.0.1:8080`. The production Caddy site block must enable `encode zstd gzip`; inner Nginx compression alone does not guarantee compressed responses through the outer proxy.

## Updating the application

```bash
git pull --ff-only
docker compose up -d --build web scheduler
docker compose ps
```

The commands above update the self-hosted baseline. For managed self-hosting,
include `--profile automation` and `watchdog`; for coordinated production, use its
actual Compose files and approved image revisions. Back up and verify the
persistent state before changing services. Application containers are replaceable;
do not delete `runtime/` during an update or reset its jobs, monetary ledger or
daily stage journal.

## Migrating existing data

Stop the actual old writer before the final migration backup. For the repository
baseline, the commands are:

```bash
docker compose stop scheduler
docker compose ps --all scheduler
mkdir -p backups
tar -czf "backups/dsh-top100-runtime-$(date +%Y%m%d-%H%M%S).tar.gz" runtime
```

Verify that the scheduler and any manual writer have exited before running
`tar`; for production, use the deployed Compose configuration rather than the
baseline file. Keep the old writer stopped throughout cutover. Preserve the
SQLite history, model ledger, source data, caches, jobs, operation journals and
published snapshots, and check the archive and restored database integrity.

Copy the resulting archive to the new project root. Stop the new scheduler before restoring:

```bash
docker compose stop scheduler
tar -xzf dsh-top100-runtime-YYYYMMDD-HHMMSS.tar.gz
```

After restore and integrity checks, start the new self-hosted baseline:

```bash
docker compose up -d --build web scheduler
```

Use the managed profile/watchdog or deployed production configuration where
configured, and activate only the new writer. Transfer approved private configuration and
secrets separately through their existing secure storage; do not place them in
public artifacts or reset their scope. `backup-runtime.sh` is a routine helper
for the baseline: it attempts to stop and then restart that scheduler. It neither
validates another production Compose configuration nor leaves the old writer
stopped for migration, so it is not sufficient on its own for a final cutover.

## Health and logs

For persistent daily recovery, independent acceptance checks and the deferred GEO
event interface, see [daily operations](daily-operations.md). Current production
uses that managed mode; new self-hosted setups retain the previous scheduler
until explicitly enabled. In managed mode include the watchdog in status and log
checks, and inspect the daily journal and public snapshot rather than treating a
healthy scheduler heartbeat as proof of successful publication.

```bash
docker compose ps
docker compose logs --tail=200 web scheduler
curl --fail http://127.0.0.1:8080/
curl --fail http://127.0.0.1:8080/data/manifest.json
curl --fail http://127.0.0.1:8080/data/rankings.json
```

After each deployment, verify that the manifest references one consistent `snapshotId`, its hot URL returns JSON, `/data/snapshots/` responses use long immutable caching, and legacy `rankings*.json` endpoints remain available. The homepage must never request `rankings.json`; during a staggered upgrade it may use the lightweight `rankings-hot.json` fallback and load the matching legacy view only on demand. Updated plugin clients should resolve browsing and install preflight through the manifest snapshots without requesting the full legacy catalog during a healthy run.

The same-origin `/api/events` endpoint returns `204` and writes a dedicated privacy-restricted JSON line to container stdout. That event record contains only time, the allow-listed event/session and coarse public dimensions; it excludes client IP, User-Agent, Referer and request body. If an outer reverse proxy logs this route, disable that access log or redact its query and client metadata so it does not undo the inner privacy policy.

The lightweight first-party option deliberately avoids a database. To calculate the weekly north-star metric from the retained web logs without printing session identifiers, run:

```bash
docker compose logs --no-log-prefix --since=168h web | npm run --silent analytics:report
```

The report treats search, repository/copy actions, opening the install guide and copying an install command as high-intent behavior. Self-hosted Umami would add a dashboard and longer retention, but also requires a database, backups, upgrades and a second application service; keep it as a later option if log retention and this aggregate report stop being sufficient.

Docker rotates service logs automatically. Monitor disk usage for `runtime/`, `backups/` and Docker images.

## Backup policy

For the self-hosted baseline, `./scripts/backup-runtime.sh` is a routine runtime
archive helper. It suppresses scheduler stop/start errors; verify writer state
and archive integrity rather than assuming that a printed filename proves a
consistent backup. Existing production must use its actual writer, mounts and
backup procedure. Copy verified backups outside the server and periodically
test restoring them on a separate machine. Retain the monetary ledger, model
jobs and operation journals together with the catalog and ranking history.

## Security checklist

- Never commit or copy `.env` into the Web root.
- Restrict `.env` permissions to the deployment account.
- Rotate GitHub and DeepSeek credentials periodically.
- Expose only the Web port; do not expose SQLite or the scheduler container.
- Enable HTTPS and security updates on the host.
- Keep `RUN_COLLECT_ON_STARTUP=false` unless an immediate network collection is intended.

## Public site mount

EvalDock uses `https://www.evaldock.ai/` as its primary public origin. Public page
requests on the bare domain redirect to `www`; do not redirect `www` back to the
bare domain. Top100 is mounted at
`https://www.evaldock.ai/top100/`; the outer Caddy gateway strips `/top100` before
proxying to this repository's `web:80`. Nginx continues to serve files from its
root, so direct container smoke checks at `http://127.0.0.1:8080/` remain valid.
Use `npm run serve` and `http://127.0.0.1:4173/top100/` for the browser preview.

To preview a locally published snapshot, set `DSH_LOCAL_DATA_DIR` to its absolute
directory containing `manifest.json`, then run `npm run serve`. The preview serves
all `/data/` assets from that directory without falling back to production. This
starts only the loopback web server; it does not start collection or model jobs.

The gateway must keep `/data/*` and `/api/events` routed to Top100. Current
EvalDock plugins use `https://www.evaldock.ai/data`; older released plugins and
the default development proxy may still use `https://www.dsheval.ai/data`.
Keep the old data and events endpoints serving directly without a redirect to a
different host, while old page URLs redirect to the new origin. Manifest snapshot
URLs are absolute paths under `/data/`, independent of the website mount. Report downloads
use `/eval-data/` to avoid collisions.

The main site's robots and sitemap must advertise the Top100 sitemap at
`https://www.evaldock.ai/top100/sitemap.xml`. Existing root HTML links redirect to their
matching `/top100/` pages with query parameters and fragments preserved by the
gateway/browser. Root query/hash links are handled by the main landing page.

Repository About and npm public metadata should use:
- Website: `https://www.evaldock.ai/top100/`
- Repository description: `EvalDock 旗下的插件与 Skills 发现栏目，按公开 GitHub 信号持续更新。`
- Package: `@evaldock/dsh-top100-plugin`; the release baseline reviewed here is 1.3.14. Verify the exact version and registry `latest` tag for each future release.
  Public metadata and README are published from `plugin/package.json` and `plugin/README.md`.

Updating repository About, publishing npm, and deploying the gateway are separate
external actions; local changes do not apply those updates automatically.

## Model secret files

Prefer `DEEPSEEK_API_KEY_FILE` with an absolute runtime path outside the repository (including its resolved path). The file must be a regular, non-symlink file owned by the process user, with mode `0600` and one hard link. Mount it read-only into the container; keep the actual file outside Git and the Docker build context. The loader rejects empty, multiline or oversized content and never includes file contents or paths in errors. A configured file overrides `DEEPSEEK_API_KEY`; any validation or read failure clears the old environment key and stops startup. The environment key remains supported when no file is configured. Neither credential option enables paid requests by itself.

`.dockerignore` excludes `.env` and `.env.*` at the root and in nested directories. Do not put a real credential into `.env.example`, source files, commands, build arguments or committed deployment files.

## Retiring the previous npm release

For each new stable plugin release, record the previous `latest` version before publishing. After the new version and `latest` are public and the downloaded tarball matches the approved artifact, mark that previous version as deprecated with a message naming the exact recommended replacement. Verify the public registry `deprecated` field before marking release work complete. Keep the old package available; do not unpublish it.

Browser or two-factor verification requested by npm is completed by the account owner. Never collect a one-time code or copy credentials into the repository.

## Server-owned descriptions (1.3.8+)

Deploy the server publisher and website with `descriptionPolicy: "server-v1"` data before rolling out the new plugin. Republish current rankings using the server publication entry point without collection or model work. Preserve ranking metadata, source records, history and the shared model ledger. The fixed editorial table now lives only in `collector/config/reviewed-descriptions.json`. Remove the obsolete website and plugin source review JSON when layering a deployment image over an older image; a Docker COPY alone does not remove deleted files.

After the one-time client upgrade, editorial data or server validation changes do not require npm releases. Keep the contract marker stable for compatible changes. Clients that have observed a current manifest must not recover older prose from legacy endpoints if a current shard fails.

## Historical Mac mini migration preparation (2026-09-18)

The following records the preparation on September 18, before later migrations.
Its host files and pending DNS status are historical, not current production instructions.

The approved new production origin is `https://www.evaldock.ai`, with this site
mounted at `/top100/`. Website canonical URLs, Open Graph metadata, robots and
sitemap target the new origin. This preparation does not mean DNS has switched.
The coordinated gateway and Mac mini Compose configuration live in the
`evaldock/evaldock` repository (`deploy/Caddyfile.mac-mini` and
`deploy/compose.mac-mini.yml`).

Migration must preserve the complete runtime, monetary ledger, jobs and daily
stage journal. Stop the old writer before the final consistent backup and only
activate the new managed scheduler after integrity checks. Do not run two
schedulers, repeat completed daily stages, reset budget history or expand paid
processing. Keep the existing budget/key settings private and provide only the
read-only budget configuration to the watchdog. Set `DSH_PUBLIC_ORIGIN` to the
new HTTPS origin on the new host.

Existing npm packages and their `www.dsheval.ai/data` endpoints remain unchanged
in this website migration. The old domain must keep serving compatible data and
events directly while pages redirect to the new origin.
