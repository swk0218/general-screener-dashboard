import test from 'node:test';
import assert from 'node:assert/strict';
import {stockBriefing,radarBriefing,safeSourceUrl} from '../src/features/qualitative/briefing-model.js';
const cutoff='2026-11-07T10:00:00Z', analyzed='2026-11-07T10:01:00Z';
const event={id:'contract-1',symbol:'TEST',published_at:'2026-11-06T10:00:00Z',source_url:'https://example.com/filing',quote:'TEST_ONLY contract confirmation',reason:'TEST_ONLY limited contract confirmed'};
const tenx=()=>({symbol:'TEST',strategy:'TENX',quantitative_score:59,qualitative_adjustment:2,adjusted_score:61,ranking_basis:'quantitative_score',qualitative:{status:'evaluated',q:2,event:structuredClone(event),data_as_of:cutoff,analyzed_at:analyzed}});
const radar=()=>({schema_version:'radar_news_v1',policy_version:'gs-gpt-02-radar-v1',affects_beta:false,status:'ready',run_id:'TEST_ONLY',cutoff_at:cutoff,analyzed_at:analyzed,events:[{event_id:'policy-1',headline:'TEST_ONLY policy decision',summary:'Decision announced',why_it_matters:'Changes rates',published_at:event.published_at,sources:[{url:event.source_url,publisher:'TEST_ONLY official',excerpt:'TEST_ONLY',published_at:event.published_at}]}]});
test('absent enrichment preserves current UI; disabled and failure are not normal zero',()=>{
 assert.equal(stockBriefing({}),null);assert.equal(radarBriefing(null),null);
 for(const status of ['disabled','fallback','unevaluated','unavailable','uncertain','stale'])assert.equal(stockBriefing({qualitative:{status}}).label.includes('완료'),false);
 assert.deepEqual(stockBriefing({qualitative:{status:'unevaluated'}}).scores,[]);
});
test('TENX displays S Q T independently without reordering, clamps validated',()=>{
 const row=tenx(),copy=structuredClone(row),model=stockBriefing(row);
 assert.deepEqual(model.scores,[['원점수 S',59],['사건 보정 Q',2],['보정 점수 T',61]]);
 assert.match(model.rankingCopy,/원점수 기준/);assert.deepEqual(row,copy);
 row.qualitative_adjustment=4;assert.equal(stockBriefing(row).status,'invalid');
 const capped=tenx();capped.quantitative_score=99;capped.adjusted_score=100;assert.equal(stockBriefing(capped).status,'evaluated');
});
test('missing event, issuer mismatch, future evidence and bad math never appear evaluated',()=>{
 for(const mutate of [r=>r.qualitative.event=null,r=>r.qualitative.event={...event,symbol:'OTHER'},r=>r.qualitative.event={...event,published_at:'2026-11-08T00:00:00Z'},r=>r.adjusted_score=62,r=>r.qualitative.event={...event,source_url:'javascript:alert(1)'}]){const row=tenx();mutate(row);assert.equal(stockBriefing(row).status,'invalid');}
 const zero=tenx();zero.qualitative.q=0;zero.qualitative.event=null;zero.qualitative_adjustment=0;zero.adjusted_score=59;assert.equal(stockBriefing(zero).summary,'평가된 후보에서 반영할 사건 없음');
});
test('MLG validates existing E/A and declared delta, never adds legacy judgment twice',()=>{
 const row={symbol:'TEST',strategy:'MLG',qualitative:{status:'evaluated',legacy_a:3,adopted_a:3,legacy_e:.82,adopted_e:.15,score_delta:-4.02,data_as_of:cutoff,analyzed_at:analyzed,events:[event]}};
 assert.equal(stockBriefing(row).scores[2][1],-4.02);row.qualitative.score_delta=0;assert.equal(stockBriefing(row).status,'invalid');
});
test('Radar is separate, up to three unique events and stale clock does not imply current',()=>{
 const packet=radar(),copy=structuredClone(packet);assert.equal(radarBriefing(packet,Date.parse(analyzed)).status,'ready');assert.deepEqual(packet,copy);
 assert.equal(radarBriefing(packet,Date.parse('2026-11-09T00:00:00Z')).status,'stale');
 packet.events.push(packet.events[0]);assert.equal(radarBriefing(packet).status,'invalid');
 packet.events=[];assert.equal(radarBriefing(packet,Date.parse(analyzed)).status,'ready');
 packet.status='unavailable';assert.equal(radarBriefing(packet).status,'unavailable');
});
test('Radar future evidence, changed Beta promise and cached freshness are checked',()=>{
 let packet=radar();packet.affects_beta=true;assert.equal(radarBriefing(packet).status,'invalid');
 packet=radar();packet.events[0].sources[0].published_at='2026-11-08T10:00:00Z';assert.equal(radarBriefing(packet).status,'invalid');
 packet=radar();packet.status='cached';assert.equal(radarBriefing(packet).status,'invalid');
 packet.cached_cutoff_at='2026-11-05T10:00:00Z';packet.cached_analyzed_at='2026-11-05T10:01:00Z';assert.equal(radarBriefing(packet,Date.parse(analyzed)).status,'stale');
});
test('external links reject credentials, whitespace and non-HTTPS schemes',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hi','//example.com','http://example.com','https://user:pass@example.com','https://example.com/\nfoo'])assert.equal(safeSourceUrl(value),null);
 assert.equal(safeSourceUrl('https://example.com/filing'),'https://example.com/filing');
});
test('malformed news entries and future publication clocks isolate failure',()=>{
 for(const mutate of [v=>v.events=[null],v=>v.events[0].sources=[null],v=>v.cutoff_at='2030-01-01T00:00:00Z',v=>v.analyzed_at='2030-01-01T00:00:00Z']){const value=radar();mutate(value);assert.equal(radarBriefing(value,Date.parse(analyzed)).status,'invalid');}
});
test('verified empty FMP candidates retain limited coverage and no-model claim',()=>{
 const row=tenx();row.qualitative_adjustment=0;row.adjusted_score=59;
 Object.assign(row.qualitative,{q:0,event:null,assessment_method:'verified_empty_candidate_set',reason:'확인한 FMP 뉴스 후보 없음',model:'not_used',coverage:{scope:'fmp_stock_news_first_page',claim:'retrieved_candidate_set_only'}});
 const result=stockBriefing(row);
 assert.equal(result.label,'후보 확인 · 모델 미사용');
 assert.equal(result.summary,'확인한 FMP 뉴스 후보 없음 · FMP 뉴스 첫 페이지에서 수집된 후보 범위에 한정합니다.');
 assert.doesNotMatch(result.summary,/악재 없음|유효 사건 없음/);
 for(const mutate of [v=>v.qualitative.coverage.claim='all_news',v=>v.qualitative.model='gpt',v=>v.qualitative.event=event]){
  const invalid=structuredClone(row);mutate(invalid);assert.equal(stockBriefing(invalid).status,'invalid');
 }
});

