# GENERAL SCREENER

Private-by-passphrase static dashboard for the official MLG and TENX screener outputs.

## What is implemented

- Responsive desktop, tablet, and mobile terminal UI
- Exact strategy descriptors: MLG `중대형 성장주`, TENX `텐베거 유망주`
- Search, row details, run history, and benchmark-performance states
- Astryx components with the neutral dark theme
- Client-side PBKDF2-SHA256 + AES-256-GCM payload decryption
- GitHub Pages build workflow

The browser never calls FMP. The deployable site contains the static app shell and `public/data/payload.enc.json` only.

## Local use

```powershell
npm ci
npm run dev
```

Create or update the encrypted payload from a temporary plaintext file:

```powershell
$env:DASHBOARD_PASSPHRASE = '<private passphrase of at least 10 characters; 24+ recommended>'
npm run encrypt:payload -- --input fixtures\payload.json --output public\data\payload.enc.json
```

The encryption command validates the `general_screener_v1` data contract before writing. Keep the plaintext input ignored or outside the repository.

Run the full verification suite:

```powershell
npm run check
```

## Engine connection

The engine-side publisher runs after successful scheduled MLG/TENX or price-backfill workflows:

1. Read the persistent `calibration_tracking.csv` and `price_observations.csv` archives.
2. Normalize both strategies into `general_screener_v1` without cross-ranking them.
3. Reuse the engine's integrity-gated, run-equal performance calculation against QQQ.
4. Validate the full plaintext contract.
5. Encrypt with `DASHBOARD_PASSPHRASE` stored as a GitHub Actions secret.
6. Commit only `public/data/payload.enc.json` to this frontend repository.
7. Let `.github/workflows/pages.yml` verify and deploy `dist/client`.

The engine workflow uses a write-enabled deploy key scoped only to this repository. If source,
contract, encryption, or push validation fails, the last known-good encrypted payload remains live.

## Security boundary

This is authenticated encryption for a static site, not server-side account authentication. Anyone can download the ciphertext, so a weak passphrase can be attacked offline. Use a long random passphrase, rotate the local preview passphrase before public deployment, and never place FMP/API credentials in this repository or browser code.
