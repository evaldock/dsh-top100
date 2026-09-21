# Daily operations and GEO integration

The managed scheduler is opt-in. `DSH_AUTOMATION_ENABLED=0` retains the previous scheduler. The implementation does not enable production settings, deploy services, renew prices, or send external notifications.

## Processing and recovery

With automation enabled, the Linux scheduler holds an OS `flock` on `runtime/operations/scheduler.lock`. Its subprocesses inherit the descriptor. Progress is stored atomically in `operations/days/YYYY-MM-DD.json`, using the configured timezone (production: Asia/Shanghai).

The stages are `collect`, `publish`, and `verify`. After the configured collection hour, the scheduler checks every minute, including after the old five-minute launch window. Completed stages are skipped. Collection/publication get at most three attempts per day, with 15/30-minute backoff; verification gets at most six, starting at five minutes. Each daily command is limited to 90 minutes. Publication cannot start for an earlier date after midnight. Recovery preserves the model ledger and description/category jobs; it never clears budget reservations or retries completed paid requests intentionally. Ambiguous paid requests remain governed by the existing ledger.

Managed daily collection now always uses incremental discovery, including Sundays. After the daily publication has passed verification, a separate, model-disabled weekly discovery child can run under the same inherited lock. It starts the current week's sweep (catching up a missed configured weekday), or resumes an unfinished sweep. There is at most one slice per day: initially 300 new search-page requests or 20 minutes, with a 21-minute parent timeout. These limits are initial bounds, not a measured production completion guarantee. `DSH_WEEKLY_DISCOVERY_MAX_REQUESTS` and `DSH_WEEKLY_DISCOVERY_SLICE_MS` configure the child budget; the parent deadline remains 21 minutes. Weekly discovery cannot publish or overwrite the catalog, and its failure cannot invalidate a completed daily publication.

`data/weekly-discovery/` holds the fixed sweep timestamp, successful request projections, source coverage audit, and candidate queue. An interrupted search replays persisted requests without refetching them, while failed/incomplete responses are retried and semantic pagination failures invalidate the affected source cache. Search still has upstream Code Search/npm window limits: a completed sweep does not imply complete global coverage; inspect each source's audit. Completed-sweep request caches are removed, while pending candidates and acknowledgement receipts remain. Each daily collection validates at most 200 queued candidates through the normal evidence pipeline, fetching repository metadata rather than publishing cached search results. Successful validation or definitive exclusion is acknowledged only after source output/report writes succeed. Temporary failures remain queued and move behind the backlog. Source timestamps, model scope, budget ledger and reviewed evidence retain their existing rules; missing historical Stars observations are never fabricated.

Before launching collection, a read-only GitHub/GraphQL probe writes `operations/github-preflight.json`. Authentication/access failures pause dispatch without spending collection attempts; failed probes are spaced by 15 minutes. The collector also checks authentication before discovery, and a 401 during the run stops further GitHub requests and prevents publication of that incomplete run. Only allow-listed error codes reach the operation journal; provider bodies and credentials are never included. An exhausted day from an older version is not silently reset by this change. Replacing an environment-based token requires a controlled recreation of the scheduler; recovery of an exhausted day must preserve the journal and paid-job history and be explicitly supervised.

Within each process, GitHub primary rate limits pause all workers in the affected resource until the response's reset time (plus one second), rather than retrying every minute. REST and GraphQL primary quotas remain separate; secondary limits pause both and honor the full `Retry-After` or use exponential backoff from one minute. A successful response with zero quota also gates the next request. Permission failures do not trigger quota waits. Logs contain only the resource and retry time. One-attempt scheduler probes return promptly during a known cooldown, and the existing 90-minute command deadline still bounds collection, including quota waits. These gates are process-local, not an account-wide rate-limit coordinator.

`operations/weekly-discovery-slice.json` records dispatch before the child starts so restarts cannot run repeated slices on the same day. The watchdog includes authentication and weekly status in its existing report/outbox. GEO delivery remains disconnected. The website displays a data-delay notice when the loaded snapshot is older than 36 hours; this is calculated when data loads and is not a live service-status signal.

Startup only starts the clock and heartbeat. Its first scheduling check is one minute later. For migration after today's legacy collection, set `DSH_AUTOMATION_START_DATE` to the next Beijing date so enabling recovery cannot repeat that collection. `RUN_COLLECT_ON_STARTUP` is ignored in managed mode. Do not run manual collection/publication concurrently with a managed run.

`db:sync` uses a 768 MiB V8 old-space limit to encourage collection before the small production host runs out of memory. This is not a process RSS limit: SQLite, buffers and other native allocations consume additional memory. Ranking previews read only repository IDs from SQLite, history queries reuse statements, and publication stages files on disk and validates them before exposing the manifest. Recovery after a failed publication must preserve the completed collection, model jobs and monetary ledger; do not restart the full daily collection to retry publication.

