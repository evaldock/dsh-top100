# Architecture

## Overview

dsh-Top100 separates collection, persistence, publication and presentation so a failed network update cannot leave the public site with partial data.

```text
GitHub Search / Code Search / npm / curated lists
                       │
                       ▼
              Candidate discovery
                       │
                       ▼
       Deterministic plugin verification
                       │
             README / SKILL.md metadata
                       │
                       ▼
        Optional DeepSeek Chinese summary
                       │
                       ▼
        SQLite state and daily snapshots
                       │
                       ▼
          Atomic public JSON snapshots
                       │
                       ▼
                Nginx static site
```

## Components

### Collector

`collector/` is a TypeScript workspace. It discovers candidates from configuration in `collector/config/discovery-sources.json`, verifies repository markers, reads metadata, maintains the Chinese-summary cache and emits a normalized market snapshot.

Daily mode reads bounded high-value search windows, refreshes known repositories and validates a bounded queue of weekly candidates. Managed weekly discovery recursively partitions GitHub repository searches in resumable slices so a single 1,000-result API window does not silently define the catalog. Upstream source/window limits remain visible in the coverage audit; finishing a sweep does not prove complete global coverage.

Descriptions and categories reuse valid source-bound results and protect fixed reviews. Paid work is disabled by default and requires an approved scope, credential and current price/budget configuration. Daily source changes, hot/rising Top100 descriptions and Skills Top100 descriptions have separate scope controls; all paid entry points share `runtime/model-budget.sqlite`, Flash with thinking disabled and the existing monetary limits. Scope and failure handling are described in [model-budget.md](./model-budget.md) and [catalog-quality.md](./catalog-quality.md).

### Database and publisher

`collector/src/database.ts` owns SQLite schema creation and snapshot imports. The main tables are:

- `repositories`: latest normalized repository state.
- `repository_daily_stats`: Stars by repository and date.
- `repository_summaries`: generated Chinese descriptions and model metadata.
- `collection_runs`: collection and import audit records.

`collector/src/sync-database.ts` imports the latest collector output, builds rankings and publishes JSON through temporary files followed by atomic renames.

### Scheduler

`collector/src/scheduler-entry.ts` selects the scheduler inside the container. With `DSH_AUTOMATION_ENABLED=1`, it starts `managed-scheduler.ts` through an inherited OS lock. The managed flow records separate `collect` → `publish` → `verify` stages under `runtime/operations/days/`; collection runs `collect`, publication runs `db:sync`, and verification audits the published local/public snapshot. Recovery skips completed stages and preserves paid jobs and the budget ledger. Startup starts the heartbeat and clock without collecting or republishing; `RUN_COLLECT_ON_STARTUP` is ignored in managed mode.

Daily collection always uses incremental discovery. After daily publication passes verification, a separate model-disabled weekly discovery child runs one bounded slice per day and persists its request progress and candidate queue. It cannot publish or overwrite the current catalog. The independent `watchdog` service checks publication, coverage, heartbeats, completion, disk space and read-only budget health; it writes status and deduplicated events without loading model keys or restarting services. GEO delivery remains disconnected. Exact retry, lock, capacity and monitoring behavior is in [daily-operations.md](./daily-operations.md).

With automation disabled (the default), `collector/src/scheduler.ts` retains the legacy flow: startup runs `db:sync` unless `RUN_COLLECT_ON_STARTUP=true`, and the scheduled `update:once` combines collection and publication with the configured weekday selecting full discovery. Manual `update:once` remains available, but does not inherit the managed lock, recovery or disk preflight; do not run it concurrently with managed work.

### Web

`web/public/` is a static HTML/CSS/JavaScript application. It reads the short-cached `/data/manifest.json`, including total and per-category Skill counts, loads the immutable hot snapshot for the first screen, and requests rising, total/category pages or the compact search index only when the user asks for them. During staggered upgrades the homepage falls back to `/data/rankings-hot.json` first and only requests the matching legacy rising, search or total file after that view is opened; it never loads `/data/rankings.json`. The full legacy file remains available for released plugin clients. The website never connects to GitHub, DeepSeek or SQLite and never receives a secret.

