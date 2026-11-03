import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {readBriefingArtifact} from '../../src/features/briefing/briefing-artifact.js';
import {decryptEnvelope} from '../../src/crypto/envelope.js';
import {insightView,roleLabel} from '../../src/features/briefing/briefing-model.js';
import {validateProbeDirectory} from '../../scripts/probe-preview-config.mjs';

const {root,manifest}=validateProbeDirectory(process.env.GPT_PROBE_DIR);
const expectedOrigin=process.env.PROBE_EXPECTED_ORIGIN||'openai_network';
if(manifest.response_origin!==expectedOrigin)throw Error('Actual-provider and offline pixel evidence cannot be mixed');
if(manifest.probe_status!=='complete')throw Error('Failed provider probe is not a successful quality or pixel gate');
const passphrase='synthetic-briefing-transport-only';
for(const name of ['normal','date_mismatch','quarantined','insufficient','conflict']) {
  test(`encrypted response pixels: ${name}`,async({page},info)=>{
    const id=`product-v1-${name}`,directory=join(root,'data/briefing-probe',id);
    const envelope=JSON.parse(await readFile(join(directory,'briefing.enc.json'),'utf8'));
    const raw=await decryptEnvelope(envelope,passphrase);
    // For real responses, use their actual completion clock; historical input clock stays unchanged.
    const clock=Date.parse(raw.briefing.generated_at||raw.created_at)+60000;
    const expected=await readBriefingArtifact(envelope,passphrase,{expectedExecutionMode:'provider_test',expectedSession:raw.source_binding.assessment_session,now:clock});
    await page.clock.install({time:new Date(clock)});
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.goto(`/?probe_case=${name}#/briefing`);
    await expect(page.getByLabel('격리된 제품 시험')).toContainText('과거 합성 엔진 자료');
    await expect(page.locator('input[type=date]')).toHaveCount(0);
    await page.locator('input[type=password]').fill(passphrase);
    await page.locator('button[type=submit]').click();
    await expect(page.locator('.brief-clocks')).toBeVisible();
    await expect(page.locator('.brief-card')).toHaveCount(expected.insights?.length||0);
    if(expected.status==='ready') {
      const receipt=manifest.receipts.find(r=>r.case_id===id);
      expect(receipt.response_hash).toBe(expected.provider_receipt.response_hash);
      expect(receipt.request_id).toBe(expected.provider_receipt.request_id);
      for(const insight of expected.insights)await expect(page.locator('.brief-main')).toContainText(insightView(insight,expected.computed.facts).fact);
      await page.locator('.brief-tabs button').nth(1).click();
      await expect(page.locator('.brief-role')).toHaveCount(expected.roles.length);
      for(const role of expected.roles)await expect(page.locator('.brief-role').filter({hasText:role.symbol})).toContainText(roleLabel(role.role));
      for(const company of expected.companies.filter(c=>c.sources.some(s=>s.kind==='TEST'))) {
        const card=page.locator('.brief-role').filter({hasText:company.symbol});
        await card.locator('details summary').click();
        for(const source of company.sources) await expect(card).toContainText(source.text);
        await expect(card.locator('a[href*="example.invalid"]')).toHaveCount(0);
        await expect(card).toContainText('실제 제공자 원문 아님');
      }
      if(expectedOrigin==='openai_network')await expect(page.getByLabel('격리된 제품 시험')).toContainText('실제 GPT 응답');
    }else await expect(page.getByLabel('격리된 제품 시험')).not.toContainText('실제 GPT 응답');
    expect(requests.some(url=>/\/data\/(payload.enc|market-radar.enc|radar-observation)/.test(url))).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    // Only an explicit review-artifact directory enables screenshots; never capture accounts.
    if(process.env.GPT_PROBE_SCREENSHOT_DIR) {
      await mkdir(process.env.GPT_PROBE_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:join(process.env.GPT_PROBE_SCREENSHOT_DIR,`${expectedOrigin}-${info.project.name}-${name}.png`),fullPage:true});
    }
    await page.getByRole('button',{name:'잠그기',exact:true}).click();
    await expect(page.locator('input[type=password]')).toHaveValue('');
    await expect(page.locator('.brief-clocks')).toHaveCount(0);
  });
}
