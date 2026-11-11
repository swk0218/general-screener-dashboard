import {test,expect} from '@playwright/test';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
const password='TEST_ONLY_BRIEFING';
const event={id:'contract-1',symbol:'TEST',published_at:'2026-11-06 10:00:00',publication_time:{basis:'fmp_publishedDate_timezone_unspecified',precision:'local_datetime_timezone_unknown',timezone:null,offset_enclosure_hours:24,earliest_utc:'2026-11-05T10:00:00Z',latest_utc:'2026-11-07T10:00:00Z'},source_url:'https://example.com/filing',quote:'TEST_ONLY disclosed contract',reason:'확정된 계약이 주요 사업에 기여합니다.'};
const payload=await encryptEnvelope({contract_version:'general_screener_v2',generated_at:'2026-11-07T10:01:00Z',benchmark:'QQQ',evidence_status:'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',runs:[{strategy:'TENX',run_id:'qa-1',report_created_at:'2026-11-07T10:01:00Z'}],recommendations:[{strategy:'TENX',run_id:'qa-1',symbol:'TEST',recommendation_rank:1,score:59,screening_price:100,current_price:101,current_price_as_of:'2026-11-06',risk_flags:'event_risk_status=available',quantitative_score:59,qualitative_adjustment:2,adjusted_score:61,ranking_basis:'quantitative_score',qualitative:{status:'evaluated',collection_scope:'fmp_stock_news_first_page',scope_label:'UNTRUSTED_SCOPE_LABEL',collection_summary:{raw_count:5,admitted_count:2,excluded_count:2,pagination_may_continue:true},q:2,event,data_as_of:'2026-11-07T10:00:00Z',analyzed_at:'2026-11-07T10:01:00Z'}}],performance:{aggregates:[],signals:[]}},password);
test('briefing detail, disclosure, navigation and lock preserve scores',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:payload}));
 for(const file of ['radar-observation.json','market-radar.enc.json','radar-seasonality.enc.json','radar-news.enc.json'])await page.route(`**/data/${file}*`,r=>r.fulfill({status:404}));
 await page.goto('/#/detail/TENX/qa-1/TEST');await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
 const panel=page.getByRole('region',{name:'TEST 정성 분석'});await expect(panel).toContainText('원점수 S');await expect(panel).toContainText('59');await expect(panel).toContainText('61');await expect(panel).toContainText('이번 순위는 원점수 기준');
 await expect(panel).toContainText('FMP 뉴스 첫 페이지 중 시점 조건을 충족한 후보 범위');await expect(panel).not.toContainText('UNTRUSTED_SCOPE_LABEL');
 await panel.getByText('근거·출처',{exact:true}).click();await expect(panel.locator('details')).toContainText('2026-11-06 10:00:00 · 시간대 미확인');await expect(panel.locator('details')).not.toContainText('KST');await expect(panel).toContainText('수집 5건 · 시점 조건 채택 2건 · 제외 2건 · 다음 페이지 후보가 더 있을 수 있음');await expect(panel.getByRole('link',{name:'원문'})).toHaveAttribute('href','https://example.com/filing');
 await panel.getByText('근거·출처',{exact:true}).click();await expect(panel.locator('details[open]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.screenshot({path:testInfo.outputPath('briefing-detail.png')});
 await page.evaluate(()=>location.hash='#/overview');await expect(page.locator('.overview-briefing')).toContainText('TEST');await expect(page.locator('.overview-briefing')).toContainText('FMP 뉴스 첫 페이지 중 시점 조건을 충족한 후보 범위');
 await page.goBack();await expect(panel).toBeVisible();
 await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();await expect(page.locator('input[type=password]')).toBeVisible();await expect(panel).toHaveCount(0);expect(errors).toEqual([]);
});

test('optional news failure is quiet and lock drops late sidecar responses',async({page})=>{
 test.skip(process.env.VITE_GPT_NEWS_ENABLED!=='true','Run with VITE_GPT_NEWS_ENABLED=true to test optional sidecar.');
 let release;const held=new Promise(resolve=>{release=resolve;});let requested=false;
 await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:payload}));
 for(const file of ['radar-observation.json','market-radar.enc.json','radar-seasonality.enc.json'])await page.route(`**/data/${file}*`,r=>r.fulfill({status:404}));
 await page.route('**/data/radar-news.enc.json*',async route=>{requested=true;await held;try{await route.fulfill({status:503});}catch{/* Aborted on lock. */}});
 await page.goto('/#/overview');await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
 await expect(page.locator('.overview-briefing')).toContainText('TEST');await expect.poll(()=>requested).toBe(true);
 await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();release();
 await expect(page.locator('input[type=password]')).toBeVisible();await expect(page.locator('.radar-news')).toHaveCount(0);
 await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
 await expect(page.locator('.radar-news')).toContainText('분석 불가');await expect(page.locator('.overview-briefing')).toContainText('TEST');
});