### DSH plugin

`plugin/` is an independently publishable DeepSeek Harness workspace. Its Host process reads the same short-cached manifest and hash-verified immutable snapshots as the website, while retaining the legacy `rankings*.json` endpoints as a staggered-deployment fallback. Search and diagnostics use the compact index; install preflight locates one authoritative 100-entry total page instead of downloading the full catalog. The Host exposes local same-origin APIs, reads the active DSH Profile and performs validated installs. Its Client bundle adds the rankings page to DSH Settings. The package also registers the bundled `recommend-dsh-plugins` Skill and the read-only `dsh_top100_search` model tool into DSH's global registries; both disappear with the plugin and never copy files into the user's Skill directory.

Website and plugin search use the same weighted search core in `plugin/src/shared/search.ts`. The Host imports it directly; `npm run search:build` bundles the same source to `web/public/search-engine.js`. Search weights exact names and repository identifiers above tags, topics and descriptions, expands Chinese/English synonyms, removes natural-language filler, tolerates one edit or adjacent transposition in longer Latin tokens, and orders matches by relevance while retaining the published rank on each item.

The plugin package does not contain the Collector, SQLite database or website backend. `plugin/src/host`, `plugin/src/install`, `plugin/src/client` and `plugin/src/shared` keep host integration, local mutations, UI code and cross-runtime contracts separate.

## Persistence

All mutable deployment state lives under `runtime/`:

```text
runtime/
├── dsh-top100.sqlite
├── model-budget.sqlite
├── collector-data/
│   ├── plugins.json
│   ├── zh-cache.json
│   ├── description-jobs.json
│   ├── category-jobs.json
│   ├── source-recovery.json
│   ├── board-source-report.json
│   ├── skills-source-report.json
│   ├── board-description-report.json
│   ├── weekly-discovery/          # sweep progress, request cache and candidate queue
│   └── cache/
├── operations/
│   ├── days/YYYY-MM-DD.json       # collect/publish/verify journal
│   ├── scheduler.lock
│   ├── scheduler-heartbeat.json
│   ├── watchdog-heartbeat.json
│   ├── github-preflight.json
│   ├── disk-preflight.json
│   ├── disk-usage/
│   ├── weekly-discovery-slice.json
│   ├── publication-audit.json
│   ├── status.json
│   ├── incidents.json
│   └── events/
└── public-data/
    ├── rankings.json
    ├── rankings-hot.json
    ├── rankings-rising.json
    ├── rankings-total.json
    ├── rankings-skills.json
    ├── rankings-search.json
    ├── manifest.json
    ├── snapshots/
    │   └── {snapshotId}/
    │       ├── hot.json
    │       ├── rising.json
    │       ├── skills.json
    │       ├── search.json
    │       ├── total/page-NNN.json
    │       └── categories/{id}/page-NNN.json
    └── plugins.json
```

The publisher writes and validates a complete immutable snapshot directory before atomically replacing `manifest.json`. The snapshot digest includes the final server-approved descriptions and publication-format version, so a content/format change cannot reuse an older immutable URL. Compatibility files are replaced independently and remain available for released DSH plugins. Snapshot retention requires an approved operations policy; publication and capacity checks do not automatically delete old snapshots. Measure the current dataset and preserve rollback evidence before cleanup.

This directory is bind-mounted into Docker and excluded from Git. A consistent backup must include the database (and active SQLite sidecars), shared budget ledger, source/cache/jobs, weekly queue, stage journals and public snapshots. Model keys and private budget configuration remain outside the repository and runtime's public directory; migrate them separately through the existing private configuration process. Checked-in `data/plugins.json` and `data/zh-cache.json` are historical initialization seeds, not a production backup.

## Failure behavior

- Discovery and model failures do not expose secrets to the frontend.
- Invalid model output is rejected before persistence.
- Public JSON is atomically replaced, so readers see either the previous complete snapshot or the new complete snapshot.
- Docker logs rotate at 10 MB with three files per service.
- Nginx exposes only static application files and `runtime/public-data/`.