test('collection scope uses only fixed enum copy for evaluated cached and unevaluated',()=>{
 const labels={fmp_stock_news_first_page:'FMP 뉴스 첫 페이지 중 시점 조건을 충족한 후보 범위',unverified_candidate_set:'선택 근거 범위 · 전체 사건 수집 미확인'};
 for(const status of ['evaluated','cached','unevaluated'])for(const [scope,label] of Object.entries(labels)){
  const row=tenx();Object.assign(row.qualitative,{status,collection_scope:scope,scope_label:'UNTRUSTED RAW RECEIPT'});
  const before=structuredClone(row),model=stockBriefing(row);assert.equal(model.scopeCopy,label);assert.deepEqual(row,before);assert.doesNotMatch(JSON.stringify(model),/UNTRUSTED RAW RECEIPT/);
 }
 for(const scope of [undefined,null,'all_company_events','__proto__','toString']){
  const row=tenx();Object.assign(row.qualitative,{collection_scope:scope,scope_label:'UNTRUSTED'});assert.equal(stockBriefing(row).scopeCopy,undefined);assert.equal(stockBriefing(row).status,'evaluated');
 }
 const row=tenx();row.qualitative.status='disabled';row.qualitative.collection_scope='fmp_stock_news_first_page';assert.equal(stockBriefing(row).scopeCopy,undefined);
});


