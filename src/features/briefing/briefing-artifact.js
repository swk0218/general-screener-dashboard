import { encryptEnvelope, decryptEnvelope } from '../../crypto/envelope.js';
import { assertRoleDocumentContract } from './role-documents.js';
import {DIRECT_ROLE_PROFILE,SOURCE_ROLE_PROFILE} from './role-taxonomy.js';
export const ARTIFACT_KIND = 'general_screener_briefing_v1';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const stamp = value => typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
function fail() {
  throw new Error('BRIEFING_ARTIFACT_INVALID');
}
function assertSourceProvenance(source) {
  const hosts = {SEC:'www.sec.gov', FMP:'financialmodelingprep.com', FRED:'fred.stlouisfed.org', TEST:'example.invalid'};
  if (typeof source.url !== 'string') fail();
  const authority = /^https:\/\/([^/?#]*)/i.exec(source.url.trim())?.[1];
  // WHATWG URL repairs encoded hosts and backslashes that Python's server
  // provenance parser rejects. Do not silently turn those into trusted hosts.
  if (!authority || /[%\\]/.test(authority)) fail();
  // Compare the unnormalized hostname too: WHATWG applies Unicode/IDNA
  // mappings that the backend does not. Keep case-insensitivity and ports.
  const rawHostname = authority.split('@').at(-1).split(':')[0];
  if (!/^[\x00-\x7f]*$/.test(rawHostname) || rawHostname.toLowerCase() !== hosts[source.kind]) fail();
  let url;
  try { url = new URL(source.url); } catch { fail(); }
  // Match the server boundary before any source can become a clickable citation.
  // Authentication parameters must never survive inside an otherwise valid envelope.
  if (url.protocol !== 'https:' || url.hostname !== hosts[source.kind] || url.username || url.password || url.search || url.hash) fail();
}
export function assertBriefingArtifact(artifact) {
  if (artifact?.artifact_kind !== ARTIFACT_KIND || ![1,2,3].includes(artifact.version) || !stamp(artifact.created_at) || !['fake_transport', 'provider', 'provider_test'].includes(artifact.execution_mode) || !artifact.source_binding) fail();
  if(artifact.version===1&&artifact.role_document_contract!==undefined)fail();
  const sourceContract=artifact.role_document_contract;
  if(artifact.version===3){
    if(sourceContract?.schema!=='role_document_reviews_source_v2'||sourceContract.profile!==SOURCE_ROLE_PROFILE
      ||artifact.source_binding.source_review_profile!==SOURCE_ROLE_PROFILE)fail();
    for(const name of ['provenance','semantics','receipts','taxonomy']){
      if(!hash(sourceContract[`${name}_hash`])||artifact.source_binding[`source_review_${name}_hash`]!==sourceContract[`${name}_hash`])fail();
    }
  }else if(Object.keys(artifact.source_binding).some(key=>key.startsWith('source_review_'))
    ||sourceContract?.profile===SOURCE_ROLE_PROFILE||sourceContract?.schema==='role_document_reviews_source_v2'
    ||sourceContract&&['source_records','provenance_hash','semantics_hash','receipts_hash'].some(key=>Object.hasOwn(sourceContract,key))
    ||sourceContract?.reviews?.some(row=>row?.source_admission!==undefined))fail();
  const data = artifact.briefing,
    binding = artifact.source_binding;
  if (!data || typeof data.demo !== 'boolean' || !['ready', 'cached', 'unavailable', 'disabled'].includes(data.status) || !hash(binding.input_hash) || !/^\d{4}-\d{2}-\d{2}$/.test(binding.assessment_session || '')) fail();
  if(binding.normalizer_version==='briefing-product-probe-input-v1') {
    if(artifact.execution_mode!=='provider_test'||!data.demo||binding.source_kind!=='synthetic_probe'||binding.screening_archive_sha256!==null||binding.synthetic_input_sha256!==binding.input_hash||!hash(binding.probe_freeze_hash)||!/^product-v1-(normal|date_mismatch|quarantined|insufficient|conflict)$/.test(binding.probe_case_id)||!['openai_network','offline_contract_fixture'].includes(binding.response_origin)) fail();
    if(!['complete','insufficient_zero_calls','failed_reservation_retained','not_sent'].includes(binding.probe_call_status)
      || ['ready','cached'].includes(data.status)!==(binding.probe_call_status==='complete')) fail();
  } else if(!hash(binding.screening_archive_sha256)||binding.normalizer_version!=='briefing-native-input-v1') fail();
  for (const value of Object.values(binding.radar_cipher_sha256 || {})) if (value !== null && !hash(value)) fail();
  if (['ready', 'cached'].includes(data.status)) {
    const transport = artifact.execution_mode === 'fake_transport' ? 'fake' : 'network';
    if (artifact.execution_mode === 'provider_test' && !data.demo) fail();
    if (data.execution_mode !== artifact.execution_mode || data.identity?.execution_mode !== artifact.execution_mode || data.provider_receipt?.transport !== transport || artifact.execution_mode === 'provider' && data.demo) fail();
    if (data.schema_version !== 'gpt_shadow_v1' || data.identity?.input_hash !== binding.input_hash || data.session !== binding.assessment_session || !stamp(data.generated_at) || Date.parse(data.generated_at) > Date.parse(artifact.created_at) || data.score_effect !== 0 || !data.engine_results_preserved || !data.engines || !data.computed?.facts || !Array.isArray(data.insights) || data.insights.length > 3 || !Array.isArray(data.roles) || !Array.isArray(data.companies)) fail();
    // A source-reviewed contract is the sole authority for its document claims.
    // A legacy briefing projection never carries its sources or positive labels.
    if(artifact.version===3&&(data.companies.some(company=>!Array.isArray(company.sources)||company.sources.length)
      ||data.roles.length!==data.companies.length||new Set(data.roles.map(role=>role.symbol)).size!==data.roles.length
      ||data.roles.some(role=>role.role!=='unknown'||role.decision!=='unconfirmed'||role.period!=='unknown'
        ||!Array.isArray(role.evidence)||role.evidence.length||!Array.isArray(role.counter_evidence)||role.counter_evidence.length)))fail();
    for (const name of ['Radar', 'TENX', 'MLG']) if (!data.engines[name]?.current || !data.engines[name]?.previous) fail();
    for (const company of data.companies) for (const source of company.sources || []) {
      assertSourceProvenance(source);
      if (source.kind === 'TEST' && (artifact.execution_mode !== 'provider_test' || !data.demo || binding.source_kind !== 'synthetic_probe')) fail();
    }
    if (data.computed.market_available && (data.engines.Radar.current.status !== 'valid' || data.engines.Radar.current.session !== data.session)) fail();
    const ids = new Set();
    for (const insight of data.insights) {
      if (!['market_conflict', 'candidate_review', 'shared_exposure'].includes(insight.kind) || !Array.isArray(insight.fact_ids) || !insight.fact_ids.length || insight.fact_ids.some(id => !Object.hasOwn(data.computed.facts, id) || ids.has(id))) fail();
      insight.fact_ids.forEach(id => ids.add(id));
      const facts = insight.fact_ids.map(id => data.computed.facts[id]);
      if (insight.kind === 'market_conflict' && (!data.computed.market_available || !insight.fact_ids.includes('market') || data.computed.facts.market?.state !== 'caution' || !facts.some(fact => fact.kind === 'candidate_change'))) fail();
      if (insight.kind === 'candidate_review' && facts.some(fact => fact.kind !== 'candidate_change')) fail();
      if (insight.kind === 'shared_exposure' && (insight.fact_ids.join() !== 'exposure' || !data.computed.facts.exposure.changed || !Array.isArray(data.computed.facts.exposure.symbols) || !data.computed.facts.exposure.symbols.length || !Array.isArray(data.computed.facts.exposure.sectors))) fail();
      for (const fact of facts) if (fact.kind === 'candidate_change' && (!Array.isArray(fact.entered) || !Array.isArray(fact.exited) || !Number.isInteger(fact.count_delta) || !['MLG', 'TENX'].includes(fact.engine))) fail();
    }
    for (const role of data.roles) {
      const company = data.companies.find(item => item.symbol === role.symbol);
      if (!company || !['supported', 'unconfirmed'].includes(role.decision) || !['current', 'planned', 'past', 'unknown'].includes(role.period) || !['compute', 'semiconductor', 'interconnect', 'power_cooling', 'cloud', 'unknown'].includes(role.role)) fail();
      if (role.decision === 'supported' && (role.period !== 'current' || !role.evidence?.length)) fail();
      for (const evidence of [...(role.evidence || []), ...(role.counter_evidence || [])]) {
        const source = company.sources.find(item => item.id === evidence.source_id);
        if (!source || typeof evidence.quote !== 'string' || !evidence.quote || !source.text.includes(evidence.quote)) fail();
      }
    }
  } else if (data.generated_at !== undefined || data.insights?.length) fail();
  return artifact;
}
export async function encryptBriefingArtifact(artifact, passphrase) {
  assertBriefingArtifact(artifact);
  await assertInputBinding(artifact);
  if(artifact.version>=2)await assertRoleDocumentContract(artifact);
  return encryptEnvelope(artifact, passphrase);
}
async function assertInputBinding(artifact) {
  const data=artifact.briefing;
  if(!['ready','cached'].includes(data.status)) return;
  const input=Object.fromEntries(['schema_version','demo','session','engines','companies'].map(key=>[key,data[key]]));
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  if(typeof data.input_canonical_json!=='string'||data.input_canonical_json.length>200000) fail();
  let bound;
  try {bound=JSON.parse(data.input_canonical_json);} catch {fail();}
  if(JSON.stringify(canonical(input))!==JSON.stringify(canonical(bound))) fail();
  // Hash preserved server bytes: Python/JS float spelling and JSON spacing differ.
  const bytes=new TextEncoder().encode(data.input_canonical_json);
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==artifact.source_binding.input_hash) fail();
}
export async function readBriefingArtifact(envelope, passphrase, {
  expectedSession,
  expectedInputHash,
  expectedExecutionMode,
  forcePrevious = false,
  requireMarketUnavailable = false,
  now = Date.now(),
  maxAgeMs = 36 * 3600 * 1000
} = {}) {
  const artifact = assertBriefingArtifact(await decryptEnvelope(envelope, passphrase));
  await assertInputBinding(artifact);
  if (artifact.execution_mode === 'provider_test' && expectedExecutionMode !== 'provider_test') fail();
  if (expectedExecutionMode && artifact.execution_mode !== expectedExecutionMode) fail();
  const data = structuredClone(artifact.briefing);
  // Model/legacy payload fields never establish reader-owned v2 admission.
  delete data._validated_role_documents;
  delete data._validated_role_profile;
  if(artifact.version>=2)data._validated_role_documents=await assertRoleDocumentContract(artifact);
  if(artifact.version===2&&artifact.role_document_contract.schema==='role_document_reviews_direct_v1')data._validated_role_profile=DIRECT_ROLE_PROFILE;
  if(artifact.version===3)data._validated_role_profile=SOURCE_ROLE_PROFILE;
  if (Date.parse(artifact.created_at) > now + 300000) return {
    status: 'unavailable',
    demo: data.demo,
    reason: 'future_artifact_clock'
  };
  if (['ready', 'cached'].includes(data.status)) {
    // Re-encrypting or rebuilding cannot refresh a source session or generation clock.
    const age = now - Date.parse(data.generated_at);
    if (forcePrevious || requireMarketUnavailable && data.computed.market_available || !expectedSession || data.session !== expectedSession || age < 0 || age > maxAgeMs || expectedInputHash && artifact.source_binding.input_hash !== expectedInputHash) {
      return {
        status: 'unavailable',
        demo: data.demo,
        previous_is_current: false,
        // Archived results share the ready-result trust boundary: payload fields
        // cannot manufacture reader-owned admission, even in a dated snapshot.
        previous_briefing: data,
        reason: 'dated_result_only'
      };
    }
  }
  return {
    ...data,
    ...(artifact.execution_mode==='provider_test'?{probe_context:{case_id:artifact.source_binding.probe_case_id,response_origin:artifact.source_binding.response_origin,call_status:artifact.source_binding.probe_call_status,assessment_session:artifact.source_binding.assessment_session,freeze_hash:artifact.source_binding.probe_freeze_hash}}:{}),
    execution_mode: artifact.execution_mode
  };
}
export function assertBriefingDeliveryStatus(value) {
  if (!value || Object.keys(value).sort().join() !== ['schema', 'status', 'expected_session', 'expected_input_hash', 'cipher_sha256', 'last_attempt_at'].sort().join() || value.schema !== 'briefing_delivery_status_v1' || !['READY', 'FAILED', 'STALE'].includes(value.status) || !/^\d{4}-\d{2}-\d{2}$/.test(value.expected_session) || !hash(value.expected_input_hash) || !hash(value.cipher_sha256) || !stamp(value.last_attempt_at)) fail();
  return value;
}
export async function loadBriefingDelivery(statusUrl, cipherUrl, passphrase, options = {}, fetcher = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const statusResponse = await fetcher(statusUrl, {
        signal: options.signal,
        cache: 'no-store'
      });
      if (!statusResponse.ok) throw new Error('STATUS_MISSING');
      const statusRaw = await statusResponse.text();
      if (statusRaw.length > 4000) throw new Error('STATUS_TOO_LARGE');
      const status = assertBriefingDeliveryStatus(JSON.parse(statusRaw));
      const response = await fetcher(cipherUrl, {
        signal: options.signal,
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('CIPHER_MISSING');
      const raw = await response.arrayBuffer();
      if (raw.byteLength > 256000) throw new Error('CIPHER_TOO_LARGE');
      const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== status.cipher_sha256) {
        if (attempt === 0) continue;
        throw new Error('PAIR_MISMATCH');
      }
      return await readBriefingArtifact(JSON.parse(new TextDecoder('utf-8', {
        fatal: true
      }).decode(raw)), passphrase, {
        ...options,
        expectedSession: options.expectedSession || status.expected_session,
        expectedInputHash: status.expected_input_hash,
        forcePrevious: options.forcePrevious || status.status !== 'READY'
      });
    } catch {
      return {
        status: 'unavailable',
        demo: false,
        reason: 'optional_delivery_unavailable'
      };
    }
  }
  return {
    status: 'unavailable',
    demo: false,
    reason: 'optional_delivery_unavailable'
  };
}
export async function loadBriefingArtifact(url, passphrase, options = {}, fetcher = fetch) {
  try {
    const response = await fetcher(url, {
      signal: options.signal,
      cache: 'no-store'
    });
    if (!response.ok) return {
      status: 'unavailable',
      demo: false,
      reason: 'optional_artifact_missing'
    };
    const raw = await response.text();
    if (raw.length > 256000) throw new Error('BRIEFING_TOO_LARGE');
    return await readBriefingArtifact(JSON.parse(raw), passphrase, options);
  } catch {
    return {
      status: 'unavailable',
      demo: false,
      reason: 'optional_artifact_unavailable'
    };
  }
}
