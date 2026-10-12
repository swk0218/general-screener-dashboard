import {test,expect} from '@playwright/test';
import {randomBytes,pbkdf2Sync,createCipheriv,createHash} from 'node:crypto';
import {encryptEnvelope} from '../../src/crypto/envelope.js';
import {dailyFixture} from '../fixtures/radar-packets.mjs';
import {unavailableEngineStatus} from '../../src/features/radar/observation-status.js';

const password='synthetic-browser-test-only';
const payload=await encryptEnvelope({contract_version:'general_screener_v2',generated_at:'2026-03-13T10:00:00Z',benchmark:'QQQ',
  evidence_status:'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',runs:[{strategy:'MLG',run_id:'qa-1',report_created_at:'2026-03-13T10:00:00Z'}],
  recommendations:[{strategy:'MLG',run_id:'qa-1',symbol:'TEST',recommendation_rank:1,score:88.79,screening_price:211.94,current_price:214.25,current_price_as_of:'2026-03-12',risk_flags:'event_risk_status=available'}],
  performance:{aggregates:[],signals:[]}},password);
function encryptRadar(packet) {
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,600000,32,'sha256'),iv);
  cipher.setAAD(Buffer.from('market_radar_v1'));
  const bytes=Buffer.concat([cipher.update(JSON.stringify(packet),'utf8'),cipher.final(),cipher.getAuthTag()]);
  return JSON.stringify({envelope_version:'market_radar_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
    salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:bytes.toString('base64'),payload_hash_kind:'ciphertext_sha256',
    payload_hash:createHash('sha256').update(bytes).digest('hex')});
}
const feed=encryptRadar(dailyFixture());

