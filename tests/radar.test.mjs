import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_INPUTS, REFERENCE_INPUTS, validateRadarDelivery } from '../src/features/radar/radar-contract.js';
import { parseHashRoute, serializeHashRoute } from '../src/data/dashboard-model.js';

function fixture(score=50,level='Neutral',bottom=false,top=false) {
  return {schema_version:'frozen_radar_delivery_v1',model_version:'TEST_ONLY',session:'2026-03-12',evidence_ready:false,
    events:{bottom,top},active:{bottom:true,top:false},scores:{bottom:.95,top:.95},
    gauge:{score,level,mixed:true,reference_version:'TEST_ONLY'},
    inputs:Object.fromEntries(MODEL_INPUTS.map(([key])=>[key,null])),
    references:Object.fromEntries(REFERENCE_INPUTS.map(([key])=>[key,null]))};
}
test('Radar route stays separate from engine strategy routes',()=>{
  assert.equal(parseHashRoute('#/radar').view,'radar');
  assert.equal(serializeHashRoute({view:'radar'}),'#/radar');
});
test('Extreme equals actual same-day event; active state is independent',()=>{
  for(const [score,level,b,t] of [[0,'Extreme Low',true,false],[19,'Extreme Low',true,false],[80,'Extreme High',false,true],[100,'Extreme High',false,true],[20,'Low',false,false],[50,'Neutral',false,false],[79,'High',false,false]]) {
    assert.equal(validateRadarDelivery(fixture(score,level,b,t)).gauge.score,score);
  }
  assert.throws(()=>validateRadarDelivery(fixture(19,'Extreme Low')));
  assert.throws(()=>validateRadarDelivery(fixture(80,'Extreme High')));
  assert.throws(()=>validateRadarDelivery(fixture(50,'Neutral',true,false)));
});
test('conflicting issued signals have no scalar',()=>{
  assert.equal(validateRadarDelivery(fixture(null,'CONFLICT',true,true)).gauge.score,null);
  assert.throws(()=>validateRadarDelivery(fixture(50,'Neutral',true,true)));
});
test('missing or malformed input is never filled with neutral',()=>{
  const value=fixture(null,'UNAVAILABLE');
  assert.equal(validateRadarDelivery(value).gauge.score,null);
  delete value.inputs.cnn_rank;
  assert.throws(()=>validateRadarDelivery(value));
  const bad=fixture();bad.scores.bottom=NaN;
  assert.throws(()=>validateRadarDelivery(bad));
});
