import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { encryptEnvelope } from '../../src/crypto/envelope.js';

const input = process.env.SCREENER_PUBLISHED_REVIEW_FILE;
test('native publisher output unlocks and opens each published strategy and briefing status', async ({page, baseURL}) => {
  test.skip(!input, 'Supply a private JSON output from the engine dashboard publisher.');
  const origin = new URL(baseURL);
  expect(['localhost','127.0.0.1','[::1]']).toContain(origin.hostname);
  const payload = JSON.parse(await readFile(input, 'utf8'));
  const passphrase = randomUUID();
  const encrypted = await encryptEnvelope(payload, passphrase);
  const samples = new Map();
  for (const row of payload.recommendations) {
    const kind = row.strategy + '/' + (row.qualitative?.status || 'legacy');
    if (!samples.has(kind)) samples.set(kind, row);
  }
  expect(samples.size).toBeGreaterThan(0);

  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort();
    if (url.pathname.endsWith('/data/payload.enc.json')) return route.fulfill({json: encrypted});
    if (url.pathname.startsWith('/data/')) return route.fulfill({status: 404});
    return route.continue();
  });
  await page.goto('/#/overview');
  await page.locator('input[type=password]').fill(passphrase);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.app-shell')).toBeVisible();
  for (const row of samples.values()) {
    const route = ['detail',row.strategy,row.run_id,row.symbol].map(encodeURIComponent).join('/');
    await page.evaluate(hash => { window.location.hash = hash; }, '#/' + route);
    const article = page.getByRole('article', {name: row.symbol + ' 전체 상세'});
    await expect(article).toBeVisible();
    const panel = article.getByRole('region', {name: row.symbol + ' 정성 분석'});
    if (row.qualitative) await expect(panel).toHaveAttribute('data-status', row.qualitative.status);
    else await expect(panel).toHaveCount(0);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
});
