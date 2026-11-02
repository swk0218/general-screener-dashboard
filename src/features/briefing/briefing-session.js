import { validateEngineStatus, observationState } from '../radar/observation-status.js';

// Only a bound, validated engine delivery can select a current briefing session.
// Missing/delayed status is a hold, never a guessed weekday or user-supplied date.
export function selectBriefingSession(radar, status, now = Date.now()) {
  try {
    const valid = validateEngineStatus(status);
    if (!radar || valid.status !== 'DATED' || observationState(valid, now) === 'STALE'
      || observationState(valid, now) === 'UNAVAILABLE' || valid.source_session !== radar.session
      || valid.expected_session !== radar.session || !valid.feed_cipher_sha256
      || !valid.source_market_close_utc || Date.parse(valid.source_market_close_utc) > now
      || now > Date.parse(valid.next_scheduled_at_utc) + 2 * 3600000) return null;
    return radar.session;
  } catch { return null; }
}
