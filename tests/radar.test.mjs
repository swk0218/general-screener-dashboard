import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_INPUTS, REFERENCE_INPUTS, validateRadarDelivery, FROZEN_MODEL_VERSION } from '../src/features/radar/radar-contract.js';
import { parseHashRoute, serializeHashRoute } from '../src/data/dashboard-model.js';
import { decryptRadarEnvelope,loadOptionalRadarDelivery } from '../src/features/radar/radar-envelope.js';
import {readFile} from 'node:fs/promises';
import { createCipheriv, pbkdf2Sync, randomBytes, createHash } from 'node:crypto';
import { inputGaugeCards,thresholdPosition,radarHeaderStatus } from '../src/features/radar/gauge-model.js';
import {validateObservationStatus,observationState} from '../src/features/radar/observation-status.js';

function fixture(score=50,level='Neutral',bottom=false,top=false) {
  return {schema_version:'frozen_radar_delivery_v1',model_version:FROZEN_MODEL_VERSION,session:'2026-03-12',evidence_ready:false,operating_status:'REPLAY_NO_FORWARD_ISSUE',
    events:{bottom,top},active:{bottom:true,top:false},scores:{bottom:score===null?null:.95,top:score===null?null:.95},
    gauge:{score,level,mixed:true,reference_version:'TEST_ONLY'},
    inputs:Object.fromEntries(MODEL_INPUTS.map(([key])=>[key,null])),
    references:Object.fromEntries(REFERENCE_INPUTS.map(([key])=>[key,null]))};
}

