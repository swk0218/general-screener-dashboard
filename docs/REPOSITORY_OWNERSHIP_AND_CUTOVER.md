# Three-repository ownership and staged cutover

## Current release state

This is default-disabled preparation, not a completed live migration. The public
result-publisher fence still assigns Radar to Screening. No accepted history,
model, score, receipt time, research HOLD, or Oct2 source-resolution approval is
rewritten. The pinned sealed runtime is immutable; native current-head research
code cannot replace it. Historical documents retain their historical context;
this runbook is the current repository-boundary and migration procedure.

## One owner per responsibility

- Screening-agent-by-FMP-API owns MLG/TENX models, collection and their existing
  weekly/manual execution. It publishes its encrypted payload through generic
  bounded transport. Existing MLG/TENX cadence and numerical contracts do not change.
- MarketRadar owns the frozen Radar model, source collection, daily execution,
  diagnosis, recovery, seasonality and encryption. The operational journal is the
  existing encrypted frontend journal; private radar-state is a separate research
  source-vintage archive, never a replacement operational journal.
- general-screener-dashboard owns static UI, validation, encrypted result storage
  and Pages deployment. It does not fetch CNN/FMP/FRED or execute models. It never
  refreshes source/receipt/model times during a build. Decryption remains client-side.

MarketRadar's native `web/` is a research-only viewer retained for old research,
not a second production frontend. `beta-observation.yml` is a separate private
10:00 UTC source-vintage experiment retaining full FMP/CNN and authenticated FRED
captures. Its source history has unique evidence, so this migration does not
disable it, transfer it into the operational journal, or claim it is redundant.
Research schedules previously paused stay paused; frozen model/research gates stay.

## Target entry point

`.github/workflows/radar-daily.yml` invokes `scripts.radar_operation` in MarketRadar.
Scheduled operation is disabled unless `RADAR_DAILY_ENABLED=true`. Manual default
is `verify`. `verify`, `diagnose`, `project`, `export`, and `rehearse` cannot publish.
`diagnose` requires a selected authenticated failure; `project` requires an exact
checkpoint hash. `rehearse` uses disposable local state, never a Git push or private
state-branch update. `observe`, `recover_then_current`, and `seasonality` require
explicit publication and active MarketRadar owner/generation fencing.

The operational primary/retry cadence is Monday–Saturday 10:17/12:40 UTC
(19:17/21:40 KST). Retry skips complete expected sessions. Actions scheduling can
be delayed; displayed source, capture, admission, model, build and deployment times
remain distinct. A failed or stale observation remains unavailable/stale.
Research exports are optional private diagnostics and cannot alter operation success.

## Shared transport without shared runtime code fetching

The private engines vendor the same `scripts/dashboard_transaction.py`, versioned
by `config/dashboard_transport_contract.json`. Each CI verifies its local SHA256;
paired changes must additionally run `python scripts/verify_dashboard_transport.py
--peer-dir ../Screening` (from MarketRadar) against both reviewed checkouts. Do not
fetch executable Python from another repository at runtime. The Screening publisher
passes a hash-bound local copy between its sealing and publishing jobs.

Radar owns only its encrypted feed/journal/seasonality and value-free status paths;
Screening owns only its encrypted payload. CAS carries unrelated updates without
recomputation, force push or rewriting accepted state. Same-path changes, writer
fence changes, consumer code changes, intervening change/revert and ambiguous
nonlinear histories fail closed. Frontend `src/`, `scripts/`, schemas/config and
build contract files are protected. Software path bounds do not narrow SSH key rights.

## Credentials and live readiness

Target secrets: existing identical `DASHBOARD_PASSPHRASE` and a proposed dedicated
`RADAR_DASHBOARD_DEPLOY_KEY` granting write to the frontend repository only. Their
availability is UNKNOWN. Never replace/reset the historical passphrase. Never
log/copy secret values into source, PRs or public artifacts. Creating/configuring
persistent access requires separate user action-time approval or secure handoff.
A repository deploy key can write the whole repository and has no inherent expiry.
Preparation and synthetic tests do not establish credential readiness.

## Ordered release gates

