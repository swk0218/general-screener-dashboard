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
