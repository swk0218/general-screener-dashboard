import {test,expect} from '@playwright/test';

const fixture=()=>({schema:'gpt_qualitative_review_v1',created_at:'2026-11-17T10:00:00Z',numeric_current:false,full_cohort_evaluation:false,
 receipt:{run_id:'123',source_sha:'a'.repeat(40),provider_calls:1,validation_summary:'PRIVATE_NOT_FOR_DISPLAY'},
 recommendation:{symbol:'TEST',strategy:'TENX',quantitative_score:70,ranking_basis:'quantitative_score',qualitative:{status:'unevaluated',q:null,reason:'provider_timeout'}}});
test('local actual-result reader needs no password, explains timeout, clears and rejects wrong files',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/qualitative-preview.html');
 await expect(page).toHaveTitle('GENERAL SCREENER · 정성 분석 검토');
 await expect(page.getByRole('heading',{name:'사건 판단과 근거를 확인하세요'})).toBeVisible();
 await expect(page.locator('input[type=password]')).toHaveCount(0);
 const upload=data=>page.getByLabel('정성 검토 JSON',{exact:true}).setInputFiles({name:'TEST_ONLY.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await upload(fixture());
 const panel=page.getByRole('region',{name:'TEST 실제 정성 검토'});
 await expect(panel).toContainText('원점수는 과거 수치 실행의 기록');
 await expect(panel).toContainText('응답 시간이 초과');await expect(panel).toContainText('사건 보정 Q');await expect(panel).toContainText('미평가');
 await expect(panel).not.toContainText('PRIVATE_NOT_FOR_DISPLAY');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('qualitative-timeout-TEST_ONLY.png'),fullPage:true});
 await page.getByRole('button',{name:'자료 닫기'}).click();await expect(panel).toHaveCount(0);
 const invalid=fixture();invalid.full_cohort_evaluation=true;await upload(invalid);
 await expect(page.getByRole('alert')).toContainText('검토 JSON 파일을 확인');await expect(panel).toHaveCount(0);
 const recovered=fixture();recovered.recommendation.qualitative.reason='provider_http_error';await upload(recovered);
 await expect(panel).toContainText('응답을 받지 못해');expect(errors).toEqual([]);
 const empty=fixture();Object.assign(empty.recommendation,{qualitative_adjustment:0,adjusted_score:70});
 Object.assign(empty.recommendation.qualitative,{status:'evaluated',q:0,event:null,data_as_of:'2026-11-17T09:00:00Z',analyzed_at:'2026-11-17T09:01:00Z',assessment_method:'verified_empty_candidate_set',model:'not_used',coverage:{scope:'fmp_stock_news_first_page',claim:'retrieved_candidate_set_only'}});
 empty.receipt.provider_calls=0;await upload(empty);
 await expect(panel).toContainText('확인한 FMP 뉴스 후보 없음');await expect(panel).toContainText('후보 확인 · 모델 미사용');
 await expect(panel).not.toContainText('실제 API 응답');await expect(panel).not.toContainText('악재 없음');
 await page.reload();await expect(panel).toHaveCount(0);
});
