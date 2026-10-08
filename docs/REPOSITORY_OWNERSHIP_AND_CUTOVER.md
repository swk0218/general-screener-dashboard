# Frontend publication responsibilities

This repository owns the dashboard UI, encrypted result hosting, production web
builds, and verified first-publication metadata. Data producers own collection,
calculation, encryption, and recovery. Keep producer runtime code, credentials,
raw source data, and private operational records out of the frontend.

## Git recovery data and web assets

The canonical encrypted recovery journal is retained in Git at
`public/data/radar-journal/`, together with its existing history. Recovery consumers
read it from a Git checkout. Do not delete, rewrite, or move these canonical files
as part of frontend build cleanup.

The production web build excludes only `public/data/radar-journal/`. The exclusion
is a build-time copy rule; it does not change repository data or development serving.
All other public assets, including encrypted dashboard feeds, seasonality, status,
icons, and the manifest, are copied byte-for-byte. Public asset symlinks are rejected
to prevent aliases from reintroducing excluded data into the deployment artifact.

## Delivery safeguards

- Preserve encryption and the existing access model. No browser provider keys or plaintext public datasets.
- Bind engine status to its exact encrypted feed. Missing or unverified results remain unavailable.
- Keep source, decision, build, and first-publication clocks separate. A rebuild cannot improve source freshness or reset an existing verified first-publication time.
- Preserve Pages artifact identity checks and fail-closed deployment behavior.
- Use synthetic data for code and browser tests; leave committed production inputs unchanged.
- Run `npm run check`, Pages artifact guard tests, and browser regression CI before release.
- Verify that the web artifact has no `data/radar-journal/` and that retained public assets are unchanged before the build-clock stamp.