for(const scenario of ['explicit-stale','failed','status-missing']) {
  test(`summary/detail freshness ${scenario} preserves dated data and lock isolation`,async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));let feedReads=0;
    const status={...unavailableEngineStatus(),status:scenario==='failed'?'FAILED':scenario==='explicit-stale'?'STALE':'DATED',source_session:'2026-03-12',expected_session:'2026-03-12',
      input_admitted_at_utc:'2026-03-13T10:00:00Z',model_computed_at_utc:'2026-03-13T10:00:00Z',latest_attempt_at_utc:'2026-03-13T10:00:00Z',
      next_scheduled_at_utc:'2026-03-13T12:40:00Z',feed_cipher_sha256:createHash('sha256').update(feed).digest('hex'),engine_result_id:'a'.repeat(64),built_at_utc:'2026-03-13T10:03:00Z',published_at_utc:'2026-03-13T10:04:00Z',publication_receipt_result_id:'a'.repeat(64)};
    await page.clock.install({time:new Date('2026-03-13T12:00:00Z')});
    await page.route('**/data/payload.enc.json*',route=>route.fulfill({json:payload}));
    await page.route('**/data/radar-observation.json*',route=>route.fulfill(scenario==='status-missing'?{status:404}:{json:status}));
    await page.route('**/data/market-radar.enc.json*',route=>{feedReads++;return route.fulfill({body:feed,contentType:'application/json'});});
    await page.route('**/data/radar-seasonality.enc.json*',route=>route.fulfill({status:404}));
    await page.goto('/#/overview');
    await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
    const summary=page.locator('.overview-radar');await expect(summary).toBeVisible();
    await expect(summary.locator('.overview-radar-score strong')).toHaveText('—');
    await expect(summary.locator('.radar-headline')).toHaveText('—');
    await expect(summary.locator('time')).toHaveText('— Updated');
    await page.clock.setSystemTime(new Date('2026-03-13T14:40:01Z'));
    await page.clock.fastForward(60001);
    await expect(summary.locator('.radar-headline')).toHaveText('—');
    await expect(summary.locator('.overview-radar-score strong')).toHaveText('—');
    await expect(summary.locator('[role=status]')).toHaveCount(0);
    await expect(summary.locator('.lucide-triangle-alert')).toHaveCount(0);
    await expect(summary.locator('.lucide-bell-off')).toHaveCount(0);
    await summary.screenshot({path:testInfo.outputPath(`summary-${scenario}.png`)});
    await expect(summary.locator('.is-alert')).toHaveCount(0);
    await summary.getByText('지수 자세히',{exact:true}).click();
    const detail=page.locator('.radar-view');await expect(detail).toBeVisible();
    await expect(detail.locator('.radar-headline')).toHaveText('—');
    await expect(detail.locator('.radar-dial-needle,.radar-headline.is-normal,.lucide-bell-off')).toHaveCount(0);
    await expect(detail.locator('.radar-gauge [role=status]')).toHaveCount(0);
    await expect(detail.locator('.radar-updated time')).toHaveText('— Updated');
    await expect(detail.locator('.lucide-triangle-alert')).toHaveCount(0);
    await expect(detail.locator('.radar-card-value strong')).toHaveText(Array(8).fill('—'));
    await expect(detail).not.toContainText(/갱신 지연|미확보|미계산|일일 갱신|보류|S&P500/);
    await expect(detail.locator('[role=alert]')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await detail.screenshot({path:testInfo.outputPath(`radar-${scenario}.png`)});
    await detail.getByText('기준일 결과',{exact:true}).click();
    await expect(detail.locator('details[open]')).toContainText('원점수 / q90');
    await expect(detail.locator('details[open]')).toContainText('2026-03-12 · 50 /100');
    await detail.locator('details[open]').screenshot({path:testInfo.outputPath(`retained-${scenario}.png`)});
    await detail.getByText('기준일 결과',{exact:true}).click();
    await expect(detail.locator('details[open]')).toHaveCount(0);
    await detail.getByText('기준일 지표·출처',{exact:true}).click();
    await expect(detail.locator('details[open]')).toContainText('TEST_ONLY');
    await expect(detail.locator('details[open]')).toContainText('표시 전 값 16 연율 %');
    await expect(detail.locator('details[open]')).toContainText('수신 03. 13. 19:00 KST');
    await expect(detail.locator('.radar-result-clocks dt')).toHaveText(['입력 등록','모델 계산','화면 빌드','최초 게시']);
    await expect(detail.locator('.radar-result-clocks time')).toHaveCount(scenario==='status-missing'?2:4);
    if(scenario!=='status-missing')await expect(detail.locator('.radar-result-clocks time').last()).toHaveAttribute('datetime','2026-03-13T10:04:00Z');
    await detail.locator('details[open]').screenshot({path:testInfo.outputPath(`provenance-${scenario}.png`)});
    await detail.getByText('기준일 지표·출처',{exact:true}).click();
    const readsBefore=feedReads;
    await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
    await expect(detail.locator('.radar-headline')).toHaveText('—');
    await expect(detail.locator('.radar-dial-needle,.radar-headline.is-normal,.lucide-bell-off')).toHaveCount(0);
    expect(feedReads).toBe(readsBefore);
    await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();
    await expect(page.locator('input[type=password]')).toBeVisible();await expect(detail).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for(const scenario of ['bottom','top','both','mixed','score-only','invalid']) {
  test(`concise Radar preserves ${scenario} data, event semantics and responsive layout`,async({page},testInfo)=>{
    const packet=dailyFixture(scenario==='bottom'||scenario==='both',scenario==='top'||scenario==='both',scenario==='mixed');
    if(scenario==='invalid')packet.gauge.score=NaN;
    if(scenario==='score-only') {
      Object.assign(packet,{operating_status:'OBSERVATION_COMPUTED',observation_only:true,controller_evaluated:false,active:{bottom:null,top:null}});
      packet.observation.policy='SCORE_ONLY_NO_OPERATIONAL_ALERT';
      Object.assign(packet.verification,{schema:'dated_observation_math_v1',controller_evaluated:false});
      for(const metadata of Object.values(packet.input_metadata))metadata.status='DATED_OBSERVATION_NOT_ALERT';
      for(const detail of Object.values(packet.native_details))detail.vetoed=null;
    }
    const body=encryptRadar(packet);
    const status={...unavailableEngineStatus(),status:'DATED',source_session:packet.session,expected_session:packet.session,
      input_admitted_at_utc:'2026-03-13T10:00:00Z',model_computed_at_utc:'2026-03-13T10:00:00Z',latest_attempt_at_utc:'2026-03-13T10:00:00Z',
      next_scheduled_at_utc:'2026-03-13T12:40:00Z',feed_cipher_sha256:createHash('sha256').update(body).digest('hex'),engine_result_id:'a'.repeat(64)};
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.clock.install({time:new Date('2026-03-13T12:00:00Z')});
    await page.route('**/data/payload.enc.json*',route=>route.fulfill({json:payload}));
    await page.route('**/data/radar-observation.json*',route=>route.fulfill({json:status}));
    await page.route('**/data/market-radar.enc.json*',route=>route.fulfill({body,contentType:'application/json'}));
    await page.route('**/data/radar-seasonality.enc.json*',route=>route.fulfill({status:404}));
    await page.goto('/#/overview');
    await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
    const summary=page.locator('.overview-radar');await expect(summary).toBeVisible();
    const score=scenario==='invalid'||scenario==='both'?'—':String(packet.gauge.score);
    await expect(summary.locator('.overview-radar-score strong')).toHaveText(score);
    const issued=['bottom','top','both'].includes(scenario);
    await expect(summary.locator('.radar-event-label .lucide-triangle-alert')).toHaveCount(issued?1:0);
    if(scenario==='score-only'||scenario==='invalid')await expect(summary.locator('.radar-event-label')).toHaveCount(0);
    if(scenario!=='invalid')await expect(summary.locator('time')).toHaveText('— Updated');
    await summary.getByText('지수 자세히',{exact:true}).click();
    const detail=page.locator('.radar-view');await expect(detail).toBeVisible();
    await expect(detail.locator('.radar-dial-number')).toHaveText(`${score}/100`);
    await expect(detail.locator('[role=alert]')).toHaveCount(scenario==='both'?2:issued?1:0);
    if(scenario==='score-only')await expect(detail.locator('.radar-headline')).toHaveText('점수 전용');
    if(scenario==='score-only'||scenario==='invalid') {
      await expect(detail.locator('.radar-alert-outcome strong')).toHaveText(['—','—']);
      await expect(detail.locator('.lucide-bell-off,.lucide-triangle-alert')).toHaveCount(0);
      await expect(detail).not.toContainText('경보 없음');
    }
    if(scenario==='both'||scenario==='invalid')await expect(detail.locator('.radar-dial-needle')).toHaveCount(0);
    if(scenario==='mixed')await expect(detail.locator('.radar-mixed')).toHaveText('양방향 조건 강함');
    await expect(detail).not.toContainText(/갱신 지연|미확보|미계산|보류|S&P500/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`radar-${scenario}-viewport.png`)});
    await detail.screenshot({path:testInfo.outputPath(`radar-${scenario}-full.png`)});
    if(issued||scenario==='mixed') {
      await page.clock.setSystemTime(new Date('2026-03-13T14:40:01Z'));await page.clock.fastForward(60001);
      await expect(detail.locator('.radar-dial-number')).toHaveText(`${score}/100`);
      await expect(detail.locator('[role=alert]')).toHaveCount(scenario==='both'?2:issued?1:0);
      if(scenario==='mixed')await expect(detail.locator('.radar-mixed')).toHaveText('양방향 조건 강함');
      await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
      await expect(detail.locator('.radar-dial-number')).toHaveText(`${score}/100`);
      await expect(detail.locator('.radar-updated time')).toHaveText('— Updated');
    }
    expect(errors).toEqual([]);
  });
}

