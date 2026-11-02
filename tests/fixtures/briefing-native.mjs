import { createCipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dailyFixture } from './radar-packets.mjs';
import { unavailableEngineStatus } from '../../src/features/radar/observation-status.js';
import { sha256, readScreeningArchive, readRadarSource, normalizeSources } from '../../scripts/lib/briefing-input.mjs';
const seed = JSON.parse(readFileSync(new URL('../../src/features/briefing/fixtures/ready.json', import.meta.url), 'utf8'));
export const fixturePassword = 'synthetic-briefing-transport-only';
export const cutoff = '2026-11-02T12:00:00Z';
export function nativeArchive() {
  const payload = {
    contract_version: 'general_screener_v2',
    generated_at: '2026-11-02T10:00:00Z',
    benchmark: 'QQQ',
    evidence_status: 'HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING',
    runs: [],
    recommendations: [],
    performance: {
      aggregates: [],
      signals: []
    }
  };
  for (const strategy of ['TENX', 'MLG']) for (const when of ['current', 'previous']) {
    const source = seed.engines[strategy][when],
      run_id = `${strategy}-${when}`;
    payload.runs.push({
      strategy,
      run_id,
      sha: 'a'.repeat(40),
      report_created_at: when === 'current' ? '2026-11-02T10:00:00Z' : '2026-10-29T10:00:00Z'
    });
    payload.recommendations.push(...source.candidates.map(row => ({
      strategy,
      run_id,
      symbol: row.symbol,
      sector: row.sector,
      recommendation_rank: row.rank,
      score: row.score,
      screening_price: 100,
      screening_price_as_of: source.as_of,
      current_price: 100,
      current_price_as_of: source.as_of,
      risk_flags: 'event_risk_status=available'
    })));
  }
  const payload_json = JSON.stringify(payload);
  const packet = {
    schema: 'briefing_screening_archive_v1',
    producer_repository: 'swk0218/Screening-agent-by-FMP-API',
    revision: 'b'.repeat(40),
    archive_committed_at: '2026-11-02T10:05:00Z',
    archive_hashes: {
      'calibration_tracking.csv': 'c'.repeat(64)
    },
    payload_json,
    payload_sha256: sha256(payload_json)
  };
  const raw = Buffer.from(JSON.stringify(packet));
  return {
    raw,
    hash: sha256(raw),
    payload
  };
}
export function nativeRadar({
  session = '2026-10-30',
  state = 'DATED',
  failure = null
} = {}) {
  const packet = dailyFixture(false, true),
    computed = session === '2026-10-30' ? '2026-11-02T10:00:00Z' : '2026-10-30T10:00:00Z';
  packet.session = session;
  Object.assign(packet.observation, {
    expected_session: session,
    computed_at_utc: computed,
    first_seen_at_utc: computed
  });
  packet.timing.decision_at_utc = computed;
  packet.timing.deadline_utc = '2026-11-02T13:00:00Z';
  for (const value of Object.values(packet.observation.source_receipts)) Object.assign(value, {
    observation_date: session,
    received_at_utc: computed
  });
  for (const value of Object.values(packet.input_metadata)) Object.assign(value, {
    source_date: session,
    received_at_utc: computed
  });
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', pbkdf2Sync(fixturePassword, salt, 600000, 32, 'sha256'), iv);
  cipher.setAAD(Buffer.from('market_radar_v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(packet)), cipher.final(), cipher.getAuthTag()]);
  const envelope = {
    envelope_version: 'market_radar_encrypted_v1',
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 600000,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    payload_hash_kind: 'ciphertext_sha256',
    payload_hash: sha256(encrypted)
  };
  const raw = Buffer.from(JSON.stringify(envelope));
  const status = {
    ...unavailableEngineStatus(),
    status: state,
    source_session: session,
    expected_session: session,
    input_admitted_at_utc: computed,
    model_computed_at_utc: computed,
    latest_attempt_at_utc: computed,
    next_scheduled_at_utc: '2026-11-02T12:40:00Z',
    feed_cipher_sha256: sha256(raw),
    engine_result_id: 'd'.repeat(64),
    built_at_utc: computed,
    published_at_utc: computed,
    publication_receipt_result_id: 'd'.repeat(64),
    failure_code: failure
  };
  return {
    raw,
    status,
    packet
  };
}
export async function nativeInput(options = {}) {
  const archive = nativeArchive(),
    radar = nativeRadar(options),
    previous = nativeRadar({
      session: '2026-10-29'
    });
  const radarCurrent = await readRadarSource(radar.raw, radar.status, fixturePassword, radar.status.expected_session, cutoff);
  const radarPrevious = await readRadarSource(previous.raw, previous.status, fixturePassword, '2026-10-29', cutoff);
  const data = normalizeSources({
    screening: readScreeningArchive(archive.raw, archive.hash),
    selection: {
      TENX: {
        current: 'TENX-current',
        previous: 'TENX-previous'
      },
      MLG: {
        current: 'MLG-current',
        previous: 'MLG-previous'
      }
    },
    radar: {
      current: radarCurrent,
      previous: radarPrevious
    },
    companies: seed.companies,
    session: '2026-10-30',
    cutoff,
    demo: options.demo ?? true
  });
  return {
    data,
    binding: {
      assessment_session: data.session,
      normalizer_version: 'briefing-native-input-v1',
      screening_archive_sha256: archive.hash,
      radar_cipher_sha256: {
        current: sha256(radar.raw),
        previous: sha256(previous.raw)
      }
    },
    archive,
    radar
  };
}
