// Server/CLI only. Reuse the current consumer validators; never bundle Node APIs.
import { createHash } from 'node:crypto';
import { assertDashboardPayload } from '../../src/data/contract.js';
import { isQuarantinedDashboardRun } from '../../src/data/payload-quarantine.js';
import { validateRadarDelivery } from '../../src/features/radar/radar-contract.js';
import { validateEngineStatus } from '../../src/features/radar/observation-status.js';
import { decryptRadarEnvelope } from '../../src/features/radar/radar-envelope.js';
export const NORMALIZER_VERSION = 'briefing-native-input-v1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const objectHash = value => sha256(Buffer.from(JSON.stringify(canonical(value))));
const timestamp = value => typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const sourceToken = Symbol('verified-radar-source');
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function unavailable(id, status = 'missing') {
  return {
    as_of: null,
    session: null,
    status,
    contract: 'unavailable',
    source_id: id,
    candidates: [],
    market_state: 'unavailable'
  };
}
export function readScreeningArchive(raw, expectedSha256) {
  if (sha256(raw) !== expectedSha256) throw new Error('SCREENING_BYTES_MISMATCH');
  const packet = JSON.parse(Buffer.from(raw).toString('utf8'));
  if (packet.schema !== 'briefing_screening_archive_v1' || packet.producer_repository !== 'swk0218/Screening-agent-by-FMP-API' || !/^[a-f0-9]{40}$/.test(packet.revision) || !packet.archive_hashes || !Object.keys(packet.archive_hashes).length || Object.values(packet.archive_hashes).some(hash => !/^[a-f0-9]{64}$/.test(hash)) || typeof packet.payload_json !== 'string' || packet.payload_sha256 !== sha256(Buffer.from(packet.payload_json))) throw new Error('INVALID_SCREENING_ARCHIVE');
  packet.payload = JSON.parse(packet.payload_json);
  assertDashboardPayload(packet.payload);
  if (packet.engine_contracts !== undefined) {
    if (!packet.engine_contracts || typeof packet.engine_contracts !== 'object' || Array.isArray(packet.engine_contracts)) throw new Error('INVALID_ENGINE_CONTRACTS');
    for (const [key, value] of Object.entries(packet.engine_contracts)) {
      if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'contract_id,implementation_hash,rule_hash,run_id,strategy,strategy_version'
        || !['TENX','MLG'].includes(value.strategy) || typeof value.run_id !== 'string' || key !== `${value.strategy}:${value.run_id}`
        || typeof value.strategy_version !== 'string' || !value.strategy_version.length || value.strategy_version.length > 128
        || typeof value.implementation_hash !== 'string' || typeof value.rule_hash !== 'string'
        || !/^[a-f0-9]{64}$/.test(value.implementation_hash) || !/^[a-f0-9]{8,64}$/.test(value.rule_hash) || value.contract_id !== objectHash({strategy:value.strategy,strategy_version:value.strategy_version,rule_hash:value.rule_hash,implementation_hash:value.implementation_hash})
        || !packet.payload.runs.some(run=>run.strategy===value.strategy&&String(run.run_id)===value.run_id)) throw new Error('INVALID_ENGINE_CONTRACTS');
    }
  }
  return freeze({
    [sourceToken]: true,
    packet,
    sourceHash: expectedSha256
  });
}
export async function readRadarSource(raw, status, passphrase, expectedSession, cutoff) {
  // This receipt is minted only after exact cipher binding, authentication and native validation.
  validateEngineStatus(status);
  if (!timestamp(cutoff) || status.feed_cipher_sha256 !== sha256(raw)) throw new Error('RADAR_BINDING_MISMATCH');
  const packet = validateRadarDelivery(await decryptRadarEnvelope(JSON.parse(Buffer.from(raw).toString('utf8')), passphrase));
  if (status.source_session !== packet.session || status.expected_session !== expectedSession || packet.session > expectedSession) throw new Error('RADAR_SESSION_MISMATCH');
  for (const clock of [status.input_admitted_at_utc, status.model_computed_at_utc, status.latest_attempt_at_utc, status.published_at_utc, packet.observation?.computed_at_utc]) {
    if (!timestamp(clock) || Date.parse(clock) > Date.parse(cutoff)) throw new Error('RADAR_NOT_AVAILABLE_AT_CUTOFF');
  }
  const held = status.status !== 'DATED' || status.failure_code !== null || packet.session !== expectedSession || packet.operating_status !== 'DAILY_MODEL_COMPUTED' || packet.gauge.level === 'UNAVAILABLE' || packet.events.bottom && packet.events.top;
  return freeze({
    [sourceToken]: true,
    sourceHash: sha256(raw),
    snapshot: {
      as_of: packet.session,
      session: packet.session,
      status: held ? status.failure_code === 'REVISION_QUARANTINED' ? 'quarantined' : 'invalid' : 'valid',
      contract: `${packet.schema_version}:${packet.model_version}`,
      source_id: `radar:${packet.session}:${status.engine_result_id}`,
      candidates: [],
      market_state: held ? 'unavailable' : packet.events.top ? 'caution' : 'balanced'
    }
  });
}
function screeningSnapshot(source, strategy, runId, cutoff) {
  if (!runId) return unavailable(`${strategy}:missing`);
  const {
    payload
  } = source.packet;
  if (!timestamp(source.packet.archive_committed_at) || Date.parse(source.packet.archive_committed_at) > Date.parse(cutoff)) throw new Error('ARCHIVE_NOT_AVAILABLE_AT_CUTOFF');
  const run = payload.runs.find(run => run.strategy === strategy && String(run.run_id) === String(runId));
  if (!run || !timestamp(run.report_created_at) || Date.parse(run.report_created_at) > Date.parse(cutoff)) throw new Error('RUN_NOT_AVAILABLE_AT_CUTOFF');
  if (isQuarantinedDashboardRun(run)) return unavailable(`${strategy}:${runId}:quarantined`, 'quarantined');
  if (!/^[a-f0-9]{40}$/.test(run.sha || '')) throw new Error('RUN_REVISION_REQUIRED');
  const contract = source.packet.engine_contracts?.[`${strategy}:${runId}`]?.contract_id;
  if (!contract) return unavailable(`${strategy}:${runId}:contract_unverified`);
  const rows = payload.recommendations.filter(row => row.strategy === strategy && String(row.run_id) === String(runId));
  const sessions = [...new Set(rows.map(row => row.screening_price_as_of))];
  if (!rows.length || sessions.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(sessions[0] || '')) return unavailable(`${strategy}:${runId}:data_session_unavailable`);
  const ranks = rows.map(row => row.recommendation_rank).sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1) || new Set(rows.map(row => row.symbol)).size !== rows.length) throw new Error('INVALID_NATIVE_RANKS');
  return {
    as_of: sessions[0],
    session: sessions[0],
    status: 'valid',
    contract: `${payload.contract_version}:${contract}`,
    source_id: `screening:${run.sha}:${strategy}:${runId}`,
    market_state: 'unavailable',
    candidates: rows.map(row => ({
      symbol: row.symbol,
      rank: row.recommendation_rank,
      score: row.score,
      sector: row.sector || '미확인'
    }))
  };
}
export function normalizeSources({
  screening,
  selection = {},
  radar = {},
  companies,
  session,
  cutoff,
  demo = false
}) {
  if (!screening?.[sourceToken]) throw new Error('UNVERIFIED_SCREENING_SOURCE');
  if (!timestamp(cutoff) || !/^\d{4}-\d{2}-\d{2}$/.test(session) || Date.parse(session) > Date.parse(cutoff)) throw new Error('INVALID_ASSESSMENT_CLOCK');
  if(!timestamp(screening.packet.archive_committed_at)||Date.parse(screening.packet.archive_committed_at)>Date.parse(cutoff))
    throw new Error('ARCHIVE_NOT_AVAILABLE_AT_CUTOFF');
  // Read-only materialization: ranks, scores and native decisions are never recomputed.
  const engines = {};
  for (const strategy of ['TENX', 'MLG']) {
    engines[strategy] = {};
    const available=screening.packet.payload.runs.filter(run=>run.strategy===strategy
      &&timestamp(run.report_created_at)&&Date.parse(run.report_created_at)<=Date.parse(cutoff))
      .sort((left,right)=>Date.parse(right.report_created_at)-Date.parse(left.report_created_at));
    if(available[1]&&Date.parse(available[0].report_created_at)===Date.parse(available[1].report_created_at))throw new Error('AMBIGUOUS_LATEST_RUN');
    for (const [index,when] of ['current','previous'].entries()) {
      const nativeId=available[index]?.run_id;
      if(selection[strategy]?.[when]!=null&&String(selection[strategy][when])!==String(nativeId))
        throw new Error('NONCONSECUTIVE_ENGINE_SELECTION');
      engines[strategy][when]=screeningSnapshot(screening,strategy,nativeId,cutoff);
    }
  }
  engines.Radar = {};
  for (const when of ['current', 'previous']) {
    const source = radar[when];
    if (source && !source[sourceToken]) throw new Error('UNVERIFIED_RADAR_SOURCE');
    engines.Radar[when] = source ? structuredClone(source.snapshot) : unavailable(`radar:${when}:missing`);
  }
  return {
    schema_version: 'gpt_shadow_v1',
    demo,
    session,
    generated_at: cutoff,
    engines,
    companies: structuredClone(companies)
  };
}
