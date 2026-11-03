import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pipelineFixture} from '../fixtures/briefing-pipeline.mjs';
import {fixturePassword,cutoff,nativeArchive} from '../fixtures/briefing-native.mjs';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../../scripts/seal-briefing-artifact.mjs';

const available=Boolean(process.env.BRIEFING_TEST_PYTHON&&process.env.BRIEFING_TEST_BACKEND);
if(!available)throw Error('Private offline fixture writer required; no live sources allowed');
let bundle;
test.beforeAll(async()=>{
  const root=await mkdtemp(join(tmpdir(),'briefing-service-synthetic-'));
  const {artifact}=await pipelineFixture(root);
  const cipher=join(root,'briefing.enc.json');
  await sealBriefingArtifact(artifact,fixturePassword,cipher,{executionMode:'fake_transport'});
  const raw=await readFile(cipher,'utf8');
  const status=await writeBriefingDeliveryStatus(artifact,Buffer.from(raw),join(root,'status.json'));
  const payload=JSON.parse(JSON.parse(nativeArchive().raw).payload_json);
  bundle={raw,status,payload:await encryptEnvelope(payload,fixturePassword)};
});

for(const scenario of ['radar_hangs','briefing_status_hangs','briefing_body_hangs','failed_previous','lock_during_pending']){
  test(`integrated unlock remains usable: ${scenario}`,async({page},info)=>{
    const errors=[],requests=[];let pending;
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.clock.install({time:new Date(cutoff)});
    await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:bundle.payload}));
    await page.route('**/data/radar-seasonality.enc.json',r=>r.fulfill({status:404}));
    await page.route('**/data/radar-observation.json',r=>{
      if(scenario==='radar_hangs')pending=r;else return r.fulfill({status:404});
    });
    await page.route('**/data/briefing-status.json',r=>{
      if(['briefing_status_hangs','lock_during_pending'].includes(scenario))pending=r;
      else return r.fulfill({json:{...bundle.status,status:scenario==='failed_previous'?'FAILED':'READY'}});
    });
    await page.route('**/data/briefing.enc.json',r=>{
      if(scenario==='briefing_body_hangs')pending=r;
      else return r.fulfill({body:bundle.raw,contentType:'application/json'});
    });
    await page.goto('/#/briefing');
    await expect(page.locator('input[type=date]')).toHaveCount(0);
    await page.locator('input[type=password]').fill(fixturePassword);
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('button',{name:'스크리너',exact:true})).toBeVisible();
    if(scenario==='lock_during_pending'){
      await expect.poll(()=>Boolean(pending)).toBe(true);
      await page.getByRole('button',{name:'잠그기',exact:true}).first().click();
      await pending.fulfill({json:bundle.status}).catch(()=>{});pending=null;
      await page.clock.fastForward(9000);
      await expect(page.locator('input[type=password]')).toHaveValue('');
      await expect(page.locator('.brief-clocks')).toHaveCount(0);
      expect(errors).toEqual([]);
      return;
    }
    if(scenario!=='failed_previous'){
      await expect.poll(()=>Boolean(pending)).toBe(true);
      await page.clock.fastForward(9000);
    }
    await expect(page.locator('.brief-clocks')).toBeVisible();
    await expect(page.locator('.brief-clocks')).toContainText('생성되지 않음');
    await expect(page.locator('.brief-card')).toHaveCount(0);
    await page.getByRole('button',{name:'공급망 역할 검토',exact:true}).click();
    await expect(page.locator('.brief-role')).toHaveCount(0);
    if(scenario==='failed_previous')await expect(page.locator('.brief-clocks')).toContainText('이전 브리핑 생성');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    // Capture-only QA label, never shipped or added to the product layout.
    await page.screenshot({path:info.outputPath('synthetic-service-hold.png'),fullPage:true,
      style:'html::before{content:"합성 QA 화면 · 실제 투자 자료 아님";display:block;padding:8px;background:#101916;color:#ffd000;font:12px sans-serif;text-align:center}'});
    await page.getByRole('button',{name:'스크리너',exact:true}).click();
    await expect(page.locator('.app-shell')).toBeVisible();
    await page.getByRole('button',{name:'잠그기',exact:true}).first().click();
    await expect(page.locator('input[type=password]')).toHaveValue('');
    await expect(page.locator('.brief-role')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(requests.some(url=>/api\.openai\.com|financialmodelingprep\.com/.test(url))).toBe(false);
    expect(errors).toEqual([]);
    if(pending)await pending.abort().catch(()=>{});
  });
}
