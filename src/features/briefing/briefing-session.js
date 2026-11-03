import { validateEngineStatus, observationState } from '../radar/observation-status.js';
import { latestCompletedSession } from './market-calendar.js';

// Calendar selects the assessment session; engine delivery never selects the date.
// Source status independently gates market interpretation.
export function selectBriefingSession(radar, status, now = Date.now()) {
  return latestCompletedSession(now)?.session || null;
}

export function currentRadarAvailable(radar, status, now = Date.now()) {
  try {
    const valid = validateEngineStatus(status);
    if (!radar || valid.status !== 'DATED' || observationState(valid, now) === 'STALE'
      || observationState(valid, now) === 'UNAVAILABLE' || valid.source_session !== radar.session
      || valid.expected_session !== radar.session || !valid.feed_cipher_sha256
      || !valid.source_market_close_utc || Date.parse(valid.source_market_close_utc) > now
      || now > Date.parse(valid.next_scheduled_at_utc) + 2 * 3600000) return false;
    return radar.session === selectBriefingSession(null, null, now);
  } catch { return false; }
}
