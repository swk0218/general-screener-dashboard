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

Radar also shows the actual observation basis beside the bound last-successful
Updated date. A small muted `이전 자료 유지` or `갱신 확인 대기` note may explain a
retained result or elapsed expected check; it is not a failure/retry banner and
does not declare the scheduler failed, promote data to current, or reannounce
past events. Both entry points use the same presentation function and existing
focus/visibility timer. No browser calendar or provider collection is added.

Both Radar dates include their year. The authenticated packet's basis remains
visible when no successful-refresh/publication receipt can be verified; show
`갱신 확인 불가` in place of a refresh date. The absence of a refresh receipt
does not erase a known observation date or manufacture a successful update.


## Optional GPT qualitative briefing (GS-GPT-02)

Enrichment is display-only and optional. Missing `recommendation.qualitative`
leaves existing screens unchanged. MLG shows producer-declared legacy/adopted A/E
and `score_delta`; TENX shows distinct `quantitative_score` (S),
`qualitative_adjustment` (Q), `adjusted_score` (T), and `ranking_basis`.
The browser validates consistency but never recalculates published scores or sorts
recommendations by Q/T. Incomplete cohort means the producer retains S ranking.
`unevaluated`/fallback/disabled/stale never masquerade as evaluated zero.
Evidence opens on demand, links are HTTPS without URL credentials, and source
cutoff and analysis clocks stay separate. Malformed optional enrichment cannot
invalidate the numeric payload or expose arbitrary HTML.

Radar news is an independent encrypted sidecar, not a Beta model input. The
reader is disabled unless `VITE_GPT_NEWS_ENABLED=true` is explicitly set at build
or local preview time. It reads `data/radar-news.enc.json` only during unlock,
using the entered passphrase without storing it. Its envelope uses AES-256-GCM,
600000-round PBKDF2-SHA256, ciphertext SHA256, envelope version
`radar_news_encrypted_v1` and AAD `radar_news_v1`. News failure is isolated from
Beta score/alert availability. Lock/unmount aborts loading and clears decrypted
news; late responses cannot restore it after lock.

`radar_news_v1` requires `affects_beta:false`, run/policy identity, cutoff and
analysis times, status, and zero to three deduplicated events. Each item contains
headline, summary, market transmission explanation, publication time and HTTPS
sources. Politics is allowed when market-relevant, without partisan preference.
A verified empty result is distinct from unavailable. Cached source cutoff stays
visible; news older than 24 hours is labeled previous data, including in a
long-open tab. An empty stale result is not described as no important news.
No provider keys, plaintext public news/recommendations or raw receipts enter the
frontend repository. Encrypted transport publication remains a separate release
gate. Existing source/build/publication clocks and data journals are unchanged.
