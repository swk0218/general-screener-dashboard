import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {roleDocumentsFixture} from '../fixtures/role-documents-v2.mjs';
import {fixturePassword,cutoff} from '../fixtures/briefing-native.mjs';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../../scripts/seal-briefing-artifact.mjs';
const available=Boolean(process.env.BRIEFING_TEST_PYTHON&&process.env.BRIEFING_TEST_BACKEND);
if(process.env.BRIEFING_REQUIRE_BACKEND==='true'&&!available)throw Error('Required private v2 writer environment missing');
for(const variant of ['reviewed','fragment','legacy','direct_profile']){
  test(`actual document writer -> encrypted reader -> existing card: ${variant}`,async({page})=>{
    test.skip(!available,'Private offline writer integration runs in its repository job');
    const directory=await mkdtemp(join(tmpdir(),'role-v2-browser-'));
    const {artifact,legacy}=await roleDocumentsFixture(directory,{fragment:variant==='fragment'});
    const used=variant==='legacy'?legacy:artifact;
    if(variant==='direct_profile')used.briefing.identity.prompt_version='direct-reviewed-document-candidates-v1';
    const file=join(directory,'briefing.enc.json');
    await sealBriefingArtifact(used,fixturePassword,file,{executionMode:'fake_transport'});
    const encrypted=await readFile(file,'utf8');
    const status=await writeBriefingDeliveryStatus(used,Buffer.from(encrypted),join(directory,'briefing-status.json'));
    const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    await page.clock.install({time:new Date(cutoff)});
    await page.route('**/data/briefing.enc.json',r=>r.fulfill({body:encrypted,contentType:'application/json'}));
    await page.route('**/data/briefing-status.json',r=>r.fulfill({json:status}));
    await page.goto('/?demo=briefing#/briefing');
    await page.getByLabel('확인할 자료 기준 거래일').fill('2026-10-30');
    await page.getByLabel('결과 암호').fill(fixturePassword);
    await page.getByRole('button',{name:'브리핑 열기',exact:true}).click();
    await page.getByRole('button',{name:'공급망 역할 검토',exact:true}).click();
    await expect(page.locator('.brief-role')).toHaveCount(5);
    const card=page.locator('.brief-role').first();
    if(variant==='direct_profile'){
      const criteria=page.locator('details.brief-evidence');
      await criteria.locator('summary').click();
      await expect(criteria.locator('dd').nth(1)).toHaveText(''+(await import('../../src/features/briefing/role-taxonomy-v2.json',{with:{type:'json'}})).default.labels_ko.semiconductor);
    }
    await expect(card).toContainText('현시점 확인: 미확인');await expect(card).toContainText('대조 보류');
    await expect(page.getByRole('button',{name:'기존 분류와 다른 기업',exact:true})).toBeDisabled();
    if(['reviewed','direct_profile'].includes(variant)){
      await expect(card.locator('h4')).toHaveText('전력·냉각');
      await expect(card).toContainText('문서상 제공 주장');
    }else{
      await expect(card.locator('h4')).toHaveText('확인되지 않음');
      await expect(card).not.toContainText('문서상 제공 주장');
      await expect(card).toContainText(variant==='fragment'?'문서 해석 보류':'시간축 분리 전 기록');
    }
    await card.locator('details summary').click();
    await expect(card).toContainText('공시일 2026-10-28');
    await expect(card).toContainText(variant==='legacy'?'보고기간 확인 불가':'보고기간 2026-06-30');
    await expect(card).not.toContainText('power_cooling');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(requests.some(url=>url.includes('api.openai.com'))).toBe(false);expect(errors).toEqual([]);
    await page.getByRole('button',{name:'결과 닫기',exact:true}).click();
    await expect(page.locator('.brief-role')).toHaveCount(0);
  });
}
