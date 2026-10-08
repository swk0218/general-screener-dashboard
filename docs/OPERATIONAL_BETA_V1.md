> Historical 2026-10-03 release record. The frontend probe and cadence below are
> superseded by [the current ownership runbook](REPOSITORY_OWNERSHIP_AND_CUTOVER.md).
> Frontend builds no longer collect provider data.

# Radar beta v1 release readiness

Owner-approved release2026-10-03: daily NO_SIGNAL observation is ready for the
existing Screener Radar tab. Current changes add a separate derived timing/status
panel and preserve encrypted recommendations/MLG/TENX contracts.19:00KST batch,
13/14h nominal regular-close delay plus Actions/build/deploy; calendar closes/holidays
are explicit and failed/expired observations stay unavailable/stale. Backend private
version receipts and frontend public probe have independent actual first_seen.
Frontend operating backup branch backup/production-before-radar-beta-20261003
at9d1797be6bf9265662ce118e9f94bf8ae2f5be58 exists remotely. Read-only CI and
existing Pages permission scopes remain; no new credential.20-session observation
is recommendation only; this release does not promote real alerts or changeclose90.
Earlier local-preparation paragraphs below describe the previous stage.

Local preparation based on 3236cdb. No frontend runtime behavior was changed.
npm run check covers Screener, MLG/TENX, quarantine, encrypted envelopes,
actual-emission extreme mapping, conflict/NA and production build. Backend smoke
encrypts shadow DATA_HOLD and decrypts with this checkout's actual Radar validator.

Historical replay and ten-session active state do not establish live readiness or
same-day emission. Extreme Low/High must match a new emitted event. Missing/stale
or unverified input stays unavailable. Keep source bytes and receipts private.

The complete offline raw/PIT/fixed-model/SQLite/feed pipeline now passes using
this checkout's actual decryptor/validator. Its independent feature/history verifier
refuses to treat normalized fixtures as authenticated provider data. A separate
public archive observation obtained full-precision JSON with actual local first_seen.
Blocked: official CNN HTTP 418, canonical live provider/session mapping and prefix,
real live source-to-state-to-encrypted-UI smoke and prospective acquisition gate.

The backend's subsequent source audit resolves the archive daily-label rule and
finds substantive snapshot revisions (27 finite comparisons plus one frozen NA).
Five fixed-model sensitivities preserve confirmed alert dates, while ranks change.
This does not establish live availability; frontend runtime and readiness remain unchanged.
No live feed, publisher, deployment or workflow activation was run.

After backend gates pass, review both pinned commits, encrypted payload path and
deployment target. Obtain concrete user approval before remote publication, main
merge, deployment or scheduler activation. Rollback stops publication, preserves
immutable state/receipts and restores only a reviewed compatible build. Revert this
docs commit if needed. Preserve existing Screener payload and strategy order.
