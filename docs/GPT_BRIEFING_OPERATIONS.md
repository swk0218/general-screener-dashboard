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
