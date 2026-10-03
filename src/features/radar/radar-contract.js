const finite = value => typeof value === 'number' && Number.isFinite(value);
export const FROZEN_MODEL_VERSION = 'dd19fa6f7834bb8f85b5b04b0c8b40c5b4419270969d752221d48a74a055770b';
export const MODEL_INPUTS = Object.freeze([
  ['cnn_score', 'CNN 공포·탐욕 점수'], ['cnn_rank', 'CNN 과거 순위'],
  ['return20_risk', '20일 위험조정 수익률'], ['trend200_risk', '200일 평균선 위험조정 이격'],
  ['RV20_rank', '실현 변동성 과거 순위'], ['log_implied_realized', 'VIX / 실현 변동성 (로그)'],
]);
export const REFERENCE_INPUTS = Object.freeze([['rsi14', 'RSI'], ['vix', 'VIX 원수치']]);

export function validateRadarDelivery(value) {
  const fail = () => { throw new Error('Radar 자료를 확인하지 못했습니다.'); };
  if (value?.schema_version !== 'frozen_radar_delivery_v1' || value.model_version !== FROZEN_MODEL_VERSION
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.session || '') || typeof value.evidence_ready !== 'boolean') fail();
  const date = new Date(`${value.session}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value.session) fail();
  if (!value.events || !value.active || !value.gauge || !value.inputs || !value.references) fail();
  const observation=value.operating_status==='OBSERVATION_COMPUTED';
  for (const side of ['bottom','top']) {
    if (typeof value.events[side] !== 'boolean' || (observation?value.active[side]!==null:typeof value.active[side] !== 'boolean')) fail();
    if (value.scores?.[side] !== null && (!finite(value.scores?.[side]) || value.scores[side]<0 || value.scores[side]>1)) fail();
  }
  for (const [key] of MODEL_INPUTS) if (!Object.hasOwn(value.inputs,key) || (value.inputs[key]!==null && !finite(value.inputs[key]))) fail();
  for (const [key] of REFERENCE_INPUTS) if (!Object.hasOwn(value.references,key) || (value.references[key]!==null && !finite(value.references[key]))) fail();
  if(value.input_positions!==undefined) {
    const p=value.input_positions;
    if(!p||!['frozen-input-prior-midrank-v1','frozen-input-prior-midrank-v2'].includes(p.version)||p.window_sessions!==252||p.minimum_valid!==126||p.excludes_current!==true
      ||(p.vix_rank!==null&&(!finite(p.vix_rank)||p.vix_rank<0||p.vix_rank>1))) fail();
  }
  if(value.input_positions?.version==='frozen-input-prior-midrank-v2') {
    const p=value.input_positions;
    if(p.date!==value.session||!Number.isInteger(p.session)||p.ui_only!==true||! /^[a-f0-9]{64}$/.test(p.reference_window_sha256||'')) fail();
    for(const [key,column] of [['vix_rank','VIX'],['return20_risk_rank','return20_risk'],['trend200_risk_rank','trend200_risk'],['log_implied_realized_rank','log_implied_realized']]) {
      const count=p.valid_counts?.[key],source=p.source_values?.[column],expected=column==='VIX'?value.references.vix:value.inputs[column];
      if(!Number.isInteger(count)||count<0||count>252||source!==expected) fail();
      if(p[key]!==null&&(!finite(p[key])||p[key]<0||p[key]>1||count<126||source===null)) fail();
    }
  }
  if(value.native_details!==undefined) for(const side of ['bottom','top']) {
    const d=value.native_details?.[side];
    if(!d||(d.threshold!==null&&(!finite(d.threshold)||d.threshold<0||d.threshold>1))||(observation?d.vetoed!==null:typeof d.vetoed!=='boolean')) fail();
  }
  if(value.input_metadata!==undefined) for(const m of Object.values(value.input_metadata)) {
    if(!m||typeof m.source!=='string'||(m.source_date!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(m.source_date||''))
      ||(m.received_at_utc!==null&&(typeof m.received_at_utc!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(m.received_at_utc)||!Number.isFinite(Date.parse(m.received_at_utc))))) fail();
  }
  const { score, level, mixed } = value.gauge;
  const { bottom, top } = value.events;
  const replay=value.operating_status==='REPLAY_NO_FORWARD_ISSUE';
  if(value.operating_status!==undefined&&!['REPLAY_NO_FORWARD_ISSUE','SHADOW_VERIFIED','DATA_HOLD','NO_SIGNAL','SHADOW','OBSERVATION_COMPUTED'].includes(value.operating_status))fail();
  if(observation&&(value.observation_only!==true||value.controller_evaluated!==false||value.evidence_ready!==false
    ||bottom||top||value.active.bottom!==null||value.active.top!==null||score!==null&&(score<20||score>79)
    ||!value.observation||value.observation.policy!=='SCORE_ONLY_NO_OPERATIONAL_ALERT'
    ||typeof value.observation.computed_at_utc!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value.observation.computed_at_utc)
    ||!Number.isFinite(Date.parse(value.observation.computed_at_utc))
    ||Date.parse(value.observation.computed_at_utc)>Date.now()+300000
    ||value.observation.historical_first_seen_claimed!==false))fail();
  if(observation) {
    const v=value.verification,o=value.observation;
    if(v?.schema!=='dated_observation_math_v1'||v.immutable_panel_sha256!=='73cf8db960ccee52b11adce0a39ea2789197bb997ca039fcf8d2d8c5a827f5d8'
      ||v.independent_features!==true||v.raw_hashes_bound!==true||v.exact_session_inputs!==true
      ||v.model_seal_verified!==true||v.controller_evaluated!==false||v.feature_tolerance!==1e-12
      ||!/^\d{4}-\d{2}-\d{2}$/.test(o.expected_session||'')||o.expected_session<value.session
      ||!['DATED_OBSERVATION','DATED_STALE_OBSERVATION'].includes(value.gauge.data_status)
      ||(value.gauge.data_status==='DATED_STALE_OBSERVATION')!==(o.expected_session!==value.session))fail();
    for(const source of ['CNN','SPY','VIX']) {
      const r=o.source_receipts?.[source],hash=o.source_hashes?.[source];
      if(!r||! /^[a-f0-9]{64}$/.test(hash||'')||(r.raw_sha256||r.sha256)!==hash||r.observation_date!==value.session
        ||!/(Z|[+-]\d{2}:\d{2})$/.test(r.received_at_utc||'')||!Number.isFinite(Date.parse(r.received_at_utc))
        ||Date.parse(r.received_at_utc)>Date.parse(o.computed_at_utc))fail();
    }
    if(score!==null) {
      for(const [key] of MODEL_INPUTS)if(!finite(value.inputs[key]))fail();
      if(!finite(value.references.vix)||!value.input_metadata||!value.input_positions||!value.native_details)fail();
      for(const [key] of [...MODEL_INPUTS,...REFERENCE_INPUTS]) {
        if(value.inputs[key]===null||value.references[key]===null)continue;
        const m=value.input_metadata[key];
        if(!m||m.source_date!==value.session||m.status!=='DATED_OBSERVATION_NOT_ALERT'||!m.received_at_utc)fail();
      }
    }
  }
  if(!replay&&!observation&&(!value.evidence_ready||['DATA_HOLD','NO_SIGNAL','SHADOW'].includes(value.operating_status)||value.gauge.data_status==='CACHED_STALE')) {
    if(bottom||top||score!==null||level!=='UNAVAILABLE'||value.scores.bottom!==null||value.scores.top!==null)fail();
  }
  if (typeof mixed !== 'boolean' || typeof value.gauge.reference_version !== 'string') fail();
  if (score === null) {
    if (!['UNAVAILABLE','CONFLICT'].includes(level) || (level==='CONFLICT' && (!(bottom&&top)||!mixed))) fail();
  } else {
    if (!Number.isInteger(score) || score<0 || score>100 || (bottom&&top)) fail();
    const expected = score<20?'Extreme Low':score<40?'Low':score<60?'Neutral':score<80?'High':'Extreme High';
    if (expected!==level || (level==='Extreme Low')!==bottom || (level==='Extreme High')!==top) fail();
  }
  return value;
}
