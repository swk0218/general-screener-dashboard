import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
import {pipelineFixture} from '../fixtures/briefing-pipeline.mjs';
import {fixturePassword,cutoff} from '../fixtures/briefing-native.mjs';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../../scripts/seal-briefing-artifact.mjs';

for(const scenario of ['current','delayed','missing','unknown-data-date','restored-refresh'])test(`one unlock and automatic session: ${scenario}`,async({page})=>{
  const temp=await mkdtemp(join(tmpdir(),'briefing-session-'));
  const {artifact,native}=await pipelineFixture(temp);
  const file=join(temp,'cipher.json');
  await sealBriefingArtifact(artifact,fixturePassword,file,{executionMode:'fake_transport'});
  const raw=await readFile(file),status=await writeBriefingDeliveryStatus(artifact,raw,join(temp,'status.json'));
  const packet=JSON.parse(native.archive.raw.toString());
  const dashboardPayload=JSON.parse(packet.payload_json);
  if(scenario==='unknown-data-date')for(const row of dashboardPayload.recommendations){
    row.screening_price_as_of=null;row.current_price_as_of='2026-11-02';
  }
  const encrypted=await encryptEnvelope(dashboardPayload,fixturePassword);
  const radarStatus={...native.radar.status,source_market_close_utc:'2026-10-30T20:00:00Z'};
  if(scenario==='restored-refresh')Object.assign(radarStatus,{
    published_at_utc:null,built_at_utc:null,publication_receipt_result_id:null,publication_deployment_id:null,
    last_successful_refresh:{engine_result_id:radarStatus.engine_result_id,feed_cipher_sha256:radarStatus.feed_cipher_sha256,
      completed_at_utc:'2026-11-02T10:30:00Z',outcome:'PUBLISHED'}});
  if(scenario==='delayed'){radarStatus.status='STALE';radarStatus.expected_session='2026-11-02';}
  await page.clock.install({time:new Date(cutoff)});
  await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:encrypted}));
  await page.route('**/data/radar-observation.json',r=>r.fulfill({json:radarStatus}));
  await page.route('**/data/market-radar.enc.json',r=>r.fulfill({body:native.radar.raw,contentType:'application/json'}));
  await page.route('**/data/radar-seasonality.enc.json',r=>r.fulfill({status:404}));
  await page.route('**/data/briefing-status.json',r=>r.fulfill(['missing','unknown-data-date'].includes(scenario)?{status:404}:{json:status}));
  await page.route('**/data/briefing.enc.json',r=>r.fulfill({body:raw,contentType:'application/json'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/briefing');
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await page.locator('input[type=password]').fill(fixturePassword);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.brief-clocks')).toBeVisible();
  if(['current','restored-refresh'].includes(scenario)){
    await expect(page.locator('.brief-card')).toHaveCount(2);
    await page.locator('.brief-tabs button').nth(1).click();
    await expect(page.locator('.brief-role')).toHaveCount(5);
    await page.locator('.brief-role details').first().locator('summary').click();
    await expect(page.locator('.brief-role a[href="https://www.sec.gov/Archives/"]').first()).toBeVisible();
    await expect(page.locator('.brief-role a[href="https://www.sec.gov/Archives/"]').first()).not.toContainText('원문');
    await page.locator('.brief-tabs button').first().click();
    const before=await page.locator('.brief-clocks').innerText();
    for(const clock of ['2026-11-02T14:40:01Z','2026-11-02T21:00:01Z','2026-11-10T03:20:00Z']){
      await page.clock.setSystemTime(new Date(clock));
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      await expect(page.locator('.brief-card')).toHaveCount(0);
      await expect(page.locator('.brief-clocks')).toContainText('이전 결과');
      await expect(page.locator('.brief-clocks')).toContainText('생성되지 않음');
      await expect(page.locator('.brief-clocks')).toContainText('2026-10-30');
      if(clock.startsWith('2026-11-10'))await expect(page.locator('.brief-notice').first()).toContainText('달력의 최신 확인');
    }
    // Reassessment neither edits the stored result nor refreshes its generation clock.
    await page.clock.setSystemTime(new Date(cutoff));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.brief-card')).toHaveCount(2);
    await expect.poll(()=>page.locator('.brief-clocks').innerText()).toBe(before);
  }
  else{await expect(page.locator('.brief-card')).toHaveCount(0);await expect(page.locator('.brief-clocks')).toContainText('생성되지 않음');}
  if(scenario==='unknown-data-date'){
    const tenx=page.locator('.brief-clocks>div').nth(1);
    await expect(tenx).toContainText('기준일 확인 불가');
    await expect(tenx).toContainText('2026-11-02 10:00 UTC');
    await expect(tenx).toContainText('데이터 기준일과 다릅니다');
    await expect(tenx).not.toContainText('기준일 일치');
  }
  await page.getByRole('button',{name:'스크리너',exact:true}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.getByRole('button',{name:'투자 판단 브리핑',exact:true}).click();
  await expect(page.locator('.brief-clocks')).toBeVisible();
  await page.getByRole('button',{name:'잠그기',exact:true}).click();
  await expect(page.locator('input[type=password]')).toHaveValue('');
  await expect(page.locator('.brief-clocks')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