Publication emits `[publication-memory]` at source loading, source/description/category completion, database import, ranking calculation, ranking publication and final exports. Each record contains only the phase name and current RSS, used heap and process peak RSS in MiB. The last record before a process termination identifies how far publication reached; a healthy scheduler heartbeat alone does not prove that its publication child completed.

`npm run test:publication-memory` generates 24,000 synthetic entries with historical snapshots, performs repeated ranking previews, runs the actual `db:sync` command with paid work disabled, checks peak RSS against 1,792 MiB, and audits the resulting publication. It fails on any fetch attempt and removes its temporary data. CI runs this check in the built scheduler image with networking disabled, a 1,792 MiB container memory limit, no additional swap and two CPUs. This exercises the Linux image at approximately the current production catalog size; it does not guarantee unlimited future growth or identical memory use for every source payload. Production data and credentials are never part of the fixture.

## Disk capacity and host cache maintenance

The managed scheduler checks capacity before **each** collection/publication
attempt. It pauses before launching a child if capacity is insufficient or the
check fails. This does not consume a stage attempt or rerun completed work.
Verification remains available. A later scheduler tick can resume after space is
restored. `operations/disk-preflight.json` records the check; the independent
watchdog also checks capacity and adds a critical disk incident to `status.json`.
Each managed collection/publication phase samples filesystem headroom every
second and writes an aggregate to `operations/disk-usage/` on child exit. It records
the minimum available space, sampled peak consumption, net growth and failed
samples. It includes concurrent host writes, can miss subsecond peaks, and cannot
persist a final measurement if the scheduler itself is killed. It does not claim
an exact attributable high-water mark or stop a running child.
GEO delivery remains disconnected. The legacy scheduler and manual commands do
not inherit this guard; operators must run the read-only check before manual work.

The initial required available space is the larger of **5 GiB** or an estimate:
twice the combined database/WAL, top-level source/job files, current immutable
snapshot and top-level public exports, plus the larger of 1 GiB or four times the
source catalog size for cache growth, plus 1 GiB residual reserve. Repeated
manifest references are counted once. At least 10,000 available inodes are also
required (scaled up for larger manifests). Filesystem-reserved blocks do not
count as available space. Different source/database/public filesystems, invalid
inputs and unsupported symlinks fail closed instead of adding unrelated free
space together. Existing old snapshots are retained and already reduce measured
free space; they are not read or deleted by this check.

These are conservative initial allowances, **not measured upper bounds** on a
complete daily run. A preflight does not reserve space against another process,
bound source payload growth or stop a running phase from exhausting disk. A full
automatic run, including collection/cache growth and concurrent host activity,
must still be measured before claiming a calibrated threshold. Publication keeps
its existing manifest-last behavior and failure handling.

Run the read-only check in the deployed scheduler image:

```sh
docker exec dsh-top100-scheduler-1 node --import tsx collector/src/disk-space-cli.ts
```

For host maintenance, Python 3 and the Docker CLI are required. Deploy the updated
scheduler image before using the host wrapper. Preview is the default:

```sh
python3 scripts/maintain-disk.py
# Explicit apply, after approval of this host's cache cleanup policy:
sudo python3 scripts/maintain-disk.py --apply --log-dir /var/log/dsh-top100-disk
```