test('MLG business evidence is independent of event news and never changes scores',()=>{
 const row={symbol:'TEST',strategy:'MLG',qualitative:{status:'evaluated',legacy_a:0,adopted_a:3,legacy_e:.65,adopted_e:.65,score_delta:3,data_as_of:cutoff,analyzed_at:analyzed,events:[],ai_supply:'eligible',ai_evidence:{symbol:'TEST',source_url:event.source_url,published_at:event.published_at,role:'model_cloud',quote:'MUST NOT DISPLAY'}}};
 const before=structuredClone(row),view=stockBriefing(row);
 assert.equal(view.aiEvidence.summary,'AI 사업 판단 · 모델·클라우드 공급');
 assert.equal(view.aiEvidence.sources[0].url,event.source_url);
 assert.equal(view.summary,view.aiEvidence.summary);assert.deepEqual(view.events,[]);
 assert.deepEqual(row,before);assert.doesNotMatch(JSON.stringify(view),/MUST NOT DISPLAY/);
 for(const mutate of [v=>v.qualitative.ai_evidence.symbol='OTHER',v=>v.qualitative.ai_evidence.published_at='2026-11-08T00:00:00Z',v=>v.qualitative.ai_evidence.source_url='javascript:bad',v=>v.qualitative.ai_evidence.role='__proto__',v=>v.qualitative.ai_supply='unknown']){
  const bad=structuredClone(row);mutate(bad);assert.equal(stockBriefing(bad).status,'invalid');
 }
 const removed=structuredClone(row);Object.assign(removed.qualitative,{legacy_a:3,adopted_a:0,score_delta:-3,ai_supply:'ineligible'});removed.qualitative.ai_evidence.role=null;
 assert.match(stockBriefing(removed).aiEvidence.summary,/공급 가점 제외/);
 delete row.qualitative.ai_evidence;assert.equal(stockBriefing(row).status,'evaluated');
});

test('unknown source timezone preserves raw clock and validates the full conservative interval',()=>{
 const raw='2026-11-06 10:00:00';
 const metadata={basis:'fmp_publishedDate_timezone_unspecified',precision:'local_datetime_timezone_unknown',timezone:null,offset_enclosure_hours:24,earliest_utc:'2026-11-05T10:00:00+00:00',latest_utc:'2026-11-07T10:00:00+00:00'};
 const row=tenx();Object.assign(row.qualitative.event,{published_at:raw,publication_time:metadata});
 const before=structuredClone(row),view=stockBriefing(row);
 assert.equal(view.status,'evaluated');assert.equal(view.events[0].publishedAt,raw);assert.equal(view.events[0].publicationTimeUnknown,true);assert.deepEqual(row,before);
 for(const mutate of [r=>delete r.qualitative.event.publication_time,r=>r.qualitative.event.publication_time.timezone='UTC',r=>r.qualitative.event.publication_time.latest_utc='2026-11-07T10:00:01Z',r=>r.qualitative.event.published_at='2026-02-30 10:00:00',r=>r.qualitative.data_as_of='2026-11-07T09:59:59Z']){
  const bad=structuredClone(row);mutate(bad);assert.equal(stockBriefing(bad).status,'invalid');
 }
 const mlg={symbol:'TEST',strategy:'MLG',qualitative:{status:'evaluated',legacy_a:0,adopted_a:3,legacy_e:.65,adopted_e:.65,score_delta:3,data_as_of:cutoff,analyzed_at:analyzed,events:[],ai_supply:'eligible',ai_evidence:{symbol:'TEST',source_url:event.source_url,published_at:raw,publication_time:metadata,role:'model_cloud'}}};
 assert.equal(stockBriefing(mlg).aiEvidence.publicationTimeUnknown,true);
});
test('collection counts and page warning are validated and do not echo arbitrary labels',()=>{
 const row=tenx();Object.assign(row.qualitative,{collection_scope:'fmp_stock_news_first_page',collection_summary:{raw_count:5,admitted_count:2,excluded_count:2,pagination_may_continue:true,scope_label:'UNTRUSTED'}});
 assert.equal(stockBriefing(row).collectionCopy,'수집 5건 · 시점 조건 채택 2건 · 제외 2건 · 다음 페이지 후보가 더 있을 수 있음');
 for(const bad of [{raw_count:-1},{admitted_count:8},{excluded_count:1.5},{pagination_may_continue:'true'}]){const other=structuredClone(row);Object.assign(other.qualitative.collection_summary,bad);assert.equal(stockBriefing(other).collectionCopy,null);}
});

