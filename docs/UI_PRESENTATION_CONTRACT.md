# Shared frontend presentation rules

- All desktop routes use the same centered content frame and gutter. Header search follows that frame; no route may hide it. Reserve the scrollbar gutter so changing page length does not move the shell.
- Strategy controls share StrategyModeControl, full content width, a 44px measured control height, and the same typography. Screener/history search follows the control. Mobile page inset is 20px without nested table padding.
- Use UpdateBadge for date badges. Preserve the actual data session in dateTime/title; do not substitute publication time. Place the badge at the header's right edge. Chevrons for MLG/TENX belong beside their names.
- Use SectionFooter for Overview navigation actions: one separator, left-aligned label and adjacent chevron. Disclosure summaries and secondary navigation use --secondary-action-size. Candidate and transition labels use --status-label-size.
- market-insight shares Overview headline typography. RadarHeadline and RadarEventLabel are used in both Radar entry points. Invalid/conflicting packets remain explicit; display changes never compute or suppress model events.
- Ordinary input positions and threshold bars use the existing green accent. Warning states retain the existing warning treatment. Do not imply probabilities.
- Return comparisons retain their existing difference calculation. The owner requested a % suffix consistently across summaries, KPI and detail tables.
- Installation name is General Screener across the manifest and Apple title. Theme/background and icon canvas use the product's #0a0e11. Keep manifest identity, scope, start URL, encryption, data and workflow settings unchanged.

## Release checks

Run npm run check. With real encrypted input, inspect Overview, Radar, Screener (MLG/TENX), History, Performance, a historical run and full stock detail at 360/390px and 1440/1920px. Compare computed control position/size/font across routes; verify search is visible and keyboard usable, badges share right edges, disclosures open, and no horizontal overflow occurs. Confirm the deployed commit and live Pages UI. Device-specific installed-app cache refresh is separate from published asset verification.
- Follow-up: period controls use the same radio typography as strategy controls; all search inputs use 13px. Radar headlines are green for ordinary valid bands, red for validated issued events, muted for unavailable states. Overview secondary navigation stays muted until hover/focus. Mobile detail metrics have no outside right border.

## Radar retained-result product contract

An authenticated, validated last successful daily result remains the product result
when collection fails or a newer session is pending. Keep its score, verdict,
threshold charts, input cards, dated event labels and native active-state details.
Do not add operational failure/retry banners. The original date communicates age;
retained events must not be re-announced as new live alerts.

Use the bound last-successful-refresh receipt for the KST Updated date, including
an earlier result ID retained with the same exact ciphertext and valid clock order.
Never use the failed attempt's build/publication time as a successful refresh.
Legacy failed packets whose successful receipt was already lost show their source
session explicitly as 기준일, not as a fabricated Updated date. This compatibility
fallback does not reconstruct missing historical refresh evidence.

Malformed packets, invalid model seals, status/feed hash mismatch, mismatched
sessions, invalid receipt clocks and unavailable results remain fail-closed. This
policy is not permission to promote unverified data or modify model decisions.
Operational diagnostics stay in producer status/journals and separate monitoring.
