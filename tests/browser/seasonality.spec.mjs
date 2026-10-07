import { test, expect } from '@playwright/test';
import { randomBytes, pbkdf2Sync, createCipheriv, createHash } from 'node:crypto';
import { encryptEnvelope } from '../../src/crypto/envelope.js';

// Public CI uses invented values and recommendations, never production plaintext.
const password='synthetic-browser-test-only';
const aggregate={schema:'radar_monthly_seasonality_v1',symbol:'SPY',start_year:2006,end_year:2025,lookback_years:20,
  price_basis:'dividend_adjusted_close',source:'FMP',computed_at_utc:'2026-10-07T11:00:00Z',
  months:Array.from({length:12},(_,index)=>({month:index+1,mean_return:(index-3)/1000,n:20}))};
const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,600000,32,'sha256'),iv);
cipher.setAAD(Buffer.from('radar_monthly_seasonality_v1'));
const bytes=Buffer.concat([cipher.update(JSON.stringify(aggregate),'utf8'),cipher.final(),cipher.getAuthTag()]);
const seasonality={envelope_version:'radar_monthly_seasonality_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
  salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:bytes.toString('base64'),payload_hash:createHash('sha256').update(bytes).digest('hex'),payload_hash_kind:'ciphertext_sha256'};
const payload=await encryptEnvelope({contract_version:'general_screener_v2',generated_at:'2026-10-07T10:00:00Z',benchmark:'QQQ',
 evidence_status:'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',runs:[{strategy:'MLG',run_id:'qa-1',report_created_at:'2026-10-07T10:00:00Z'}],
 recommendations:[{strategy:'MLG',run_id:'qa-1',symbol:'TEST',recommendation_rank:1,score:88.79,screening_price:211.94,current_price:214.25,current_price_as_of:'2026-10-07',risk_flags:'event_risk_status=available'}],
 performance:{aggregates:[],signals:[]}},password);

async function setup(page, seasonalityResponse=()=>({json:seasonality})) {
  await page.route('**/data/payload.enc.json*',route=>route.fulfill({json:payload}));
  await page.route('**/data/radar-seasonality.enc.json*',async route=>route.fulfill(await seasonalityResponse()));
  await page.route('**/data/radar-observation.json*',route=>route.fulfill({status:404}));
  await page.route('**/data/market-radar.enc.json*',route=>route.fulfill({status:404}));
  await page.goto('/#/radar');
}
async function unlock(page) {
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.app-shell')).toBeVisible();
}
test('encrypted reference remains readable, isolated and lock-safe',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await setup(page);
  await expect(page.locator('.radar-seasonality')).toHaveCount(0);
  await unlock(page);
  const card=page.locator('.radar-seasonality');await expect(card).toBeVisible();
  await expect(card.locator('dt')).toHaveCount(12);await expect(card.locator('strong')).toHaveCount(12);
  await expect(card.locator('h3')).toHaveText('SPY 월별 평균 수익률');
  await expect(card.locator('.radar-seasonality-heading>span')).toHaveText('2006–2025 · 최근 20년');
  await expect(card.locator('.is-current')).toHaveCount(1);
  await expect(card.locator('strong').first()).toHaveText('-0.30%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await card.scrollIntoViewIfNeeded();await card.screenshot({path:testInfo.outputPath('seasonality.png')});
  for (const hash of ['#/overview','#/selection/MLG','#/history','#/performance','#/radar']) {
    await page.evaluate(hash=>location.hash=hash,hash);await expect(page.locator('.app-shell')).toBeVisible();
  }
  await expect(card).toBeVisible();
  const lock=page.locator('button[aria-label="스크리너 잠금"]:visible').first();await lock.click();
  await expect(page.locator('input[type=password]')).toBeVisible();await expect(card).toHaveCount(0);
  await unlock(page);await expect(card).toBeVisible();
  expect(errors).toEqual([]);
});
test('missing optional reference does not block radar or screener',async({page})=>{
  await setup(page,()=>({status:404}));await unlock(page);
  await expect(page.locator('.radar-view')).toBeVisible();await expect(page.locator('.radar-seasonality')).toHaveCount(0);
  await page.evaluate(()=>location.hash='#/overview');await expect(page.locator('.app-shell')).toBeVisible();
});
test('late decrypt response cannot restore data after locking',async({page})=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  await setup(page,async()=>{await gate;return {json:seasonality};});await unlock(page);
  await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();release();
  await expect(page.locator('input[type=password]')).toBeVisible();await expect(page.locator('.radar-seasonality')).toHaveCount(0);
});