for(const scenario of ['retained-failure','awaiting-inputs','awaiting-inputs-receipt','deployment-race','persistent-mismatch','retry-legacy','retry-status-unavailable']) {
  test(`Radar ${scenario} keeps verified dated values and rejects unbound data`,async({page})=>{
    const downgrade=scenario.startsWith('retry-');
    const packet=dailyFixture(scenario==='retained-failure'||scenario.startsWith('awaiting-inputs')||downgrade,false);
    if(scenario==='retained-failure') {
      packet.gauge.data_status='DATED_STALE_OBSERVATION';
      Object.assign(packet.observation,{expected_session:'2026-03-13',latest_session_input_missing:[],collection_status:'FAILED_RETAINED_DATED',failure_code:'SOURCE_FETCH_FAILED',last_attempt_at_utc:'2026-03-13T10:05:00Z'});
    }
    const body=encryptRadar(packet);let statusReads=0,feedReads=0;
    const status={...unavailableEngineStatus(),status:scenario==='retained-failure'?'FAILED':scenario.startsWith('awaiting-inputs')?'STALE':'DATED',source_session:packet.session,expected_session:['retained-failure','awaiting-inputs','awaiting-inputs-receipt'].includes(scenario)?'2026-03-13':packet.session,
      input_admitted_at_utc:'2026-03-13T10:00:00Z',model_computed_at_utc:'2026-03-13T10:01:00Z',latest_attempt_at_utc:'2026-03-13T10:05:00Z',
      next_scheduled_at_utc:'2026-03-13T12:40:00Z',feed_cipher_sha256:createHash('sha256').update(body).digest('hex'),engine_result_id:'a'.repeat(64),failure_code:scenario==='retained-failure'?'SOURCE_FETCH_FAILED':null};
    if(scenario==='awaiting-inputs-receipt')status.last_successful_refresh={completed_at_utc:'2026-03-13T10:04:00Z',engine_result_id:'c'.repeat(64),feed_cipher_sha256:status.feed_cipher_sha256,outcome:'PUBLISHED'};
    await page.clock.install({time:new Date('2026-03-13T16:00:00Z')});
    await page.route('**/data/payload.enc.json*',route=>route.fulfill({json:payload}));
    await page.route('**/data/radar-observation.json*',route=>{
      statusReads++;
      if(downgrade&&statusReads>1){
        if(scenario==='retry-status-unavailable')return route.fulfill({status:503});
        return route.fulfill({json:{schema_version:'radar_observation_status_v1',mode:'OBSERVATION_BETA',decision:'NO_SIGNAL',evidence_ready:false,model_score:null,
          events:{bottom:false,top:false},status:'OBSERVED_NO_SIGNAL',model_policy:'close90_v1_unchanged',collection_policy:'next_open_observation_only',historical_first_seen_claimed:false,
          market_close_utc:'2026-03-12T20:00:00Z',next_open_utc:'2026-03-16T13:30:00Z',computed_at_utc:'2026-03-13T10:00:00Z',next_scheduled_at_utc:'2026-03-16T10:17:00Z',
          source_market_close_utc:'2026-03-12T20:00:00Z',provider_updated_at_utc:null,first_seen_at_utc:'2026-03-13T10:00:00Z',received_at_utc:'2026-03-13T10:00:00Z',built_at_utc:null,published_at_utc:null,source_session:packet.session,score_delivery_available:true}});
      }
      return route.fulfill({json:{...status,feed_cipher_sha256:scenario==='persistent-mismatch'||(scenario==='deployment-race'||downgrade)&&statusReads===1?'b'.repeat(64):status.feed_cipher_sha256}});
    });
    await page.route('**/data/market-radar.enc.json*',route=>{feedReads++;return route.fulfill({body,contentType:'application/json'});});
    await page.route('**/data/radar-seasonality.enc.json*',route=>route.fulfill({status:404}));
    await page.goto('/#/overview');await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
    const summary=page.locator('.overview-radar');
    const score=scenario==='persistent-mismatch'||downgrade?'—':String(packet.gauge.score);
    await expect(summary.locator('.overview-radar-score strong')).toHaveText(score);
    await expect.poll(()=>feedReads).toBe(['retained-failure','awaiting-inputs','awaiting-inputs-receipt'].includes(scenario)||downgrade?1:2);
    expect(statusReads).toBe(downgrade?2:feedReads);
    if(scenario!=='persistent-mismatch')await expect(summary.locator('time')).toHaveText(scenario==='awaiting-inputs-receipt'?'03.13 Updated':'— Updated');
    await summary.getByText('지수 자세히',{exact:true}).click();
    const detail=page.locator('.radar-view');await expect(detail.locator('.radar-dial-number')).toHaveText(`${score}/100`);
    if(downgrade){
      await expect(summary.locator('.radar-event-label')).toHaveCount(0);
      await expect(detail.locator('[role=alert],.radar-event-label,.radar-threshold-track')).toHaveCount(0);
    }
    if(['retained-failure','awaiting-inputs','awaiting-inputs-receipt'].includes(scenario)) {
      await expect(detail.locator('.radar-headline')).toHaveText('—');
      await expect(detail.locator('[role=alert],.radar-event-label,.radar-threshold-track')).toHaveCount(0);
      await expect(detail.locator('.radar-alert-outcome strong')).toHaveText(['—','—']);
      await expect(detail.locator('.radar-card-value strong')).not.toHaveText(Array(8).fill('—'));
      await detail.getByText('기준일 결과',{exact:true}).click();
      await expect(detail.locator('details[open]')).not.toContainText('유지 중');
    }
    await page.locator('button[aria-label="스크리너 잠금"]:visible').first().click();
    await expect(page.locator('input[type=password]')).toBeVisible();await expect(detail).toHaveCount(0);
  });
}

