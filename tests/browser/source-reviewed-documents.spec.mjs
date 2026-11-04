import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceReviewedFixture,sourceReviewBackendAvailable} from '../fixtures/source-reviewed-documents.mjs';
import {fixturePassword} from '../fixtures/briefing-native.mjs';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../../scripts/seal-briefing-artifact.mjs';
if(process.env.BRIEFING_REQUIRE_BACKEND==='true'&&!sourceReviewBackendAvailable)throw Error('Required private source writer missing');
for(const {fresh,afterReview} of [{fresh:true,afterReview:false},{fresh:false,afterReview:false},{fresh:true,afterReview:true}])test(`source-reviewed product, distinct clocks, repeated unlock and close; fresh=${fresh}; afterReview=${afterReview}`,async({page})=>{
  test.skip(!sourceReviewBackendAvailable,'Private offline source writer required');
  const directory=await mkdtemp(join(tmpdir(),'source-role-browser-'));
  const {artifact}=await sourceReviewedFixture(directory,{fresh,afterReview});
  const file=join(directory,'briefing.enc.json');
  await sealBriefingArtifact(artifact,fixturePassword,file,{executionMode:'fake_transport'});
  const encrypted=await readFile(file,'utf8');
  const status=await writeBriefingDeliveryStatus(artifact,Buffer.from(encrypted),join(directory,'status.json'));
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await page.clock.install({time:new Date(artifact.created_at)});
  await page.route('**/data/briefing.enc.json',route=>route.fulfill({body:encrypted,contentType:'application/json'}));
  await page.route('**/data/briefing-status.json',route=>route.fulfill({json:status}));
  await page.goto('/?demo=briefing#/briefing');
  for(let attempt=0;attempt<2;attempt++){
    await page.getByLabel('확인할 자료 기준 거래일').fill(artifact.briefing.session);
    await page.getByLabel('결과 암호').fill(fixturePassword);
    await page.getByRole('button',{name:'브리핑 열기',exact:true}).click();
    await page.getByRole('button',{name:'공급망 역할 검토',exact:true}).click();
    if(fresh){
      await expect(page.locator('.brief-role')).toHaveCount(6);
      await expect(page.getByRole('button',{name:'기존 분류와 다른 기업',exact:true})).toBeDisabled();
      for(const card of await page.locator('.brief-role').all()){
        const symbol=await card.locator('h3').innerText();
        const label=afterReview?({AMD:'컴퓨팅',MU:'반도체'}[symbol]||'확인되지 않음'):'확인되지 않음';
        await expect(card.locator('h4')).toHaveText(label);
        if(afterReview&&['AMD','MU'].includes(symbol))await expect(card).toContainText('문서상 제공 주장');
        await expect(card.locator('.brief-comparison')).toContainText('점수 반영없음');
        await expect(card).toContainText('현시점 확인: 미확인');
        await expect(card).toContainText('대조 보류');
        await card.locator('details summary').click();
        await expect(card).toContainText('검토한 발췌문 · 역할 확정 아님');
        await expect(card).toContainText('독립 AI 원문 검토 기록');
        await expect(card).toContainText(`문서 검토 시각 ${artifact.role_document_contract.assessed_at}`);
        await expect(card).toContainText('최초 공개 시각은 아닙니다');
        await expect(card).toContainText('전체 문서 검증 아님');
        if(afterReview&&['AMD','MU'].includes(symbol)){
          await expect(card).toContainText(symbol==='AMD'?'공시일 2026-02-04':'공시일 2025-10-03');
          await expect(card).toContainText('현재 사업의 지속 여부를 확인한 결과가 아닙니다');
        }
      }
      const csco=page.locator('.brief-role').filter({has:page.getByRole('heading',{name:'CSCO',exact:true})});
      await expect(csco).toContainText('공시일 확인 불가');
      if(afterReview)await expect(csco).toContainText('독립 검토 사이에 문서 역할 해석이 일치하지 않아 보류합니다.');
      await expect(csco).toContainText('보고기간 2024-07-27');
      await expect(csco).toContainText('보고기간이나 수집일을 공시일로 대신하지 않습니다');
      await expect(page.locator('.brief-clocks > div').last().locator('span')).toHaveText('2026-11-04 00:00 UTC');
    }else{
      await expect(page.locator('.brief-role')).toHaveCount(0);
      await expect(page.locator('.brief-clocks > div').last()).toContainText('생성되지 않음');
      await expect(page.locator('.brief-clocks > div').last()).toContainText('이전 브리핑 생성');
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'결과 닫기',exact:true}).click();
    await expect(page.locator('.brief-role')).toHaveCount(0);
  }
  expect(requests.some(url=>url.includes('api.openai.com'))).toBe(false);
  expect(errors).toEqual([]);
});