test('input gauges use natural scales or verified ranks without inventing VIX bounds',()=>{
 const data=fixture();data.inputs.cnn_score=31.1714285714286;data.inputs.cnn_rank=.26;
 data.inputs.return20_risk=-.04;data.inputs.trend200_risk=.69;data.inputs.RV20_rank=.34;data.inputs.log_implied_realized=.37;
 data.references.vix=16.04;data.references.rsi14=50.246;
 const cards=inputGaugeCards(data);
 assert.equal(cards.model.length,5);assert.equal(cards.reference.length,3);
 assert.equal(cards.model[0].position,26);assert.equal(cards.model[1].position,null);assert.equal(cards.model[2].position,null);assert.equal(cards.model[4].position,null);
 assert.equal(cards.reference[0].position,data.inputs.cnn_score);assert.equal(cards.reference[1].position,null);assert.equal(cards.reference[1].value,16.04);
 assert.equal(cards.reference[2].position,50.246);
 data.input_positions={version:'frozen-input-prior-midrank-v1',window_sessions:252,minimum_valid:126,excludes_current:true,vix_rank:.42};
 assert.equal(inputGaugeCards(validateRadarDelivery(data)).reference[1].position,42);
 data.input_positions.version='synthetic';assert.throws(()=>validateRadarDelivery(data));
 assert.equal(inputGaugeCards(data).reference[1].position,null);
});
test('UI-only prior ranks require counts, current source match and sealed reference metadata',()=>{
 const data=fixture();data.references.vix=16.04;data.inputs.return20_risk=-1;data.inputs.trend200_risk=2;data.inputs.log_implied_realized=.7;
 data.input_positions={version:'frozen-input-prior-midrank-v2',window_sessions:252,minimum_valid:126,excludes_current:true,
 date:data.session,session:500,ui_only:true,reference_window_sha256:'a'.repeat(64),
 source_values:{VIX:16.04,return20_risk:-1,trend200_risk:2,log_implied_realized:.7},
 valid_counts:{vix_rank:252,return20_risk_rank:252,trend200_risk_rank:126,log_implied_realized_rank:252},
 vix_rank:.1,return20_risk_rank:0,trend200_risk_rank:1,log_implied_realized_rank:.5};
 const cards=inputGaugeCards(validateRadarDelivery(data));
 assert.equal(cards.reference[1].position,10);assert.equal(cards.reference[1].value,16.04);
 assert.equal(cards.model[1].position,0);assert.equal(cards.model[2].position,100);assert.equal(cards.model[4].position,50);
 for(const mutate of [p=>p.valid_counts.return20_risk_rank=125,p=>p.source_values.VIX=15,p=>p.date='2026-03-11',p=>p.ui_only=false,p=>p.trend200_risk_rank=1.1,p=>delete p.return20_risk_rank]) {
   const bad=structuredClone(data);mutate(bad.input_positions);assert.throws(()=>validateRadarDelivery(bad));
 }
 data.input_positions.return20_risk_rank=null;assert.equal(inputGaugeCards(validateRadarDelivery(data)).model[1].position,null);
 assert.equal(data.events.bottom,false);assert.equal(data.gauge.score,50);
});
test('native threshold position is descriptive and never derives warnings',()=>{
 assert.deepEqual(thresholdPosition(.5,.5),{score:50,threshold:50,delta:0,above:true});
 assert.equal(thresholdPosition(.9,null),null);
 assert.equal(thresholdPosition(1.1,.9),null);
 const data=fixture();data.operating_status='REPLAY_NO_FORWARD_ISSUE';
 assert.deepEqual(radarHeaderStatus(data),{date:'2026-03-12',label:'Radar 기준',status:'동결 연구',tone:'is-hold'});
 assert.equal(radarHeaderStatus(null).status,'자료 없음');
 data.operating_status='SHADOW';data.gauge.data_status='CACHED_STALE';assert.equal(radarHeaderStatus(data).status,'과거 자료');
 assert.equal(data.events.bottom,false);
});
test('Radar route stays separate from engine strategy routes',()=>{
  assert.equal(parseHashRoute('#/radar').view,'radar');
  assert.equal(serializeHashRoute({view:'radar'}),'#/radar');
});
test('unverified hold cannot issue events or display a signal gauge',()=>{
  for(const status of ['DATA_HOLD','NO_SIGNAL','SHADOW',undefined]) {
    const bad=fixture(0,'Extreme Low',true,false);bad.operating_status=status;
    assert.throws(()=>validateRadarDelivery(bad));
    const good=fixture(null,'UNAVAILABLE');good.operating_status=status;
    assert.equal(validateRadarDelivery(good).gauge.score,null);
  }
});
test('dated observation permits numbers but can never impersonate evaluated controllers or Extreme',()=>{
  const value=fixture(43,'Neutral');
  Object.assign(value,{operating_status:'OBSERVATION_COMPUTED',observation_only:true,controller_evaluated:false,
    active:{bottom:null,top:null},observation:{computed_at_utc:new Date().toISOString(),first_seen_at_utc:'2026-03-13T10:00:00Z',expected_session:value.session,policy:'SCORE_ONLY_NO_OPERATIONAL_ALERT',historical_first_seen_claimed:false,
      source_hashes:Object.fromEntries(['CNN','SPY','VIX'].map(s=>[s,'a'.repeat(64)])),
      source_receipts:Object.fromEntries(['CNN','SPY','VIX'].map(s=>[s,{raw_sha256:'a'.repeat(64),observation_date:value.session,received_at_utc:'2026-03-13T10:00:00Z'}]))},
    verification:{schema:'dated_observation_math_v1',immutable_panel_sha256:'73cf8db960ccee52b11adce0a39ea2789197bb997ca039fcf8d2d8c5a827f5d8',independent_features:true,raw_hashes_bound:true,exact_session_inputs:true,model_seal_verified:true,controller_evaluated:false,feature_tolerance:1e-12}});
  value.gauge.data_status='DATED_OBSERVATION';
  value.inputs=Object.fromEntries(MODEL_INPUTS.map(([k])=>[k,.5]));value.references={vix:16,rsi14:50};
  value.input_positions={version:'frozen-input-prior-midrank-v1',window_sessions:252,minimum_valid:126,excludes_current:true,vix_rank:.5};
  value.input_metadata=Object.fromEntries([...MODEL_INPUTS,...REFERENCE_INPUTS].map(([k])=>[k,{source:'TEST_ONLY',source_date:value.session,status:'DATED_OBSERVATION_NOT_ALERT',received_at_utc:'2026-03-13T10:00:00Z'}]));
  value.native_details={bottom:{threshold:.9,vetoed:null},top:{threshold:.9,vetoed:null}};
  assert.equal(validateRadarDelivery(value).gauge.score,43);
  const retained=structuredClone(value);
  Object.assign(retained.observation,{expected_session:'2026-03-13',collection_status:'FAILED_RETAINED_DATED',failure_code:'SOURCE_FETCH_FAILED',last_attempt_at_utc:new Date().toISOString()});
  retained.gauge.data_status='DATED_STALE_OBSERVATION';
  assert.equal(validateRadarDelivery(retained).gauge.score,43);
  for(const mutation of [v=>v.observation.failure_code='raw provider error',v=>v.observation.last_attempt_at_utc='invalid']) {
    const bad=structuredClone(retained);mutation(bad);assert.throws(()=>validateRadarDelivery(bad));
  }
  for(const mutate of [v=>v.events.bottom=true,v=>v.active.top=true,v=>v.evidence_ready=true,
    v=>v.controller_evaluated=true,v=>v.observation_only=false,v=>v.gauge.score=19,v=>v.gauge.score=80,
    v=>v.operating_status='DATA_HOLD',v=>v.observation.historical_first_seen_claimed=true,
    v=>v.inputs.cnn_rank=null,v=>delete v.verification,v=>delete v.input_metadata,
    v=>delete v.observation.source_receipts,v=>v.observation.source_hashes.SPY='b'.repeat(64),
    v=>delete v.observation.computed_at_utc,v=>v.observation.computed_at_utc='invalid',
    v=>v.observation.computed_at_utc=new Date(Date.now()+600000).toISOString(),
    v=>{v.observation.expected_session='2026-99-99';v.gauge.data_status='DATED_STALE_OBSERVATION';}]) {
    const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateRadarDelivery(bad));
  }
});
test('daily status always remains NO_SIGNAL and expires at next open',()=>{
  const value={schema_version:'radar_observation_status_v1',mode:'OBSERVATION_BETA',decision:'NO_SIGNAL',evidence_ready:false,
    model_score:null,events:{bottom:false,top:false},status:'OBSERVED_NO_SIGNAL',model_policy:'close90_v1_unchanged',collection_policy:'next_open_observation_only',historical_first_seen_claimed:false,
    market_close_utc:'2026-10-02T20:00:00Z',next_open_utc:'2026-10-05T13:30:00Z',computed_at_utc:'2026-10-03T10:00:10Z',next_scheduled_at_utc:'2026-10-06T10:00:00Z',
    source_market_close_utc:'2026-10-02T20:00:00Z',provider_updated_at_utc:'2026-10-02T23:59:58Z',first_seen_at_utc:'2026-10-03T10:00:00Z',received_at_utc:'2026-10-03T10:00:00Z',built_at_utc:null,published_at_utc:null,source_session:'2026-10-02'};
  assert.equal(validateObservationStatus(value),value);
  assert.equal(observationState(value,Date.parse('2026-10-04T10:00:00Z')),'OBSERVED_NO_SIGNAL');
  assert.equal(observationState(value,Date.parse(value.next_open_utc)),'STALE');
  for(const mutate of [v=>v.events.bottom=true,v=>v.decision='ALERT',v=>v.model_score=50,v=>v.first_seen_at_utc='2026-10-04T10:00:00Z']) {
    const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateObservationStatus(bad));
  }
});
test('observation-only configuration never requests an absent model feed',async(t)=>{
  const status=JSON.parse(await readFile(new URL('../public/data/radar-observation.json',import.meta.url),'utf8'));
  const requested=[];
  t.mock.method(globalThis,'fetch',async url=>{
    requested.push(url);assert.equal(url,'/status');return {ok:true,json:async()=>status};
  });
  assert.equal(await loadOptionalRadarDelivery('/status','/model-feed','TEST_ONLY_NOT_REAL'),null);
  assert.deepEqual(requested,['/status']);
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
  assert.throws(()=>validateRadarDelivery({...fixture(),model_version:'0'.repeat(64)}));
});