1. Review exact three-repository diffs and run relevant aggregate CI on exact heads.
   Merge preparation only with appropriate release authorization. Keep target disabled.
   Use squash merges (or genuine fast-forward commits), especially on the frontend.
   Preserved-recovery equivalence rejects all nonlinear approved-to-current history;
   an intervening merge commit is a hard gate requiring separate review, not a pin reset.
2. Confirm credentials securely, validate immutable journal/feed and preserved capture,
   perform cold recovery and a no-publication rehearsal. Record actual result/hash.
3. Install the owner fence on every old daily/manual/retry/feed-only/seasonality writer.
   Freeze new old-owner launches; drain every pre-fence queued/running/retry run to a
   terminal state. Record run IDs, including externally triggered jobs.
4. Explicitly switch `config/result-publishers.json` to MarketRadar with a new generation.
   No two writers may be authorized. Run one controlled preserved recovery followed
   by an independent current refresh. Do not relabel an old capture as a current read.
5. Verify actual authenticated journal/feed, retained original records and deployed
   Pages with matching engine-result/feed receipt. Preserve newest accepted history.
6. Apply the post-cutover cleanup below, verify Screening MLG/TENX regressions, then
   enable target recurrence. Confirm the first real scheduled result before completion.

Rollback first disables target scheduling and drains writers, preserves all newest
accepted journal entries, and uses a reviewed compatible code/owner generation.
Never rewind journal/feed history, force push, purge archive history, overwrite
AS_PUBLISHED or reinstate a writer from an unverified older head.

## Post-cutover Screening deletion manifest

Delete only after gate 5; temporary legacy files below remain during preparation.
- Four workflows: `radar-daily.yml`, `radar-observation-publisher.yml`,
  `radar-observation-seasonality.yml`, `radar-observation-ci.yml`.
- Entire `radar_observation/` (package, sealed operational bundle and its tests).
- Eight Radar-only scripts: `package_radar_runtime.py`, `run_radar_observation.py`,
  `publish_radar_daily.py`, `publish_radar_seasonality.py`, `seal_radar_daily.mjs`,
  `seal_radar_observation.mjs`, `verify_radar_publication.mjs`,
  `radar_seal_calendar.test.mjs`.
- Radar-only fallback tests/docs and obsolete active README/CI references. Preserve
  historical evidence with a clear archived label; do not purge Git history.

Retain generic `dashboard_transaction.py`, its contract/verifier, Screening's
publisher and all MLG/TENX models/cadences. Remove no shared credentials. Frontend's
obsolete provider-fetch `scripts/radar-observation-status.py` is removed in preparation.

## Finite storage and recovery budget

Journal envelopes use zlib level 9 before AES-GCM. Both encryption and decryption
limit serialized plaintext to 8,000,000 bytes. An oversized envelope fails before encryption and cannot be indexed as a
preserved candidate/capture. A separately valid audit may already be preserved.
Individual source-body limits do not guarantee the combined base64 capture fits.

Failure evidence appends per timestamped invocation; there is no cross-attempt raw
body deduplication. Revision audits deduplicate only the same checkpoint/capture
hashes. Canonical Git history and authenticated indexes have no expiry or cumulative
size cap. The separate native radar-state archive deduplicates raw sources by
source/hash but retains cumulative xz snapshots and Git history; measure its budget
separately as well. Cold verification reads historical evidence, so total clone/restore cost
grows. The operational workflow has a 20-minute timeout; this is a finite budget,
not proof of indefinite performance. Never purge accepted evidence to hide growth.

Before activation, record real repository/journal size, capture sizes, clone time
and authenticated cold-recovery duration; review capacity again as these approach
the job/storage limits. A measured clone plus authenticated cold recovery of at
least 10 minutes (half the workflow budget), or an envelope plaintext of at least
6 MB (75% of its ceiling), triggers a mandatory capacity review before activation
or planned re-enablement. These are review thresholds, not new deletion or
retention permissions. Local synthetic tests are not a long-term capacity result.
Derived Actions receipts expire after 30 days; compact private research packets
expire after 7 days and their DTO limit is 64 KiB. These artifacts are never canonical.
