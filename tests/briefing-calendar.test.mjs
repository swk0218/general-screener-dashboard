import test from 'node:test';
import assert from 'node:assert/strict';
import {latestCompletedSession,MARKET_CALENDAR} from '../src/features/briefing/market-calendar.js';
import {selectBriefingSession,currentRadarAvailable} from '../src/features/briefing/briefing-session.js';

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
