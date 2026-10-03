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
modification was introduced. Encrypted Radar transport and final annual-reference
comparison await the final handoff packet.

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
