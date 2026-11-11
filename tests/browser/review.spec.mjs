import {test,expect} from '@playwright/test';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
import {reviewFixture,radarReplayFixture} from '../review-fixture.mjs';
const password='TEST_ONLY_REVIEW',payload=await encryptEnvelope(reviewFixture(),password);
test('private import explores stored sample and independent numeric run then clears on lock',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/review.html');
 await page.locator('input[type=file]').setInputFiles({name:'review.enc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await page.getByLabel('체험 암호',{exact:true}).fill('wrong');await page.getByRole('button',{name:'체험 열기',exact:true}).click();
 await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('체험 암호',{exact:true}).fill(password);await page.getByRole('button',{name:'체험 열기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'수치 결과와 정성 판단'})).toBeVisible();
 // Text must remain legible when the component Theme supplies its own defaults.
 for(const locator of [page.getByRole('heading',{name:'수치 결과와 정성 판단'}),page.locator('.review-content p').first()]){
  const contrast=await locator.evaluate(el=>{
   const luminance=css=>{const rgb=css.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
   const foreground=luminance(getComputedStyle(el).color),background=luminance(getComputedStyle(document.body).backgroundColor);
   return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
 }

 await page.getByRole('button',{name:'MLG',exact:true}).click();
 await page.getByText('이전 표본·과거 위험 기록',{exact:true}).click();
 const legacy=page.getByRole('region',{name:'MLG 과거 위험 관찰'});
 await expect(legacy).toContainText('과거 위험 관찰 1개 회사');
 await expect(legacy).toContainText('신규 GPT 평가가 허용된 회사는 0개');
 await expect(legacy.getByRole('row').nth(1)).toContainText('2026-11-02');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'TENX',exact:true}).click();
 await page.getByText('원본 수치 실행·이전 SEC 표본',{exact:true}).click();
 const sample=page.getByRole('article',{name:'TEST 저장 표본'});
 await expect(sample).toContainText('표본 Q +2');
 await expect(sample).toContainText('기준 실행 없음');
 const numeric=page.getByRole('region',{name:'실제 TENX 숫자 실행'});
 await expect(numeric).toContainText('미평가');await expect(numeric).toContainText('70');
 await numeric.getByLabel('종목 찾기').fill('TEST');await numeric.getByRole('button',{name:'TEST 상세',exact:true}).click();
 await expect(page.getByRole('region',{name:'TEST 수치 상세'})).toContainText('이번 전체 순위는 원점수 기준');
 await sample.getByText('SEC 원문·실제 전달 발췌',{exact:true}).click();
 await expect(sample.getByRole('link',{name:'SEC 원문 열기'})).toHaveAttribute('href','https://www.sec.gov/Archives/edgar/data/1/test.htm');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('review-tenx.png'),fullPage:true});
 await page.getByRole('button',{name:'RADAR',exact:true}).click();await expect(page.getByRole('region',{name:'시장 주요 뉴스'})).toContainText('분석 불가');
 await page.getByRole('button',{name:'체험 잠금',exact:true}).click();
 await expect(page.getByLabel('체험 암호',{exact:true})).toBeVisible();await expect(page.getByText('TEST_ONLY confirmed contract.')).toHaveCount(0);
 expect(errors).toEqual([]);
});


test('observed company panel explores stored Q and original evidence while keeping S unchanged',async({page})=>{
 const fixture=reviewFixture();
 fixture.observed_review={schema:'observed_company_preview_v1',data_as_of:'2026-11-09T10:00:00Z',
  production_adopted:false,numeric_run_id:'123',monthly_allocation_microusd:4000000,cases:[{
   strategy:'tenx',symbol:'TEST',company_name:'Test Company',production_adopted:false,
   semantic_rule_status:'cached',semantic_reason:null,quantitative_score:70,q:1,adjusted_score:71,
   events:[{quote:'TEST_ONLY confirmed contract.',reason:'TEST_ONLY 회사 사건을 확인했습니다.',
    published_at:'2026-11-08 10:00:00',occurred_at:'2026-11-08',mlg_state:'positive'}],
   sources:[{url:'https://example.com/ir',quote:'TEST_ONLY confirmed contract.',published_at:'2026-11-08 10:00:00',timezone_unknown:true}]}]};
 const encrypted=await encryptEnvelope(fixture,password);
 await page.goto('/review.html');
 await page.locator('input[type=file]').setInputFiles({name:'observed.enc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(encrypted))});
 await page.getByLabel('체험 암호',{exact:true}).fill(password);await page.getByRole('button',{name:'체험 열기',exact:true}).click();
 await page.getByRole('button',{name:'TENX',exact:true}).click();
 const panel=page.getByRole('region',{name:'TENX 실제 회사 후보 검토'});
 await panel.getByLabel('회사 검토 찾기').fill('TEST');
 await panel.getByRole('button',{name:'TEST 검토 상세'}).click();
 const detail=panel.getByRole('region',{name:'TEST 회사 검토 상세'});
 await expect(detail).toBeFocused();
 await expect(detail).toBeInViewport();
 await expect(panel).toContainText('TEST_ONLY 회사 사건을 확인했습니다.');
 expect(await panel.locator('.review-table-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await detail.getByRole('button',{name:'검토 닫기'}).click();
 await expect(panel.getByRole('button',{name:'TEST 검토 상세'})).toBeFocused();
 await panel.getByRole('button',{name:'TEST 검토 상세'}).click();
 await expect(panel).toContainText('원점수 S');await expect(panel).toContainText('71');
 await panel.getByText('실제 전달 원문 발췌 1',{exact:true}).click();
 await expect(panel).toContainText('시간대 미확인');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'체험 잠금',exact:true}).click();
 await expect(page.getByText('TEST_ONLY 회사 사건을 확인했습니다.')).toHaveCount(0);
});


test('Radar review displays original one and cached three separately at each width',async({page})=>{
 const encrypted=await encryptEnvelope(radarReplayFixture(),password);
 await page.goto('/review.html');
 await page.locator('input[type=file]').setInputFiles({name:'radar.enc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(encrypted))});
 await page.getByLabel('체험 암호',{exact:true}).fill(password);
 await page.getByRole('button',{name:'체험 열기',exact:true}).click();
 await page.getByRole('button',{name:'RADAR',exact:true}).click();
 const provenance=page.getByLabel('Radar 실행 구분');
 await expect(provenance).toContainText('최초 실제 실행 123 · 당시 채택 1건.');
 await expect(provenance).toContainText('저장 응답 재검증 3건');
 await expect(provenance).toContainText('새 실검색 결과가 아닙니다.');
 await expect(page.getByText('TEST_ONLY 뉴스 2',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'체험 잠금',exact:true}).click();
 await expect(page.getByLabel('Radar 실행 구분')).toHaveCount(0);
});


test('company review separates normalized exclusion from the earlier model proposal',async({page},testInfo)=>{
 const fixture=reviewFixture();
 fixture.observed_review={schema:'observed_company_preview_v1',data_as_of:'2026-11-09T10:00:00Z',production_adopted:false,numeric_run_id:'123',monthly_allocation_microusd:4400000,cases:[{
  strategy:'tenx',symbol:'TEST',company_name:'TEST_ONLY 검증 회사',production_adopted:false,semantic_rule_status:'cached',quantitative_score:70,q:0,adjusted_score:70,
  events:[{id:'gift',quote:'TEST_ONLY donation announcement.',reason:'TEST_ONLY 기부 발표 자체는 사업 가감점에서 제외합니다.',source_url:'https://example.com/gift',published_at:'2026-11-08 10:00:00',occurred_at:'2026-11-08',q:0,model_q:1,mlg_state:'neutral',model_mlg_state:'positive',scoring_basis:'donation',scoring_excluded:true,scoring_exclusion_reason:'donation_excluded'}],sources:[]}]};
 const encrypted=await encryptEnvelope(fixture,password),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/review.html');await page.locator('input[type=file]').setInputFiles({name:'TEST_ONLY.enc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(encrypted))});
 await page.getByLabel('체험 암호',{exact:true}).fill(password);await page.getByRole('button',{name:'체험 열기',exact:true}).click();
 await page.getByRole('button',{name:'TENX',exact:true}).click();
 const panel=page.getByRole('region',{name:'TENX 실제 회사 후보 검토'});
 await panel.getByLabel('회사 검토 찾기').fill('TEST');await panel.getByRole('button',{name:'TEST 검토 상세'}).click();
 const detail=panel.getByRole('region',{name:'TEST 회사 검토 상세'});
 await expect(detail).toBeFocused();await expect(detail.getByText('점수 제외',{exact:true})).toBeVisible();await expect(detail.getByText('기부 자체',{exact:true})).toBeVisible();
 await expect(detail.locator('.review-score-strip')).toContainText('70');await expect(detail.locator('.review-score-strip')).not.toContainText('+1');
 await expect(detail.getByText('채택 전 모델 제안 Q +1 · 실제 가감점과 별도',{exact:true})).not.toBeVisible();
 await detail.getByText('사건 원문·시점',{exact:true}).click();
 await expect(detail).toContainText('채택 전 모델 제안 Q +1 · 실제 가감점과 별도');
 await expect(detail.getByRole('link',{name:'사건 원문 열기'})).toHaveAttribute('href','https://example.com/gift');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await detail.screenshot({path:testInfo.outputPath('company-exclusion-TEST_ONLY.png')});
 await detail.getByRole('button',{name:'검토 닫기'}).click();await expect(panel.getByRole('button',{name:'TEST 검토 상세'})).toBeFocused();
 await page.getByRole('button',{name:'체험 잠금',exact:true}).click();await expect(panel).toHaveCount(0);expect(errors).toEqual([]);
});
