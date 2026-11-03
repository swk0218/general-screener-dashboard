import { validateEngineStatus, observationState } from '../radar/observation-status.js';
import { latestCompletedSession } from './market-calendar.js';
import { sortRunsNewestFirst, getRunRecommendations } from '../../data/dashboard-model.js';
import { isQuarantinedDashboardRun } from '../../data/payload-quarantine.js';

// Calendar selects the assessment session; engine delivery never selects the date.
// Source status independently gates market interpretation.
export function selectBriefingSession(radar, status, now = Date.now()) {
  return latestCompletedSession(now)?.session || null;
}

export function currentRadarAvailable(radar, status, now = Date.now()) {
  try {
    const valid = validateEngineStatus(status);
    if (!radar || valid.status !== 'DATED' || valid.failure_code !== null || observationState(valid, now) === 'STALE'
      || observationState(valid, now) === 'UNAVAILABLE' || valid.source_session !== radar.session
      || valid.expected_session !== radar.session || !valid.feed_cipher_sha256
      || !valid.source_market_close_utc || Date.parse(valid.source_market_close_utc) > now
      || now > Date.parse(valid.next_scheduled_at_utc) + 2 * 3600000) return false;
    return radar.session === selectBriefingSession(null, null, now);
  } catch { return false; }
}

// Recheck decrypted results locally while the page stays open. No saved passphrase or fetch.
export function reassessOpenBriefing(data, radar, status, now = Date.now()) {
  if (!data || !['ready','cached'].includes(data.status)) return data;
  const assessment = latestCompletedSession(now);
  const age = now - Date.parse(data.generated_at);
  let reason = null;
  if (!assessment) reason = 'assessment_calendar_unavailable';
  else if (data.session !== assessment.session) reason = 'assessment_session_changed';
  else if (!Number.isFinite(age) || age < 0 || age > 36*3600000) reason = 'briefing_generation_expired';
  else if (data.computed?.market_available && !currentRadarAvailable(radar,status,now)) reason = 'radar_context_expired';
  if (!reason) return data;
  return {status:'unavailable',demo:data.demo,execution_mode:data.execution_mode,
    previous_is_current:false,previous_briefing:data,reason};
}

// Display-only provenance from the existing unlocked payload. Never becomes GPT evidence.
export function receivedSourceClocks(payload, radarStatus) {
  const clocks=['TENX','MLG'].map(name=>{
    const run=sortRunsNewestFirst(payload?.runs?.filter(r=>r.strategy===name))[0];
    const rows=run?getRunRecommendations(payload?.recommendations,name,run.run_id):[];
    const dates=[...new Set(rows.map(r=>r.screening_price_as_of))];
    const asOf=rows.length&&dates.length===1&&/^\d{4}-\d{2}-\d{2}$/.test(dates[0]||'')?dates[0]:null;
    return {name,asOf,reportedAt:run?.report_created_at||null,
      label:run&&isQuarantinedDashboardRun(run)?'격리된 원자료':asOf?'수신 원자료 · 해석 유보':'기준일 확인 불가'};
  });
  let radar={name:'Radar',asOf:null,reportedAt:null,label:'자료 확인 불가'};
  try {
    const status=validateEngineStatus(radarStatus);
    radar={name:'Radar',asOf:status.source_session,reportedAt:status.model_computed_at_utc,
      label:status.failure_code==='REVISION_QUARANTINED'?'격리된 원자료':status.status==='DATED'?'수신 원자료 · 해석 유보':'확인 보류'};
  } catch {/* Missing or invalid metadata never supplies a date. */}
  return [radar,...clocks];
}
