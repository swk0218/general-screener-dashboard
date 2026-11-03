import test from 'node:test';
import assert from 'node:assert/strict';
import {latestCompletedSession,MARKET_CALENDAR} from '../src/features/briefing/market-calendar.js';
import {selectBriefingSession,currentRadarAvailable,reassessOpenBriefing,receivedSourceClocks} from '../src/features/briefing/briefing-session.js';
import {briefingClocks} from '../src/features/briefing/briefing-model.js';
import {unavailableEngineStatus} from '../src/features/radar/observation-status.js';

test('assessment date is independent of missing or quarantined Radar',()=>{
  const now=Date.parse('2026-11-03T02:31:56Z');
  assert.equal(selectBriefingSession(null,null,now),'2026-11-02');
  assert.equal(selectBriefingSession({session:'2026-10-19'},{status:'FAILED'},now),'2026-11-02');
  assert.equal(currentRadarAvailable(null,null,now),false);
  assert.equal(latestCompletedSession(now).close_utc,'2026-11-02T21:00:00.000Z');
});
test('calendar handles holiday, weekend, DST and open-session cutoff',()=>{
  for(const [now,session,close] of [
    ['2026-07-03T22:00:00Z','2026-07-02','2026-07-02T20:00:00.000Z'],
    ['2026-03-09T19:59:59Z','2026-03-06','2026-03-06T21:00:00.000Z'],
    ['2026-03-09T20:00:00Z','2026-03-09','2026-03-09T20:00:00.000Z'],
    ['2026-11-02T20:59:59Z','2026-10-30','2026-10-30T20:00:00.000Z']
  ]){const result=latestCompletedSession(Date.parse(now));assert.equal(result.session,session);assert.equal(result.close_utc,close);}
});
test('early closure and exceptional closure use explicit reviewed table; expired coverage holds',()=>{
  const calendar={...MARKET_CALENDAR,valid_until:'2026-12-31T23:59:59Z'};
  assert.equal(latestCompletedSession(Date.parse('2026-11-27T17:59:59Z'),calendar).session,'2026-11-25');
  assert.equal(latestCompletedSession(Date.parse('2026-11-27T18:00:00Z'),calendar).session,'2026-11-27');
  const closed={...calendar,holidays:[...calendar.holidays,'2026-11-02']};
  assert.equal(latestCompletedSession(Date.parse('2026-11-03T02:00:00Z'),closed).session,'2026-10-30');
  assert.equal(latestCompletedSession(Date.parse('2026-11-11T02:00:00Z')),null);
  assert.equal(latestCompletedSession(Date.parse('2027-01-04T23:00:00Z'),calendar),null);
});

test('expiry is inclusive and malformed coverage is never replaced with a guessed date',()=>{
  assert.equal(latestCompletedSession(Date.parse(MARKET_CALENDAR.valid_until)),null);
  for(const calendar of [null,{...MARKET_CALENDAR,valid_until:'unknown'},
    {...MARKET_CALENDAR,holidays:null},{...MARKET_CALENDAR,start:'2027-01-01'}])
    assert.equal(latestCompletedSession(Date.parse('2026-11-03T12:00:00Z'),calendar),null);
});

const previous={status:'ready',demo:false,execution_mode:'provider',session:'2026-11-02',
  generated_at:'2026-11-03T20:50:00Z',computed:{market_available:false},roles:[],insights:[]};
test('an open page rechecks trading close and retains only explicitly previous clocks',()=>{
  assert.equal(reassessOpenBriefing(previous,null,null,Date.parse('2026-11-03T20:59:59Z')),previous);
  const held=reassessOpenBriefing(previous,null,null,Date.parse('2026-11-03T21:00:00Z'));
  assert.equal(held.status,'unavailable');assert.equal(held.reason,'assessment_session_changed');
  assert.equal(held.previous_briefing,previous);assert.equal(held.previous_is_current,false);
  assert.equal(held.roles,undefined);assert.equal(held.insights,undefined);assert.equal(held.generated_at,undefined);
  assert.equal(previous.status,'ready');
});
test('open-page reassessment holds expired calendar and generation without refreshing source time',()=>{
  const data={...previous,session:'2026-11-09',generated_at:'2026-11-10T03:00:00Z'};
  assert.equal(reassessOpenBriefing(data,null,null,Date.parse(MARKET_CALENDAR.valid_until)).reason,'assessment_calendar_unavailable');
  for(const generated_at of ['unknown','2026-11-04T00:00:00Z','2026-10-31T00:00:00Z'])
    assert.equal(reassessOpenBriefing({...previous,generated_at},null,null,Date.parse('2026-11-03T12:00:00Z')).reason,'briefing_generation_expired');
});
test('open-page reassessment never keeps a current market interpretation after source expiry',()=>{
  const data={...previous,generated_at:'2026-11-03T10:00:00Z',computed:{market_available:true}};
  assert.equal(reassessOpenBriefing(data,null,null,Date.parse('2026-11-03T12:00:00Z')).reason,'radar_context_expired');
  const unavailable={status:'unavailable',reason:'provider_failed'};
  assert.equal(reassessOpenBriefing(unavailable,null,null),unavailable);
});

test('unavailable briefing displays independently received dates without substituting report or current-price clocks',()=>{
  const payload={runs:[{strategy:'TENX',run_id:'new',report_created_at:'2026-11-03T06:21:03Z'}],
    recommendations:[{strategy:'TENX',run_id:'new',symbol:'FIX',recommendation_rank:1,
      screening_price_as_of:null,current_price_as_of:'2026-11-02'}]};
  const original=JSON.stringify(payload);
  const received=receivedSourceClocks(payload,null);
  let clocks=briefingClocks({status:'unavailable'},'UTC',received);
  assert.equal(clocks.engines[1].asOf,null);assert.equal(clocks.engines[1].label,'기준일 확인 불가');
  assert.equal(clocks.engines[1].reported,'2026-11-03 06:21 UTC');
  assert.equal(clocks.generated,null);assert.equal(clocks.session,null);assert.equal(JSON.stringify(payload),original);
  payload.recommendations[0].screening_price_as_of='2026-11-02';
  clocks=briefingClocks({status:'unavailable'},'UTC',receivedSourceClocks(payload,null));
  assert.equal(clocks.engines[1].asOf,'2026-11-02');assert.equal(clocks.generated,null);
  assert.equal(clocks.engines[1].label,'수신 원자료 · 해석 유보');
});

test('a contradictory DATED status with any failure code cannot retain market interpretation',()=>{
  const status={...unavailableEngineStatus(),status:'DATED',failure_code:null,source_session:'2026-11-02',
    expected_session:'2026-11-02',source_market_close_utc:'2026-11-02T21:00:00Z',
    input_admitted_at_utc:'2026-11-03T10:00:00Z',model_computed_at_utc:'2026-11-03T10:00:00Z',
    latest_attempt_at_utc:'2026-11-03T10:00:00Z',next_scheduled_at_utc:'2026-11-03T12:40:00Z',
    feed_cipher_sha256:'a'.repeat(64),engine_result_id:'b'.repeat(64)};
  const now=Date.parse('2026-11-03T12:00:00Z'),radar={session:'2026-11-02'};
  assert.equal(currentRadarAvailable(radar,status,now),true);
  assert.equal(currentRadarAvailable(radar,{...status,failure_code:'REVISION_QUARANTINED'},now),false);
});
