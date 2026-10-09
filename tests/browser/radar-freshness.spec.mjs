import {test,expect} from '@playwright/test';
import {randomBytes,pbkdf2Sync,createCipheriv,createHash} from 'node:crypto';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
import {dailyFixture} from '../fixtures/radar-packets.mjs';
import {unavailableEngineStatus} from '../../src/features/radar/observation-status.js';

const password='synthetic-browser-test-only';
const payload=await encryptEnvelope({contract_version:'general_screener_v2',generated_at:'2026-03-13T10:00:00Z',benchmark:'QQQ',
  evidence_status:'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',runs:[{strategy:'MLG',run_id:'qa-1',report_created_at:'2026-03-13T10:00:00Z'}],
  recommendations:[{strategy:'MLG',run_id:'qa-1',symbol:'TEST',recommendation_rank:1,score:88.79,screening_price:211.94,current_price:214.25,current_price_as_of:'2026-03-12',risk_flags:'event_risk_status=available'}],
  performance:{aggregates:[],signals:[]}},password);
const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,600000,32,'sha256'),iv);
cipher.setAAD(Buffer.from('market_radar_v1'));
const bytes=Buffer.concat([cipher.update(JSON.stringify(dailyFixture()),'utf8'),cipher.final(),cipher.getAuthTag()]);
const feed=JSON.stringify({envelope_version:'market_radar_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
  salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:bytes.toString('base64'),payload_hash_kind:'ciphertext_sha256',
  payload_hash:createHash('sha256').update(bytes).digest('hex')});

for(const scenario of ['quiet-stop','failed','status-missing']) {
  test(`summary/detail freshness ${scenario} preserves dated data and lock isolation`,async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));let feedReads=0;
    const status={...unavailableEngineStatus(),status:scenario==='failed'?'FAILED':'DATED',source_session:'2026-03-12',expected_session:'2026-03-12',
      input_admitted_at_utc:'2026-03-13T10:00:00Z',model_computed_at_utc:'2026-03-13T10:00:00Z',latest_attempt_at_utc:'2026-03-13T10:00:00Z',
      next_scheduled_at_utc:'2026-03-13T12:40:00Z',feed_cipher_sha256:createHash('sha256').update(feed).digest('hex'),engine_result_id:'a'.repeat(64)};
    await page.clock.install({time:new Date('2026-03-13T12:00:00Z')});
    await page.route('**/data/payload.enc.json*',route=>route.fulfill({json:payload}));
    await page.route('**/data/radar-observation.json*',route=>route.fulfill(scenario==='status-missing'?{status:404}:{json:status}));
    await page.route('**/data/market-radar.enc.json*',route=>{feedReads++;return route.fulfill({body:feed,contentType:'application/json'});});
    await page.route('**/data/radar-seasonality.enc.json*',route=>route.fulfill({status:404}));
    await page.goto('/#/overview');
    await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
    const summary=page.locator('.overview-radar');await expect(summary).toBeVisible();
    await expect(summary.locator('.overview-radar-score strong')).toHaveText('50');
    if(scenario==='quiet-stop')await expect(summary.locator('.radar-headline')).toContainText('현재');
    await page.clock.setSystemTime(new Date('2026-03-13T14:40:01Z'));
    await page.clock.fastForward(60001);
    await expect(summary.locator('.radar-headline')).toContainText('해당 기준일');
    await expect(summary.locator('[role=status]')).toBeVisible();
    await expect(summary.locator('.is-alert')).toHaveCount(0);
    await summary.getByText('지수 자세히',{exact:true}).click();
    const detail=page.locator('.radar-view');await expect(detail).toBeVisible();
    await expect(detail.locator('.radar-headline')).toContainText('해당 기준일');
    await expect(detail.locator('.radar-gauge [role=status]')).toBeVisible();
    await expect(detail.locator('[role=alert]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await detail.locator('.radar-gauge').screenshot({path:testInfo.outputPath(`radar-${scenario}.png`)});
    const readsBefore=feedReads;
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
    await expect(detail.locator('.radar-headline')).toContainText('해당 기준일');
    expect(feedReads).toBe(readsBefore);
    await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();
    await expect(page.locator('input[type=password]')).toBeVisible();await expect(detail).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