for(const updateCase of ['refresh','legacy','invalid-binding']) test(`Radar KST update ${updateCase} in both entries survives UI rebuilds`,async({page})=>{
  const status={...unavailableEngineStatus(),status:'DATED',source_session:'2026-03-12',expected_session:'2026-03-12',
    input_admitted_at_utc:'2026-03-13T10:00:00Z',model_computed_at_utc:'2026-03-13T10:01:00Z',latest_attempt_at_utc:'2026-03-13T10:02:00Z',
    next_scheduled_at_utc:'2026-03-13T12:40:00Z',feed_cipher_sha256:createHash('sha256').update(feed).digest('hex'),engine_result_id:'a'.repeat(64),
    built_at_utc:'2026-03-15T10:00:00Z',published_at_utc:'2026-10-10T15:57:02Z',publication_receipt_result_id:'a'.repeat(64),publication_deployment_id:123};
  if(updateCase!=='legacy')status.last_successful_refresh={completed_at_utc:'2026-10-12T15:00:00Z',engine_result_id:updateCase==='invalid-binding'?'b'.repeat(64):status.engine_result_id,feed_cipher_sha256:status.feed_cipher_sha256,outcome:'SKIPPED_COMPLETE_SESSION'};
  const expectedDate=updateCase==='refresh'?'2026-10-13':'2026-10-11';
  const expectedText=updateCase==='invalid-binding'?'— Updated':`${expectedDate.slice(5).replace('-','.')} Updated`;
  await page.clock.install({time:new Date('2026-10-13T10:00:00Z')});
  await page.route('**/data/payload.enc.json*',route=>route.fulfill({json:payload}));
  await page.route('**/data/radar-observation.json*',route=>route.fulfill({json:status}));
  await page.route('**/data/market-radar.enc.json*',route=>route.fulfill({body:feed,contentType:'application/json'}));
  await page.route('**/data/radar-seasonality.enc.json*',route=>route.fulfill({status:404}));
  await page.goto('/#/overview');
  await page.locator('input[type=password]').fill(password);await page.locator('button[type=submit]').click();
  const summary=page.locator('.overview-radar');
  await expect(summary.locator('time')).toHaveText(expectedText);
  if(updateCase!=='invalid-binding')await expect(summary.locator('time')).toHaveAttribute('datetime',expectedDate);
  await summary.getByText('지수 자세히',{exact:true}).click();
  await expect(page.locator('.radar-updated time')).toHaveText(expectedText);
  if(updateCase!=='invalid-binding'){
    await page.locator('.radar-view').getByText('신호 상세',{exact:true}).click();
    await expect(page.locator('details[open]')).toContainText('2026-03-12 · 50 /100');
  }
});
