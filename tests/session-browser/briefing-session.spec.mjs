import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
import {pipelineFixture} from '../fixtures/briefing-pipeline.mjs';
import {fixturePassword,cutoff} from '../fixtures/briefing-native.mjs';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../../scripts/seal-briefing-artifact.mjs';

for(const scenario of ['current','delayed','missing'])test(`one unlock and automatic session: ${scenario}`,async({page})=>{
  const temp=await mkdtemp(join(tmpdir(),'briefing-session-'));
  const {artifact,native}=await pipelineFixture(temp);
  const file=join(temp,'cipher.json');
  await sealBriefingArtifact(artifact,fixturePassword,file,{executionMode:'fake_transport'});
  const raw=await readFile(file),status=await writeBriefingDeliveryStatus(artifact,raw,join(temp,'status.json'));
  const packet=JSON.parse(native.archive.raw.toString());
  const encrypted=await encryptEnvelope(JSON.parse(packet.payload_json),fixturePassword);
  const radarStatus={...native.radar.status,source_market_close_utc:'2026-10-30T20:00:00Z'};
  if(scenario==='delayed'){radarStatus.status='STALE';radarStatus.expected_session='2026-11-02';}
  await page.clock.install({time:new Date(cutoff)});
  await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:encrypted}));
  await page.route('**/data/radar-observation.json',r=>r.fulfill({json:radarStatus}));
  await page.route('**/data/market-radar.enc.json',r=>r.fulfill({body:native.radar.raw,contentType:'application/json'}));
  await page.route('**/data/radar-seasonality.enc.json',r=>r.fulfill({status:404}));
  await page.route('**/data/briefing-status.json',r=>r.fulfill(scenario==='missing'?{status:404}:{json:status}));
  await page.route('**/data/briefing.enc.json',r=>r.fulfill({body:raw,contentType:'application/json'}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/briefing');
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await page.locator('input[type=password]').fill(fixturePassword);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('.brief-clocks')).toBeVisible();
  if(scenario==='current')await expect(page.locator('.brief-card')).toHaveCount(2);
  else{await expect(page.locator('.brief-card')).toHaveCount(0);await expect(page.locator('.brief-clocks')).toContainText('생성되지 않음');}
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
