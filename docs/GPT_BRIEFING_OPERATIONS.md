# GPT briefing operations and rollback

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
