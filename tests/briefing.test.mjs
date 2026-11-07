import test from 'node:test';
import assert from 'node:assert/strict';
import {stockBriefing,radarBriefing,safeSourceUrl} from '../src/features/qualitative/briefing-model.js';
const cutoff='2026-11-07T10:00:00Z', analyzed='2026-11-07T10:01:00Z';
const event={id:'contract-1',symbol:'TEST',published_at:'2026-11-06T10:00:00Z',source_url:'https://example.com/filing',quote:'TEST_ONLY contract confirmation',reason:'TEST_ONLY limited contract confirmed'};
const tenx=()=>({symbol:'TEST',strategy:'TENX',quantitative_score:59,qualitative_adjustment:2,adjusted_score:61,ranking_basis:'quantitative_score',qualitative:{status:'evaluated',q:2,event,data_as_of:cutoff,analyzed_at:analyzed}});
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
 const zero=tenx();zero.qualitative.q=0;zero.qualitative.event=null;zero.qualitative_adjustment=0;zero.adjusted_score=59;assert.equal(stockBriefing(zero).summary,'확인된 유효 사건 없음');
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
