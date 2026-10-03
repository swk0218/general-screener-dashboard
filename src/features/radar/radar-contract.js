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
  for (const side of ['bottom','top']) {
    if (typeof value.events[side] !== 'boolean' || typeof value.active[side] !== 'boolean') fail();
    if (value.scores?.[side] !== null && (!finite(value.scores?.[side]) || value.scores[side]<0 || value.scores[side]>1)) fail();
  }
  for (const [key] of MODEL_INPUTS) if (!Object.hasOwn(value.inputs,key) || (value.inputs[key]!==null && !finite(value.inputs[key]))) fail();
  for (const [key] of REFERENCE_INPUTS) if (!Object.hasOwn(value.references,key) || (value.references[key]!==null && !finite(value.references[key]))) fail();
  const { score, level, mixed } = value.gauge;
  const { bottom, top } = value.events;
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
