# Radar beta v1 release readiness

Local preparation based on 3236cdb. No frontend runtime behavior was changed.
npm run check covers Screener, MLG/TENX, quarantine, encrypted envelopes,
actual-emission extreme mapping, conflict/NA and production build. Backend smoke
encrypts shadow DATA_HOLD and decrypts with this checkout's actual Radar validator.

Historical replay and ten-session active state do not establish live readiness or
same-day emission. Extreme Low/High must match a new emitted event. Missing/stale
or unverified input stays unavailable. Keep source bytes and receipts private.

Blocked: full-precision CNN acquisition, independent history/feature verification,
real source-to-state-to-encrypted-UI smoke and prospective acquisition gate.
No live feed, publisher, deployment or workflow activation was run.

After backend gates pass, review both pinned commits, encrypted payload path and
deployment target. Obtain concrete user approval before remote publication, main
merge, deployment or scheduler activation. Rollback stops publication, preserves
immutable state/receipts and restores only a reviewed compatible build. Revert this
docs commit if needed. Preserve existing Screener payload and strategy order.
