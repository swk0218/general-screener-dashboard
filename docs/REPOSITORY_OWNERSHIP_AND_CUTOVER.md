# Frontend publication responsibilities

The Radar lease in `config/result-publishers.json` is MarketRadar generation 2.
Screening owns MLG/TENX and its encrypted Screener payload. MarketRadar owns Radar
collection, calculation, encryption, recovery and scheduled execution. This repository
owns UI, result hosting, Pages builds and verified first-publication metadata.

Operational procedures are maintained once in the private
[MarketRadar runbook](https://github.com/swk0218/MarketRadar/blob/main/docs/REPOSITORY_OWNERSHIP_AND_CUTOVER.md)
and [operation map](https://github.com/swk0218/MarketRadar/blob/main/docs/OPERATIONS.md).
Do not copy provider acquisition or private model/runtime code into the frontend.
The canonical encrypted journal remains here; private research archives are separate.

## Verified rollout evidence

On 2026-10-08, target cold recovery and selected rehearsal passed; original October 6
recovery and separate fresh October 7 publication were accepted. Pages deployment
and the user's existing home-browser Radar/Screener navigation were verified.
Direct standalone JSON access was blocked by the browser, so no independent direct
served-byte hash check is claimed; deployed artifact bytes were verified separately.
Manual publication and UI success do not prove the first natural fresh-session run.
That scheduled check remains a separate operational acceptance item.

The one-time live recovery grant is retired after accepted publication; its immutable
proof registry stays in MarketRadar for historical cold reads. Do not delete or
rewrite accepted ciphers, receipts, model seals, source clocks or research dispositions.
Recurrence is controlled separately by MarketRadar's `RADAR_DAILY_ENABLED` setting.

## Delivery safeguards

- Preserve the access/encryption model; no browser provider keys or plaintext public datasets.
- Concurrent publishers use protected-path CAS; source/Screener/model changes are not silently overwritten.
- Engine result IDs and cipher hashes bind status to its exact feed. Missing or unverified results remain unavailable.
- Build time is the current completed build. First-publication time is a proven receipt for the same result, retained across rebuilds.
- Pages artifacts use unique run/attempt names and exact upload identities. A bounded visibility check reduces propagation races; deployment failures remain fail-closed.
- Tests use synthetic credentials/payloads and restore production files. `npm run check`, artifact guard tests and browser CI must pass for relevant changes.