test('optional Radar envelope rejects plaintext, altered KDF and extra keys',async()=>{
  for(const value of [fixture(),{envelope_version:'market_radar_encrypted_v1',iterations:1},
    {envelope_version:'market_radar_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,raw:'forbidden'}]) {
    await assert.rejects(()=>decryptRadarEnvelope(value,'TEST_ONLY_PASSWORD'));
  }
});

test('Radar authenticates ciphertext, password and payload digest',async()=>{
  const passphrase='TEST_ONLY_NOT_A_REAL_PASSWORD';
  const payload=fixture();const plaintext=Buffer.from(JSON.stringify(payload));
  const salt=randomBytes(16),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(passphrase,salt,600000,32,'sha256'),iv);
  cipher.setAAD(Buffer.from('market_radar_v1'));
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
  const envelope={envelope_version:'market_radar_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
    salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),payload_hash:createHash('sha256').update(plaintext).digest('hex')};
  assert.deepEqual(await decryptRadarEnvelope(envelope,passphrase),payload);
  await assert.rejects(()=>decryptRadarEnvelope(envelope,'TEST_ONLY_WRONG_PASSWORD'));
  await assert.rejects(()=>decryptRadarEnvelope({...envelope,payload_hash:'0'.repeat(64)},passphrase));
  ciphertext[0]^=1;
  await assert.rejects(()=>decryptRadarEnvelope({...envelope,ciphertext:ciphertext.toString('base64')},passphrase));
});
