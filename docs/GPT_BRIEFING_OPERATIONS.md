# GPT briefing operations and rollback

## 2026-11-17 development review

The development reader translates `provider_timeout` and `provider_http_error`
into Korean hold reasons. An unknown failure reason uses a fixed message rather
than showing provider internals. TENX Q remains unevaluated and the producer's
numeric ranking stays authoritative. Optional Radar news delivery now has a
15-second deadline covering both response headers and the encrypted body; a
timeout follows the existing unavailable state and lock still cancels requests.

For final visual review without a new password, start the existing Vite dev server
and open `/qualitative-preview.html`. Select `qualitative-review.json` from an
isolated engine validation run. The file must use `gpt_qualitative_review_v1`,
`numeric_current=false` and `full_cohort_evaluation=false`. The screen uses the
same `StockBriefing` component, local fonts and design tokens as the screener.
It labels the historical numeric score and limited current news separately;
an API failure is displayed as a held evaluation, never Q=0 or a completed model
response. Its receipt shows only the run ID, source SHA and request count.

The selected file lives only in page memory and is cleared by closing the data
or reloading. No password is created or stored. This separate development entry
is absent from the production build, and `verify:build` rejects its inclusion.
Never place the actual review JSON in the checkout or public assets. Existing
production ciphertext, publication journals and Pages deployment remain unchanged.

This change implements the GS-GPT-02 presentation contract. MLG/TENX producers
own classification, numeric application and cohort ranking. MarketRadar owns
news selection and costs. This repo has no paid API calls, financial credentials,
or model budget ledger. Do not add browser API keys or provider requests.

## Development state and launch gate

The pinned baseline is `88943f60e4b9fcfa31c97bf397702aab695aac65`.
It is preserved remotely as `backup/pre-gpt-development-20261107`; development
uses `codex/gpt-screener-development-20261107`. The old 11/6 backup is not the
current baseline. Source backups do not contain secrets or externally retained
state. No production publish/deployment is authorized by this document.

`VITE_GPT_NEWS_ENABLED` is unset/false by default. Set it to `true` only for a
reviewed deployment with the producer's compatible encrypted sidecar. MLG/TENX
optional enrichment appears only when the authenticated screener payload contains
it. A deployment flag does not grant provider access, legal rights, budget, or
approval to switch producer pipelines.

Disable news by rebuilding with the flag unset/false. Disable stock enrichment
at the producer; existing numeric-only payloads remain compatible. To restore
source, review and deploy the pinned backup through the existing release process;
do not reset live encrypted feeds, journals or publication receipts to older
versions. Confirm existing decryption, ranking, build/publication clock and
retained data guards after rollback. Never commit secrets or synthetic test data
to `public/data/`.

## Verification

Run `npm run check`, `python -m unittest discover -s tests -p test_pages_artifact.py`
and `npm run test:browser -- tests/browser/briefing.spec.mjs`. Synthetic browser
fixtures cover full detail, overview, disclosure, history navigation, mobile
widths and lock cleanup. `tests/briefing.test.mjs` covers invalid links, unknown
statuses, future evidence, S/Q/T and MLG deltas, duplicate events and cache ages.
`tests/news-envelope.test.mjs` covers authenticated roundtrip, wrong credentials,
AAD separation, ciphertext tampering and malformed optional data. Do not repeat
full production CI or live provider calls just to test this renderer.


## 2026-11-11 isolated integration

The original development branch incorporates Dashboard main `423d2a8` without
changing its encrypted payload, Radar feed, observation or journal blobs. Pages
continues to publish main only; a development CI push is read-only validation.
No production flag, password, score engine or ranking rule changes here.

Company briefings accept the producer's limited-positive MLG E=.80 and up to
100 distinct validated event records. The first three business assertions are
visible; further business facts and excluded assertions expand on demand. This
limit applies to company evidence, not Radar's separate maximum three headlines.
Opinion, donation itself, nonbusiness and numeric-duplicate badges use normalized
producer fields. Conflicting excluded Q is quarantined rather than recalculated.
The public adapter carries only bounded enum/number metadata, never raw quotes,
provider traces or credentials. An independent supported business assertion in the
same article remains eligible. Its URL and publication clock stay attached to it.

The private review preserves original proposals separately from normalized
adoption. Old unclassified responses remain labelled as the earlier harness and
are not represented as a fresh classification pass. A new v3 model response has
not yet been paid for or verified. Actual Radar search adoption (1) and stored
response revalidation (3) remain distinct; neither is a new search on rebuild.

Validation: Node24 `npm run check`, Pages artifact guard and TEST_ONLY Playwright
at 320/390/1440px. Browser plugin not available in the local environment; local
Chromium additionally fails socket creation (EPERM), so the existing development
CI runs its normal pinned Chromium validation. A passing compile is not visual QA.
Screenshots are synthetic only; no private source or password is committed.

All new paid work is paused: the specific five-call / $0.04 plan is closed after
five calls. The existing shared allocation has $0.002727 unreserved capacity;
the owner's monthly $50 ceiling is not an automatic additional call allowance.
Site refresh and new Library uploads remain separately restricted. This source
integration does not refresh the user's previously delivered private preview.


## Resume: stored-review compatibility (2026-11-11)

Opening the unchanged Library v12 bundle exposed a renderer contract regression:
74 of 670 stored events used canonical `routine`, `unknown` or `clean` states
that the new display validator omitted. The actual company schema has seven
states; `resolved` is a stage, not an eighth state. The display now accepts the
same enum, labels routine as limited risk and unknown as uncertainty, and keeps
risk badges when `new_state=false`. Only positive/clean premiums become neutral
for no incremental change, matching the existing producer behavior.

The original 242 company cases, 121 numeric rows, dates and all source/proposal
bytes remain unchanged. The existing Radar proof still distinguishes actual 1
from cached 3. No stored response is relabelled as a v3 model classification.
Two new focused compatibility checks and actual v12 import passed. Earlier full
regression and paid calls are not rerun for this resume; any future release must
record its own applicable acceptance evidence. The local preview candidate is
prepared without refreshing Site or saving new Library versions.

### Native publisher browser regression

Use the engine's `scripts/build_general_screener_payload.py` on a private copy of tracking data. Include both strategies and at least one newly enriched recommendation when verifying a publisher or schema change. Keep its JSON outside the checkout and the public assets directory.

Run `SCREENER_PUBLISHED_REVIEW_FILE=/absolute/private/payload.json npx playwright test tests/browser/publisher-local.spec.mjs` in the dashboard checkout. The test encrypts the supplied output with an ephemeral test credential, opens the regular local dashboard, and visits one detail for every strategy and assessment status present. This exercises decryption and the display contract. Live collection, provider access, and cohort coverage require separate evidence.
