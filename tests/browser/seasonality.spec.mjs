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
  await page.clock.install({time:new Date('2026-10-07T12:00:00Z')});
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
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({path:testInfo.outputPath('seasonality.png')});
  for (const hash of ['#/overview','#/selection/MLG','#/selection/TENX','#/history','#/performance','#/radar']) {
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

for (const [name, bad] of [['malformed',{unexpected:true}],['authentication-failed',{...seasonality,iv:randomBytes(12).toString('base64')}]]) {
  test(`${name} optional feed cannot block either screener strategy`,async({page})=>{
    await setup(page,()=>({json:bad}));await unlock(page);
    await expect(page.locator('.radar-view')).toBeVisible();await expect(page.locator('.radar-seasonality')).toHaveCount(0);
    for (const hash of ['#/selection/MLG','#/selection/TENX']) {
      await page.evaluate(hash=>location.hash=hash,hash);await expect(page.locator('.app-shell')).toBeVisible();
      await expect(page.locator('.radar-view')).toHaveCount(0);
    }
  });
}
test('open and resumed tabs update the month marker and hide expired windows',async({page})=>{
  await setup(page);await unlock(page);const card=page.locator('.radar-seasonality');await expect(card).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(card.locator('.is-current dt')).toContainText('11월');
  await page.clock.setSystemTime(new Date('2027-01-01T04:59:30Z'));
  await page.clock.fastForward(60001);
  await expect(card).toHaveCount(0);await expect(page.locator('.radar-view')).toBeVisible();
});

test('current-month green accent follows the clock and preserves negative return color',async({page},testInfo)=>{
  await setup(page);await unlock(page);
  const card=page.locator('.radar-seasonality'),current=card.locator('.radar-seasonality-month.is-current');
  await expect(current.locator('dt')).toContainText('10월');
  const colors=await page.evaluate(()=>{
    const probe=document.createElement('span');document.body.append(probe);
    probe.style.color='var(--gs-green)';const green=getComputedStyle(probe).color;
    probe.style.color='var(--gs-negative)';const negative=getComputedStyle(probe).color;
    probe.remove();return {green,negative};
  });
  await expect(current.locator('dt')).toHaveCSS('color',colors.green);
  await expect(current).toHaveCSS('border-top-color',colors.green);
  await expect(current.locator('.radar-seasonality-bar i')).toHaveCSS('background-color',colors.green);
  await expect(current.locator('strong')).toHaveCSS('color',colors.green);
  expect(await current.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.clock.setSystemTime(new Date('2026-11-01T05:00:00Z'));
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(current.locator('dt')).toContainText('11월');
  await expect(current.locator('dt')).toHaveCSS('color',colors.green);
  await expect(card.locator('.radar-seasonality-month').nth(9)).not.toHaveClass(/is-current/);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({path:testInfo.outputPath('green-current-month.png')});
});

test('negative current-month value keeps its minus sign and negative color',async({page},testInfo)=>{
  const negativeAggregate=structuredClone(aggregate);negativeAggregate.months[9].mean_return=-.006;
  const negativeSalt=randomBytes(16),negativeIv=randomBytes(12);
  const negativeCipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,negativeSalt,600000,32,'sha256'),negativeIv);
  negativeCipher.setAAD(Buffer.from('radar_monthly_seasonality_v1'));
  const negativeBytes=Buffer.concat([negativeCipher.update(JSON.stringify(negativeAggregate),'utf8'),negativeCipher.final(),negativeCipher.getAuthTag()]);
  const envelope={...seasonality,salt:negativeSalt.toString('base64'),iv:negativeIv.toString('base64'),ciphertext:negativeBytes.toString('base64'),payload_hash:createHash('sha256').update(negativeBytes).digest('hex')};
  await setup(page,()=>({json:envelope}));await unlock(page);
  const card=page.locator('.radar-seasonality'),current=card.locator('.radar-seasonality-month.is-current');
  await expect(current.locator('dt')).toContainText('10월');
  await expect(current.locator('strong')).toHaveText('-0.60%');
  const colors=await current.evaluate(el=>({label:getComputedStyle(el.querySelector('dt')).color,value:getComputedStyle(el.querySelector('strong')).color,bar:getComputedStyle(el.querySelector('i')).backgroundColor}));
  expect(colors.value).not.toBe(colors.label);expect(colors.bar).toBe(colors.value);
  await card.scrollIntoViewIfNeeded();await card.screenshot({path:testInfo.outputPath('green-current-negative-return.png')});
});

// Engine-status migration coverage uses intercepted invented replies only.
// Production ciphertext/status files are never rewritten by this suite.
for (const scenario of ['unavailable','current','failed','expired','malformed']) {
  test(`Radar engine status ${scenario} stays honest through lock and navigation`,async({page},testInfo)=>{
    const {unavailableEngineStatus}=await import('../../src/features/radar/observation-status.js');
    let status=unavailableEngineStatus();
    if(!['unavailable','malformed'].includes(scenario))Object.assign(status,{
      status:scenario==='failed'?'FAILED':'DATED',source_session:'2026-10-06',expected_session:'2026-10-06',
      source_market_close_utc:'2026-10-06T20:00:00Z',input_admitted_at_utc:'2026-10-07T10:17:05Z',
      model_computed_at_utc:'2026-10-07T10:18:00Z',latest_attempt_at_utc:'2026-10-07T10:18:10Z',
      next_scheduled_at_utc:scenario==='expired'?'2026-10-07T09:00:00Z':'2026-10-07T12:40:00Z',
      engine_result_id:'a'.repeat(64),feed_cipher_sha256:'b'.repeat(64),failure_code:scenario==='failed'?'SOURCE_FETCH_FAILED':null,
      built_at_utc:'2026-10-07T11:59:00Z',published_at_utc:'2026-10-07T11:59:30Z',publication_receipt_result_id:'a'.repeat(64)
    });
    if(scenario==='malformed')status={schema_version:'wrong',status:'DATED'};
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await setup(page);
    await page.route('**/data/radar-observation.json*',route=>route.fulfill({json:status}));
    await unlock(page);
    const assertEmptyRadar=async()=>{
      const view=page.locator('.radar-view');await expect(view).toBeVisible();
      await expect(view.locator('.radar-dial-number')).toHaveText('—/100');
      await expect(view.locator('.radar-headline')).toHaveText('—');
      await expect(view.locator('.radar-dial-needle,.radar-headline.is-normal,.lucide-triangle-alert')).toHaveCount(0);
      await expect(view.locator('.radar-observation-panel')).toHaveCount(0);
      await expect(view).not.toContainText(/경보 없음|미계산|갱신 지연|보류|MarketRadar 엔진/);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    };
    await assertEmptyRadar();
    await page.locator('.radar-view').screenshot({path:testInfo.outputPath(`engine-${scenario}.png`)});
    await page.evaluate(()=>location.hash='#/selection/MLG');await expect(page.locator('.radar-view')).toHaveCount(0);
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.evaluate(()=>location.hash='#/radar');await assertEmptyRadar();
    await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();
    await expect(page.locator('.radar-view')).toHaveCount(0);await unlock(page);await assertEmptyRadar();
    expect(errors).toEqual([]);
  });
}
