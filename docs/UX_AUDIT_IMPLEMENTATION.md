# UX audit implementation — 2026-09-10

Preserve Astryx neutral, the terminal palette, official rankings, original scores, encrypted data and authentication. The following maps both 2026-09-09 audit proposals to the implementation, including the first PR changes and the completion pass.

| Audit ID | Resolution |
| --- | --- |
| P1-01 | Desktop chart and table stack; chart-only horizontal scrolling, fixed axis; mobile expandable run list. |
| P1-02 | Global search and all historical detail entry points identify current inclusion/exclusion, execution time and archived score basis. |
| P1-03 | Excess returns use %p; absolute returns use %; overview and performance explain run-average and benchmark ETF. |
| P2-01 | Global search uses two lines, wrapping context and bounded company-name truncation. |
| P2-02 | Preserve History query/filter/scroll and row focus; preserve per-strategy screener query; detail returns to originating screen. |
| P2-03 | Label score change/enrollment separately from USD prices. |
| P2-04 | Distinguish publication refresh, selection date, price date and archived price. |
| P2-05 | Wrap all change tickers, separate new/re-entry counts, make individual tickers open details. Removed tickers open previous selection with historical warning. |
| P2-06 | Shared metadata/label/body size roles (12/14/16px at default font setting), no 8–11px overrides; larger action targets. |
| P2-07 | Label MLG coefficients and available ranges; TENX contributions show actual maximum allocation. No fabricated additive MLG score. |
| P2-08 | Independent desktop detail columns, early risks, single mobile column and collapsed execution metadata. |
| P2-09 | TENX historical-method scope appears by performance and overview cards. Version-separated performance is not fabricated from aggregate-only data. |
| P2-10 | Explain missing waiting-reason distinction and show complete run count. Exact expected dates / missing-price reasons require upstream data and are not invented. |
| P3-01 | Korean product labels for preview, summary, sector, confidence, timing and transitions; preserve meaningful financial abbreviations. |
| P3-02 | Scoped input focus treatment and visible keyboard focus for actions/chart. |
| P3-03 | Complete known abbreviated thesis copy and retain original thesis in provenance disclosure; disclose absent source text. |
| M01 | Same as P1-03. |
| M02 | Same as P2-05. |
| M03 | Fixed chart axis; tap/keyboard selection with exact returns and excess; date/excess-first mobile expandable rows; run-level summary. |
| M04 | Preserve tab search/filter/scroll; explicit History reset; performance period also survives menu changes. |
| M05 | Scoped zero-result message and all-strategy recovery beside search. |
| M06 | Compact mobile detail header, persistent return action, risks before extended metrics, metadata disclosure. |
| M07 | Readable confidence/transition labels, clear score/price/date units, unknown coefficient range shown as missing. |
| M08 | Two-line mobile overview rows with wrapping company names; readable secondary typography and method text. |

## Validation

- npm run check: 55 regression tests, encrypted-payload verification, production build and asset verification.
- Synthetic-data React/jsdom interactions: scoped empty-result recovery; History query across menu/back navigation; historical/current selection and latest recovery; exact chart selection; screener-query preservation; removed-ticker previous selection and origin return; performance-period preservation.
- Chrome actual rendering in a same-origin iframe with synthetic fixtures, CSS content widths 360, 390, 430, 768, 1024, 1280, 1366, 1440 and 1920: selection, performance and method had no page-level horizontal overflow; performance chart/table had no overlap.
- Mobile historical detail overflow found during browser QA and fixed; verified clientWidth = scrollWidth = 360.
- Browser interactions confirmed removed-ticker detail/origin return, scoped search recovery and NVDA query preservation across menu navigation. Mobile detail/method and desktop performance screenshots inspected.
- This is responsive Chrome rendering, not a physical Android/iOS test. Virtual keyboard, screen reader, 200% browser zoom and exhaustive browser combinations remain unverified. Source-score/ranking validation is outside this UI change.
- Synthetic fixtures and QA wrapper are excluded from the production build and publication; original encrypted payload/authentication remain unchanged.

## Explicit non-adoptions

No arbitrary filters/sorts, wholesale redesign, new score calculations, guessed missing-price reasons, estimated observation dates or reconstructed engine-version performance. These either change the product's official-result purpose or need source data absent from the current payload.
