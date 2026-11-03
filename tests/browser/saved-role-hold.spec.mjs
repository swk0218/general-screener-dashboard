import {test,expect} from '@playwright/test';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {execFileSync} from 'node:child_process';
import {nativeInput,fixturePassword} from '../fixtures/briefing-native.mjs';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../../scripts/seal-briefing-artifact.mjs';
import {readBriefingArtifact} from '../../src/features/briefing/briefing-artifact.js';
const python=process.env.BRIEFING_TEST_PYTHON,backend=process.env.BRIEFING_TEST_BACKEND;
const available=Boolean(python&&backend),clock='2026-11-03T16:30:00Z';
if(process.env.BRIEFING_REQUIRE_BACKEND==='true'&&!available)throw Error('Private writer required');
for(const variant of ['saved_wdc','reviewed_control']){
  test(`saved-enum/synthetic injection -> writer -> encrypted reader -> held card: ${variant}`,async({page})=>{
    test.skip(!available,'Explicit private offline writer required');
    const directory=await mkdtemp(join(tmpdir(),'saved-role-hold-'));
    const native=await nativeInput(),input=join(directory,'input.json'),output=join(directory,'artifact.json');
    await writeFile(input,JSON.stringify(native.data));
    execFileSync(python,['tests/fixtures/build_saved_role_hold.py','--input',input,'--output',output,'--case',variant],
      {cwd:backend,env:{...process.env,PYTHONPATH:['.','src'].join(delimiter)},stdio:'pipe'});
    const artifact=JSON.parse(await readFile(output,'utf8'));
    const row=artifact.role_document_contract.reviews[0];
    expect(artifact.briefing.engines).toEqual(native.data.engines);
    expect(row.current_verification.state).toBe('unverified');expect(row.score_effect).toBe(0);
    expect(row.review_status).toBe(variant==='reviewed_control'?'document_reviewed':'held');
    if(variant==='saved_wdc')expect(row.claim.role).toBe('semiconductor');
    const cipherFile=join(directory,'briefing.enc.json');
    await sealBriefingArtifact(artifact,fixturePassword,cipherFile,{executionMode:'fake_transport'});
    const encrypted=await readFile(cipherFile,'utf8');
    const read=await readBriefingArtifact(JSON.parse(encrypted),fixturePassword,{expectedSession:artifact.briefing.session,
      expectedExecutionMode:'fake_transport',now:Date.parse(clock)});
    expect(read._validated_role_documents[0].review_status).toBe(variant==='reviewed_control'?'document_reviewed':'held');
    const status=await writeBriefingDeliveryStatus(artifact,Buffer.from(encrypted),join(directory,'status.json'));
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.clock.install({time:new Date(clock)});
    await page.route('**/data/briefing.enc.json',r=>r.fulfill({body:encrypted,contentType:'application/json'}));
    await page.route('**/data/briefing-status.json',r=>r.fulfill({json:status}));
    await page.goto('/?demo=briefing#/briefing');
    await page.locator('input[type=date]').fill(artifact.briefing.session);
    await page.locator('input[type=password]').fill(fixturePassword);
    await page.locator('form button[type=submit]').click();
    await page.locator('.brief-tabs button').nth(1).click();
    const card=page.locator('.brief-role').first();
    await expect(card.locator('h3')).toHaveText(artifact.briefing.companies[0].symbol);
    await expect(card).toContainText('현시점 확인: 미확인');
    await expect(card).toContainText('대조 보류');
    await expect(card).toContainText('점수 반영');await expect(card).toContainText('없음');
    await expect(page.locator('.brief-filter button').nth(1)).toBeDisabled();
    if(variant==='reviewed_control'){
      await expect(card.locator('h4')).toHaveText('전력·냉각');
      await expect(card).toContainText('문서상 제공 주장');
    }else{
      await expect(card.locator('h4')).toHaveText('확인되지 않음');
      await expect(card).toContainText('문서 해석 보류');
      await expect(card).not.toContainText('문서상 제공 주장');
      await expect(card.locator('h4')).not.toHaveText('반도체');
    }
    await card.locator('details summary').click();
    await expect(card.locator('blockquote').first()).toHaveText(row.claim.evidence[0].quote);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(requests.some(url=>url.includes('api.openai.com'))).toBe(false);expect(errors).toEqual([]);
  });
}