test('MLG AI-only evidence is visible without inventing a news event',async({page},testInfo)=>{
 const data={contract_version:'general_screener_v2',generated_at:'2026-11-07T10:01:00Z',benchmark:'QQQ',evidence_status:'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',runs:[{strategy:'MLG',run_id:'qa-ai',report_created_at:'2026-11-07T10:01:00Z'}],recommendations:[{strategy:'MLG',run_id:'qa-ai',symbol:'TESTAI',recommendation_rank:1,score:63,screening_price:100,current_price:101,current_price_as_of:'2026-11-06',qualitative:{status:'evaluated',legacy_a:0,adopted_a:3,legacy_e:.65,adopted_e:.65,score_delta:3,data_as_of:'2026-11-07T10:00:00Z',analyzed_at:'2026-11-07T10:01:00Z',events:[],ai_supply:'eligible',ai_evidence:{symbol:'TESTAI',source_url:'https://example.com/filing',published_at:'2026-11-06T10:00:00Z',role:'model_cloud'}}}],performance:{aggregates:[],signals:[]}};
 const encrypted=await encryptEnvelope(data,password);
 await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:encrypted}));
 for(const file of ['radar-observation.json','market-radar.enc.json','radar-seasonality.enc.json','radar-news.enc.json'])await page.route(`**/data/${file}*`,r=>r.fulfill({status:404}));
 await page.goto('/#/detail/MLG/qa-ai/TESTAI');await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
 const panel=page.getByRole('region',{name:'TESTAI 정성 분석'});
 await expect(panel).toContainText('모델·클라우드 공급');await expect(panel).toContainText('0 → 3');
 await panel.getByText('근거·출처',{exact:true}).click();
 await expect(panel.getByRole('link',{name:'사업 근거 원문'})).toHaveAttribute('href','https://example.com/filing');
 await expect(panel).not.toContainText('반영할 사건 없음');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.screenshot({path:testInfo.outputPath('mlg-ai-evidence.png')});
});


test('MLG limited positive and mixed assertions display the adopted score and excluded reasons',async({page},testInfo)=>{
 const excluded=(id,basis)=>({...event,id,scoring_basis:basis,scoring_excluded:true,scoring_exclusion_reason:basis+'_excluded',q:0,mlg_state:'neutral',model_q:1,model_mlg_state:'positive'});
 const q={status:'cached',legacy_a:3,adopted_a:3,legacy_e:.65,adopted_e:.8,score_delta:.9,
  data_as_of:'2026-11-07T10:00:00Z',analyzed_at:'2026-11-07T10:01:00Z',events:[
   excluded('analyst','analyst_view'),excluded('gift','donation'),
   {...event,id:'contract-fact',scoring_basis:'business_event',q:1,mlg_state:'positive'},
   {...event,id:'routine',reason:'TEST_ONLY 정기 납품을 완료했습니다.',scoring_basis:'business_event',q:0,mlg_state:'neutral',new_state:false}]};
 const data={contract_version:'general_screener_v2',generated_at:'2026-11-07T10:01:00Z',benchmark:'QQQ',evidence_status:'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',runs:[{strategy:'MLG',run_id:'qa-mixed',report_created_at:'2026-11-07T10:01:00Z'}],recommendations:[{strategy:'MLG',run_id:'qa-mixed',symbol:'TEST',recommendation_rank:1,score:63,screening_price:100,current_price:101,current_price_as_of:'2026-11-06',qualitative:q}],performance:{aggregates:[],signals:[]}};
 const before=JSON.stringify(data),encrypted=await encryptEnvelope(data,password),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/data/payload.enc.json*',r=>r.fulfill({json:encrypted}));
 for(const file of ['radar-observation.json','market-radar.enc.json','radar-seasonality.enc.json','radar-news.enc.json'])await page.route(`**/data/${file}*`,r=>r.fulfill({status:404}));
 await page.goto('/#/detail/MLG/qa-mixed/TEST');await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
 const panel=page.getByRole('region',{name:'TEST 정성 분석'});
 await expect(panel).toContainText('0.65 → 0.8');await expect(panel).toContainText('0.9');
 await expect(panel.getByText('긍정',{exact:true})).toBeVisible();await expect(panel.getByText('중립',{exact:true})).toBeVisible();
 await panel.getByText('점수 제외 2건 · 의견·기부·수치 중복',{exact:true}).click();
 await expect(panel.getByText('애널리스트 의견',{exact:true})).toBeVisible();await expect(panel.getByText('기부 자체',{exact:true})).toBeVisible();
 await expect(panel.getByText('점수 제외',{exact:true})).toHaveCount(2);
 await panel.locator('.briefing-stock-event').first().getByText('근거·출처',{exact:true}).click();
 await expect(panel.getByRole('link',{name:'원문',exact:true}).first()).toHaveAttribute('href','https://example.com/filing');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel.screenshot({path:testInfo.outputPath('mlg-mixed-TEST_ONLY.png')});
 expect(JSON.stringify(data)).toBe(before);expect(errors).toEqual([]);
 await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();await expect(panel).toHaveCount(0);
});
