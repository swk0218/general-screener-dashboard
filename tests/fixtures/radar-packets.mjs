// Invented packets shared by Node and browser regressions.
import {MODEL_INPUTS,REFERENCE_INPUTS,FROZEN_MODEL_VERSION} from '../../src/features/radar/radar-contract.js';
import {SIGNAL_REFERENCES,REFERENCE_HASH} from '../../src/features/radar/signal-references.js';

export function dailyFixture(bottom=false,top=false,mixed=false) {
  const v=fixture(null,'CONFLICT',bottom,top),time='2026-03-13T10:00:00Z';
  Object.assign(v,{operating_status:'DAILY_MODEL_COMPUTED',observation_only:false,controller_evaluated:true,
    observation:{computed_at_utc:time,first_seen_at_utc:time,expected_session:v.session,
      policy:'DAILY_NEXT_OPEN_MINUS_30M_V1',historical_first_seen_claimed:false,
      source_hashes:Object.fromEntries(['CNN','SPY','VIX'].map(s=>[s,'a'.repeat(64)])),
      source_receipts:Object.fromEntries(['CNN','SPY','VIX'].map(s=>[s,{raw_sha256:'a'.repeat(64),observation_date:v.session,received_at_utc:time}]))},
    timing:{policy:'DAILY_NEXT_OPEN_MINUS_30M_V1',eligible:true,reason:null,decision_at_utc:time,deadline_utc:'2026-03-13T13:00:00Z'},
    verification:{schema:'daily_model_math_v2',immutable_panel_sha256:'73cf8db960ccee52b11adce0a39ea2789197bb997ca039fcf8d2d8c5a827f5d8',independent_features:true,raw_hashes_bound:true,exact_session_inputs:true,model_seal_verified:true,controller_evaluated:true,feature_tolerance:1e-12}});
  v.inputs=Object.fromEntries(MODEL_INPUTS.map(([k])=>[k,.5]));v.references={vix:16,rsi14:50};
  v.input_positions={version:'frozen-input-prior-midrank-v1',window_sessions:252,minimum_valid:126,excludes_current:true,vix_rank:.5};
  v.input_metadata=Object.fromEntries([...MODEL_INPUTS,...REFERENCE_INPUTS].map(([k])=>[k,{source:'TEST_ONLY',source_date:v.session,status:'DAILY_MODEL_INPUT',received_at_utc:time}]));
  v.native_details={};v.gauge={score:null,level:'CONFLICT',mixed:bottom&&top||mixed,
    reference_version:REFERENCE_HASH,presentation_version:'marketradar-signal-distance-v3',mixed_strength:bottom&&top||mixed?1:0,data_status:'DATED_OBSERVATION',
    reason:bottom&&top?'BOTH_ALERTS_TODAY':(bottom||top)?'FINAL_MODEL_SIGNAL':mixed?'MIXED_DIRECTIONAL_CONTEXT':'MODEL_CONDITIONS',normalization:{}};
  for(const side of ['bottom','top']) {
    const r=SIGNAL_REFERENCES['2026'][side],event=v.events[side],high=event||mixed;
    v.scores[side]=high?r.q90:0;
    v.native_details[side]={threshold:r.q90,vetoed:false,above_threshold:high,shadow_new:event,block_reasons:event?[]:['BELOW_Q90']};
    v.gauge.normalization[side]={...r,native_score:v.scores[side],proximity:high?1:0,excess:0,
      conditional_score:event?(side==='bottom'?19:80):high?(side==='bottom'?20:79):50};
  }
  if(!(bottom&&top))Object.assign(v.gauge,{score:bottom?19:top?80:50,level:bottom?'Extreme Low':top?'Extreme High':'Neutral'});
  return v;
}

export function fixture(score=50,level='Neutral',bottom=false,top=false) {
  return {schema_version:'frozen_radar_delivery_v1',model_version:FROZEN_MODEL_VERSION,session:'2026-03-12',evidence_ready:false,operating_status:'REPLAY_NO_FORWARD_ISSUE',
    events:{bottom,top},active:{bottom:true,top:false},scores:{bottom:score===null?null:.95,top:score===null?null:.95},
    gauge:{score,level,mixed:true,reference_version:'TEST_ONLY'},
    inputs:Object.fromEntries(MODEL_INPUTS.map(([key])=>[key,null])),
    references:Object.fromEntries(REFERENCE_INPUTS.map(([key])=>[key,null]))};
}