Only when the fresh capacity check is insufficient does apply run
`docker buildx prune --builder default --filter until=168h --force`. This uses
[Docker's last-use filter](https://docs.docker.com/reference/cli/docker/buildx/prune/#provide-filter-values---filter).
It does not call image/system/volume prune, delete runtime files, or escalate its
scope when cleanup releases nothing. The default builder can contain caches from
other applications on the same host; first use requires approval for that shared
build cache. Images, containers, volumes, model caches/ledger, source records,
public snapshots and deployment backups are outside its deletion scope.

Apply requires a persistent private audit directory, locks concurrent maintenance
runs, and records intent before pruning, Docker's deleted-cache output, and fresh
capacity afterward. A failed intent log write prevents pruning. Exit codes are
0 (capacity ready), 2 (still insufficient, including preview), and 3 (failed or
unknown). A Docker success code alone is not proof of sufficient space.

The example units in `scripts/systemd/` run at 05:30 Asia/Shanghai, with the host
script installed at `/opt/dsh-top100/scripts/maintain-disk.py`. They require explicit
deployment and activation; merely adding these files does not enable a timer.
`Persistent=false` avoids an unscheduled catch-up cleanup on activation/reboot.
A nonzero result leaves the service failed; the watchdog's capacity incident
remains independent of the cleanup service. GEO notification is still pending.
Backup retention, migration, and disk expansion require their own plan.

## Source handling

- A package whose declaration/entry is conclusively invalid at a pinned commit is quarantined from plugin rankings/search, with normal ranking replacement. Original source and statistics remain stored. Missing metadata, a renamed package or transient network errors alone do not trigger this quarantine rule.
- Free source recovery persists in `source-recovery.json` beside the collector source data. Previously failed sources and quarantined entries can be checked even after leaving the boards: at most 20 off-board recoveries per run, within the existing total cap of 200 source checks. Unrelated long-tail entries are not added. Attempts are persisted before reading sources; delays are 1, 2, 4, then 7 days, capped at 7. New repository updates/identity changes allow an earlier check but never bypass identity/content validation. These counters are separate from paid jobs. Successful revalidation removes the quarantine and recovery record; normal discovery can also close a record after a fresh valid source check. Repository exclusions remove obsolete recovery records.
- Missing selected-package README may use at most its own `package.json` (16 KiB) and conventional `src/index.ts` (24 KiB). Static parsing extracts literal registrations and selected tool/config expressions into at most 1,150 characters; the existing model input limit stays 1,200 characters. No repository code executes, no root README is substituted, and no arbitrary import graph is traversed.
- These are source facts, not an installation/runtime or semantic-completeness guarantee. Insufficient facts remain missing; generated descriptions must pass the existing Chinese validation. Invalid model output is held rather than repeatedly regenerated.
- Evidence binds repository, package, directory, commit, file hashes and the exact facts summary. Restoration preserves historical evidence without pretending it was freshly checked. Identity validity and content readiness are reported separately.
- Fixed source reviews and explicit withdrawals cannot be unlocked by generic source facts. A changed reviewed JS/TS file may pass only when its syntax tree prints identically to the original reviewed file after removing ordinary comments. The original file is fetched at its fixed commit and must match the already approved SHA-256. Automatic semicolon insertion, strings, templates and JSX whitespace are retained. Directive/JSDoc comments, unsupported file types, syntax errors, missing files and unreadable/unverified baselines fail this narrow equivalence check. No arbitrary semantic equivalence is claimed.
- Automatic equivalence retains the original approved marker and stores the actual current fingerprint, commit, file hashes and decision separately in `discovery.functionReview`. It never changes the fixed review configuration. Material changes remain held, with candidate evidence and bounded triage signals (for example changed imports or process environment writes) in `board-source-report.json.reviewCandidates`; these are review candidates, not newly approved Chinese descriptions. A later return to the approved content or proven syntax equivalence can recover automatically. Existing model, thinking, concurrency, output, budget and long-tail scope restrictions remain unchanged.

## Independent watchdog

The `watchdog` Compose service uses the same image but runs independently of the scheduler. It reads runtime data and writes only its own operations reports/event outbox. It does not load model keys, call a model or restart services. Every five minutes it checks local snapshot files against manifest sizes/hashes, public manifest and both public boards, actual rendered Chinese coverage, scheduler heartbeat, daily completion and the read-only model ledger.

Publication also records Skills coverage in `board-description-report.json` under `directories.skills`: full-directory totals and missing-state counts, plus the first 100 entries' coverage and individual missing reasons. This reporting does not expand the paid backlog scope: `scope` and `unique` still refer only to the hot/rising boards. Skills backlog requires separate authorization; source identity, fixed-review holds and the shared budget remain mandatory.

Plugin descriptions can retain a dated, previously verified summary while changed sources are being checked. The server selects fixed-review text only with a valid review date and the same package identity. Unbound legacy text, withdrawn reviews, known incorrect claims, invalid packages and unresolved protected function changes remain hidden. Clients display `descriptionStatus.state: "stale"` with `reviewedAt` before a fixed-review summary; they never recover text from their own review tables or caches.

Ordinary model descriptions for plugins and Skills separately retain up to three source-bound versions in source data, durable jobs and cache. Each version records its actual generation time, package/Skill identity, exact model-input source hash and complete document evidence. Fixed reviews remain under their existing protection and never fall through to this model history. Existing complete model jobs migrate only when a real generation/attempt timestamp and matching verified source evidence exist; missing dates or origins are not invented.

An unchanged bound source reuses its model result. A change to either the input or complete document, or a temporary source-read failure, pauses regeneration for review. With the same identity and no withdrawal, publication can show the old model text with `origin: "model"` and `generatedAt`, rendered as “生成于 YYYY-MM-DD，来源待核查，简介待更新。” This is a generation date, not human verification. A job's explicit `sourceChangeReview` binds an exact `publicationDescriptionSourceHash`, decision (`reuse` or `regenerate`), review timestamp and reason. Reuse rebinds the evidence without changing the generation date; regeneration hides the superseded wording and remains subject to existing scope, source, retry and shared budget gates. Source changes alone do not authorize a model call, and this flow does not automatically infer semantic equivalence from arbitrary README edits.

Only an accepted new output replaces the current version. Failures retain history and retry state. A durable success receipt binds the replaced version IDs and their exact hold, allowing restart recovery when source/cache writes lag behind the completed job. Different withdrawals, holds attached to the new version, and unbound holds remain protected. Historical text is retained for audit even when its display is blocked.

Board reports keep `covered` as the number verified against current sources. `stale` counts the dated summaries awaiting review, and `available` is their sum. Stale entries remain in `missing` and continue through free source checks; displaying old text does not complete description jobs, reset attempts, release model spending or approve classifications.

A targeted description review can separately approve the wording for one exact observed source via `publicationReview`. Its digest binds package identity, full discovery evidence, source revision and author text. It is used only by the publisher: protected function fingerprints, category holds and paid-job decisions remain unchanged. Any subsequent evidence change invalidates that exact approval.

A date-stamped manifest alone is never treated as proof of successful collection. The daily stage journal is authoritative. Updates remain publishable with description gaps; publication integrity failures fail verification. Current notification defaults:

| Condition | Handling |
| --- | --- |
| Individual missing-source/review items, including protected source changes | Initially informational; warning after three distinct publication/check dates, or 48 hours of continuing impact on a published board |
| More than five missing descriptions on either board | Warning |
| More than 5% of metadata refreshes unresolved | Warning |
| Price validity below 48 hours / expired | Warning / critical |
| Unknown or stale model reservations | Warning; never clear them |
| Budget pause or unreadable budget health | Critical |
| No verified daily completion two hours after scheduled start | Critical |
| Scheduler heartbeat older than three minutes | Critical, after startup grace |
| Broken public publication | Critical, with 15-minute publication transition grace |

The watchdog observes the scheduler, not an outage of the entire server. A future GEO consumer should also check that `status.json.checkedAt` is no more than ten minutes old; missing/stale status must be treated as a monitoring outage. Docker healthchecks expose stale scheduler/watchdog heartbeats. GEO delivery and external server-outage monitoring remain disconnected until integration is authorized.

Five-minute polls and restarts do not count as new daily failures. An unchanged escalated incident produces no repeated actionable event. Once the issue disappears from a successful observation, a single recovery event closes it. Source recovery entries keep off-board failures visible; unavailable observations preserve existing incidents rather than claiming recovery. A missing description can remain informational while the rest of the update completes; more than five missing descriptions still triggers the board-level warning immediately.

The 48-hour clock starts when the issue is first observed on a published board, persists across restarts and resets after a confirmed exit from the boards or recovery. An off-board quarantined entry with a successful ranking replacement does not trigger the time rule. A fresh successful audit must confirm ongoing board impact before escalation; retaining an old incident during an unavailable audit neither escalates nor resolves it. The independent publication-outage warning remains active during that failure.

## Private integration files

All files below are under `runtime/operations/`, outside public-data and Git:

- `status.json`: schemaVersion 1, checkedAt, overall status (`healthy`, `degraded`, `action-required`), current operation, publication results, monetary totals and issues.
- `incidents.json`: persistent issue state; an unchanged issue emits no new event.
- `events/<id>.json`: durable events with stable ID, timestamp, kind (`opened`, `changed`, `resolved`), incident and `actionable`. The future GEO adapter should deduplicate on ID, notify only actionable events and retain its own delivery cursor. No event is marked delivered by the producer.
- `publication-audit.json`: successful scheduler acceptance evidence, including the accepted snapshot ID.

Event creation precedes incident acknowledgement, and retry IDs remain stable across a crash between those writes. Reports contain local error codes, public repository identities and aggregate usage, not credentials, raw provider bodies or private config paths. These private files must not be mounted into the public website.

## Activation checklist

1. Complete local checks and the Linux CI lock test/image build. Back up runtime consistently, preserving the original budget ledger.
2. Prepare `runtime/operations/`; configure `DSH_AUTOMATION_ENABLED=1`, `DSH_AUTOMATION_START_DATE`, and `DSH_PUBLIC_ORIGIN` (HTTPS origin only, no path/credentials).
3. Keep the existing scheduler private budget/key mounts. Mount only the private budget configuration read-only into the watchdog, using the same configured path; do not mount the model key. The watchdog must have the same UID needed to read the owner-only budget configuration.
4. After deployment approval, run the existing Compose file chain with profile `automation`, starting scheduler and watchdog. Check both heartbeats and zero startup model calls before the activation date.
5. Verify the first completed real run against the public snapshot and ledger. A passing local simulation does not prove production acceptance.

Prices are not automatically extended. The watchdog warns before expiry; a separate verified price update is still required. GEO connection is deferred, so warnings are recorded but not yet delivered to a person.
