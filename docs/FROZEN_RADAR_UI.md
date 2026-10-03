# Frozen Radar UI preparation

Based on current remote main 9d1797b. Latest MLG/TENX encrypted payload, score/rank
contracts, benchmark model and existing views remain unchanged. Added separate
#/radar route, optional delivery validator, and a missing-data-first screen.

The screen separates five own-model feature families (CNN raw score plus rank,
20-day risk-adjusted return, SMA200 risk-adjusted distance, RV20 rank, logged
VIX/RV ratio) from RSI/raw VIX reference values. Same-day events and ten-session
active state are distinct. Extreme levels are accepted only with emitted flags.
Conflicting alerts have no scalar; missing values never become neutral.

An optional encrypted feed loader is connected at data/market-radar.enc.json; no
real feed file is installed yet, so production data remains unavailable. No browser FMP
call, plaintext public delivery, API key, stored password or production payload
modification was introduced. Encrypted Radar transport and the final annual-reference
comparison were verified from the locally materialized handoff packet.

2026-10-03 update: the handoff/reference comparison has passed on939 sessions.
The current UI uses a reusable GaugeTrack/GaugeCard for five model-input cards
and three raw/reference cards. CNN/RSI use their natural0–100 scales; CNN/RV20/VIX
prior ranks use the sealed252-session/min126/exclude-current rule. Return20,
SMA200 risk distance and log ratio now use verified v2 UI-only prior midranks
from immutable raw-derived history. Missing v2 positions are blank and source
receipt timestamps remain explicitly unverified.
Model-input positions never create alerts. Native score cards show current score,
annual q90 marker and signed difference; technical details default to collapsed.

Research status is in document flow; no fixed QA banner is inserted. Radar's
header uses its own source date/status and amber research indication. Screener
timestamp is labeled Screener Update in other views. Radar-only mobile grid
rules separate status/search/lock without changing other product routes.
Frontend71 tests and check/build pass; browser QA checks both exact requested
viewport sizes, header collision, research notice flow, all8 cards, no invented
unverified rank, lock/navigation/password storage, errors and horizontal overflow. Primary
screenshots are1440x1000 and390x844, with supplemental full-page captures.

Validation: existing 62 tests plus 6 Radar tests pass; npm run check passes. Browser plugin not available;
temporary Playwright with system Chrome rendered the actual Radar component at
1440x1000 and 390x844. Header identity, meaningful content, disclosure interaction,
no horizontal overflow, no page/console errors verified. This was component QA,
not actual production data. Additional synthetic encrypted-fixture QA verifies
unlock -> optional feed -> overview/Radar navigation -> lock at both sizes, with
correct title, no overflow/errors, no password storage and cleared Radar on lock.
Current model seal is required by validator. The original general encryption and
payload contracts remain unchanged. Screenshots reside
outside the repo in the workspace qa-evidence folder.

Final refinement: representative score explicitly displays /100. VIX retains
its annual % value and shows the numeric historical percentile separately.
Three model raw-value cards gain screen-only percentile positions, validated
with session/date, window hash, counts and current-source match. No percentile
creates an event or changes native model scores. The 2026-09-29 replay shows
return20 30.952%, trend200 35.714%, log ratio 46.825%, VIX 26.587%.

Exact viewport images preserve runtime fixed navigation. Supplemental mobile
full-page image temporarily places the footer in document flow solely during
capture and restores it immediately. An additional actual scrolled viewport
checks the restored fixed footer; no runtime navigation CSS was changed.