test('uncertain excluded news remains visible and unevaluated Q never becomes zero',()=>{
 const row={symbol:'TEST',strategy:'TENX',quantitative_score:70,ranking_basis:'quantitative_score',qualitative:{status:'unevaluated',reason:'incomplete_collection',collection_scope:'fmp_stock_news_first_page',collection_summary:{raw_count:2,admitted_count:1,excluded_count:1,uncertain_time_count:1,pagination_may_continue:false}}};
 const before=structuredClone(row),view=stockBriefing(row);
 assert.match(view.collectionCopy,/발행 시각 경계 미확정 1건/);
 assert.match(view.reason,/불완전/);
 assert.deepEqual(view.scores,[['원점수 S',70],['사건 보정 Q','미평가'],['보정 점수 T','미산출']]);
 assert.deepEqual(row,before);
 for(const count of [-1,2,1.5,'1']){row.qualitative.collection_summary.uncertain_time_count=count;assert.equal(stockBriefing(row).collectionCopy,null);}
});


test('retained legacy risks disclose observation count without granting evaluation',()=>{
 const row={strategy:'MLG',qualitative:{status:'unevaluated',legacy_risk_retained:true,legacy_observation_count:3,legacy_observations:[{quote:'PRIVATE_RAW_MUST_NOT_DISPLAY'}]}};
 const view=stockBriefing(row);
 assert.equal(view.legacyCopy,'과거 위험 관찰 3건 유지 · 해소 검토 필요');
 assert.equal(view.status,'unevaluated');assert.deepEqual(view.scores,[]);
 assert.doesNotMatch(JSON.stringify(view),/PRIVATE_RAW_MUST_NOT_DISPLAY/);
 for(const count of [0,-1,2001,1.5,'3']){row.qualitative.legacy_observation_count=count;assert.equal(stockBriefing(row).legacyCopy,undefined);}
});


test('observed availability keeps source timezone unknown and exposes its separate collection clock',()=>{
 const row=tenx(),raw='2026-11-07 09:00:00';
 const metadata={basis:'fmp_publishedDate_timezone_unspecified',precision:'local_datetime_timezone_unknown',timezone:null,offset_enclosure_hours:24,earliest_utc:'2026-11-06T09:00:00Z',latest_utc:'2026-11-08T09:00:00Z'};
 Object.assign(row.qualitative.event,{published_at:raw,publication_time:metadata,source_observation:{basis:'successful_fmp_response',observed_at:cutoff,payload_sha256:'a'.repeat(64)}});
 const before=structuredClone(row),view=stockBriefing(row);
 assert.equal(view.status,'evaluated');assert.equal(view.events[0].publishedAt,raw);
 assert.equal(view.events[0].publicationTimeUnknown,true);assert.equal(view.events[0].observedAt,cutoff);
 assert.deepEqual(row,before);
 for(const change of [{observed_at:'2026-11-09T00:00:00Z'},{payload_sha256:'forged'},{basis:'model_claim'}]){
  const bad=structuredClone(row);Object.assign(bad.qualitative.event.source_observation,change);
  assert.equal(stockBriefing(bad).status,'invalid');
 }
});

test('retained boundary context is described separately from excluded sources',()=>{
 const row=tenx();Object.assign(row.qualitative,{collection_scope:'fmp_stock_news_first_page',collection_summary:{raw_count:4,admitted_count:4,excluded_count:0,boundary_context_count:1,pagination_may_continue:false}});
 assert.match(stockBriefing(row).collectionCopy,/검토 후보 4건.*90일 경계 문맥 1건/);
 row.qualitative.collection_summary.boundary_context_count=5;assert.equal(stockBriefing(row).collectionCopy,null);
});

test('verified partial Radar events disclose incomplete candidate coverage',()=>{
 const packet=radar();packet.coverage={scope:'verified_retrieved_candidates',other_candidates_unverified:true};
 const model=radarBriefing(packet,Date.parse(analyzed));
 assert.equal(model.status,'ready');assert.equal(model.events.length,1);
 assert.match(model.label,/일부 후보 미확인/);assert.match(model.coverageCopy,/독립 검증/);
});
