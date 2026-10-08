import {SIGNAL_REFERENCES,REFERENCE_HASH} from './signal-references.js';
export function validateSignalGauge(value,fail) {
  const {gauge:g,events:e,timing:t,observation:o}=value;
  const v3=g.presentation_version==='marketradar-signal-distance-v3';
  if(value.controller_evaluated!==true||value.observation_only!==false||value.evidence_ready!==false
    ||!['marketradar-signal-distance-v2','marketradar-signal-distance-v3'].includes(g.presentation_version)||g.reference_version!==REFERENCE_HASH
    ||t?.policy!=='DAILY_NEXT_OPEN_MINUS_30M_V1'||o?.policy!==t.policy
    ||typeof t.eligible!=='boolean'||o.historical_first_seen_claimed!==false
    ||!Number.isFinite(Date.parse(t.deadline_utc))||!Number.isFinite(Date.parse(o.computed_at_utc))
    ||Date.parse(o.computed_at_utc)>Date.now()+300000)fail();
  if(t.eligible&&(!Number.isFinite(Date.parse(t.decision_at_utc))
    ||Date.parse(t.decision_at_utc)>Date.parse(t.deadline_utc)
    ||Date.parse(t.decision_at_utc)<Date.parse(o.first_seen_at_utc)))fail();
  if((e.bottom||e.top)&&!t.eligible)fail();
  const referenceYear=value.session>='2027-01-01' && value.operating_model?.policy==='HOLD_LAST_APPROVED_HEAD_2026_V1' && value.operating_model.parameter_year===2026 && value.operating_model.reference_year===2026 ? '2026' : value.session.slice(0,4);
  const n=g.normalization, refs=SIGNAL_REFERENCES[referenceYear];
  if(!refs)fail();
  if(t.reason!==undefined&&t.reason!==null&&typeof t.reason!=='string')fail();
  if(g.presentation_computed_at_utc!==undefined&&(!Number.isFinite(Date.parse(g.presentation_computed_at_utc))||Date.parse(g.presentation_computed_at_utc)<Date.parse(o.computed_at_utc)||Date.parse(g.presentation_computed_at_utc)>Date.now()+300000))fail();
  if(g.level==='UNAVAILABLE') {
    if(e.bottom||e.top||!['MISSING_REQUIRED_CONTEXT_INPUT'].includes(g.reason))fail();
    if(Object.values(value.scores).every(Number.isFinite))fail();
    if([...Object.values(value.inputs),value.references.vix,value.input_positions?.vix_rank].every(Number.isFinite))fail();
    return;
  }
  for(const side of ['bottom','top']) {
    const r=refs[side],s=value.scores[side],d=value.native_details?.[side];
    if(!d)fail();
    const u=Math.max(0,Math.min(1,(s-r.q50)/(r.q90-r.q50)));
    const x=Math.max(0,Math.min(1,(s-r.q90)/(1-r.q90)));
    if(!Number.isFinite(s)||n?.[side]?.q50!==r.q50||n[side].q90!==r.q90||d.threshold!==r.q90
      ||d.above_threshold!==(s>=r.q90)||e[side]&&s<r.q90
      ||n[side].native_score!==s||Math.abs(n[side].proximity-u)>1e-12||Math.abs(n[side].excess-x)>1e-12
      ||!Number.isFinite(n[side].proximity)||!Number.isFinite(n[side].excess)
      ||n[side].conditional_score!==(e[side]?(side==='bottom'?19-Math.floor(19*x+.5+1e-12):80+Math.floor(20*x+.5+1e-12)):(v3?Math.max(20,Math.min(79,Math.floor(50+(side==='bottom'?-30:30)*u+.5+1e-12))):(side==='bottom'?50-Math.floor(30*u+.5+1e-12):50+Math.floor(29*u+.5+1e-12))))
      ||!Array.isArray(d.block_reasons)||d.block_reasons.some(r=>typeof r!=='string'||!r)||e[side]&&(!d.above_threshold||d.vetoed||!d.shadow_new||d.block_reasons.length))fail();
  }
  const b=n.bottom,p=n.top,mixed=b.proximity>0&&p.proximity>0;
  const conflict=e.bottom&&e.top||!v3&&!e.bottom&&!e.top&&mixed;
  if(v3&&(!Number.isFinite(g.mixed_strength)||Math.abs(g.mixed_strength-Math.min(b.proximity,p.proximity))>1e-12))fail();
  if(g.mixed!==mixed&&! (e.bottom&&e.top))fail();
  if(conflict) {if(g.score!==null||g.level!=='CONFLICT'||v3&&g.reason!=='BOTH_ALERTS_TODAY')fail();return;}
  const expected=e.bottom?19-Math.floor(19*b.excess+.5+1e-12):e.top?80+Math.floor(20*p.excess+.5+1e-12):
    v3?Math.max(20,Math.min(79,Math.floor(50+30*(p.proximity-b.proximity)+.5+1e-12))):
    b.proximity>p.proximity?Math.max(20,50-Math.floor(30*b.proximity+.5+1e-12)):Math.min(79,50+Math.floor(29*p.proximity+.5+1e-12));
  if(g.score!==expected||v3&&g.reason!==((e.bottom||e.top)?'FINAL_MODEL_SIGNAL':mixed?'MIXED_DIRECTIONAL_CONTEXT':'MODEL_CONDITIONS'))fail();
}

export const REASONS={BELOW_Q90:'원점수 q90 미만',CNN_CONFIRMATION:'CNN 저점 확인 미충족',
  GAP_RECOVERY:'결측 후 첫 복귀일',QUARTER_LIMIT:'분기 원신호 2회 사용',COOLDOWN:'20거래일 간격 대기',
  MISSING_INPUT:'필수 입력 결측',LATE_RECEIPT_OR_DECISION:'다음 개장 전 수신·계산 마감 초과',
  LEGACY_OBSERVATION_ONLY:'이전 관찰 자료 · 당시 신호 미계산'};
