import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_INPUTS, REFERENCE_INPUTS, validateRadarDelivery, FROZEN_MODEL_VERSION } from '../src/features/radar/radar-contract.js';
import { parseHashRoute, serializeHashRoute } from '../src/data/dashboard-model.js';
import { decryptRadarEnvelope,loadOptionalRadarDelivery } from '../src/features/radar/radar-envelope.js';
import {readFile} from 'node:fs/promises';
import { createCipheriv, pbkdf2Sync, randomBytes, createHash } from 'node:crypto';
import { inputGaugeCards,thresholdPosition,radarHeaderStatus } from '../src/features/radar/gauge-model.js';
import {validateObservationStatus,observationState} from '../src/features/radar/observation-status.js';
import {SIGNAL_REFERENCES,REFERENCE_HASH} from '../src/features/radar/signal-references.js';

async function createRadarTestServer() {
  const {createServer}=await import('vite');
  const {default:appConfig}=await import('../vite.config.mjs');
  return createServer({...appConfig,configFile:false,
    // React's plugin adds browser pre-bundles, so clear them after its config hook.
    plugins:[...appConfig.plugins,{name:'radar-ssr-test-only',enforce:'post',config(config) {
      config.optimizeDeps={noDiscovery:true,include:[]};
    }}],
    server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',logLevel:'error'});
}

test('SSR-only test servers do not start browser dependency scans or warmup',async()=>{
  const server=await createRadarTestServer();
  try {
    assert.equal(server.config.optimizeDeps.noDiscovery,true);
    assert.deepEqual(server.config.optimizeDeps.include,[]);
    assert.equal(server.environments.client.depsOptimizer,undefined);
    assert.equal(server.config.server.warmup?.clientFiles?.length||0,0);
    assert.equal(server.config.server.hmr,false);
    assert.equal(server.config.server.watch,null);
  } finally {await server.close();}
});


function dailyFixture(bottom=false,top=false,mixed=false) {
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

test('daily model validates real signal extremes, conflicts and precise independent display math',()=>{
  for(const args of [[true,false],[false,true],[true,true],[false,false,true],[false,false]]) {
    const v=dailyFixture(...args);assert.equal(validateRadarDelivery(v),v);
    for(const mutate of [x=>x.controller_evaluated=false,x=>x.gauge.normalization.bottom.q90=.9,
      x=>x.gauge.normalization.top.proximity=NaN,x=>x.gauge.normalization.bottom.conditional_score=1,
      x=>x.observation.historical_first_seen_claimed=true]) {
      const bad=structuredClone(v);mutate(bad);assert.throws(()=>validateRadarDelivery(bad));
    }
  }
  const event=dailyFixture(true,false);event.timing.eligible=false;
  assert.throws(()=>validateRadarDelivery(event));
  const blocked=dailyFixture(true,false);blocked.native_details.bottom.vetoed=true;
  assert.throws(()=>validateRadarDelivery(blocked));
});

function unavailableDailyFixture() {
  const v=dailyFixture();
  v.scores={bottom:null,top:null};v.inputs.cnn_rank=null;
  Object.assign(v.gauge,{score:null,level:'UNAVAILABLE',mixed:false,reason:'MISSING_REQUIRED_CONTEXT_INPUT'});
  delete v.gauge.normalization;delete v.native_details;
  return v;
}

test('mixed and dual-event results require complete inputs and provenance regardless of scalar availability',()=>{
  for(const args of [[false,false,true],[true,true],[true,false],[false,true],[false,false]]) {
    const value=dailyFixture(...args);
    const mutations=[...MODEL_INPUTS.map(([key])=>v=>{v.inputs[key]=null;}),
      v=>v.references.vix=null,v=>v.input_positions.vix_rank=null,v=>delete v.input_metadata,v=>delete v.input_positions,
      v=>delete v.native_details,v=>delete v.observation.source_receipts,
      v=>delete v.observation.source_hashes,
      ...MODEL_INPUTS.map(([key])=>v=>{delete v.input_metadata[key];}),
      v=>v.input_metadata.cnn_rank.source_date='2026-03-11',
      v=>v.input_metadata.cnn_rank.source='',v=>v.input_metadata.cnn_rank.received_at_utc='2026-03-14T10:00:00Z',
      v=>v.inputs.cnn_rank=1.01,v=>v.inputs.cnn_score=101,v=>v.references.vix=0,v=>v.observation.latest_session_input_missing='VIX',
      v=>v.native_details.bottom.block_reasons=[{}]];
    for(const mutate of mutations) {
      const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateRadarDelivery(bad));
    }
  }
  const partial=unavailableDailyFixture();delete partial.input_metadata;
  assert.throws(()=>validateRadarDelivery(partial));
});

test('Extreme requires the actual native score to meet sealed q90, never a supplied flag',()=>{
  for(const side of ['bottom','top']) {
    const value=dailyFixture(side==='bottom',side==='top');
    for(const score of [0,SIGNAL_REFERENCES['2026'][side].q90-1e-12]) {
      const bad=structuredClone(value),r=SIGNAL_REFERENCES['2026'][side];
      bad.scores[side]=score;
      Object.assign(bad.gauge.normalization[side],{native_score:score,
        proximity:Math.max(0,Math.min(1,(score-r.q50)/(r.q90-r.q50))),excess:0});
      // Keep every displayed value consistent with the old mapping; only the native event is false.
      assert.equal(bad.native_details[side].above_threshold,true);
      assert.throws(()=>validateRadarDelivery(bad));
    }
    assert.equal(validateRadarDelivery(value),value); // exact q90 equality is valid
    const wrongFlag=dailyFixture();wrongFlag.native_details[side].above_threshold=true;
    assert.throws(()=>validateRadarDelivery(wrongFlag));
  }
});

test('unavailable packets without native details render safely and explain missing inputs',async()=>{
  const value=unavailableDailyFixture();value.observation.source_market_close_utc='2026-03-12T20:00:00Z';assert.equal(validateRadarDelivery(value),value);
  const server=await createRadarTestServer();
  try {
    const {RadarView}=await server.ssrLoadModule('/src/features/radar/RadarView.jsx');
    const {createElement}=await import('react');
    const {renderToStaticMarkup}=await import('react-dom/server');
    for(const packet of [value,null,{...value,native_details:{bottom:null}},{...value,gauge:{...value.gauge,reason:{}}},dailyFixture(false,false,true),dailyFixture(true,true)]) {
      const html=renderToStaticMarkup(createElement(RadarView,{delivery:packet}));
      assert.match(html,/시장 신호 \(Beta\)/);
      if(packet===value){assert.match(html,/계산 불가 · 필수 입력 결측/);assert.match(html,/03\. 13\. 05:00 KST/);}
      if(packet?.gauge?.mixed_strength===1&&packet.events.bottom===false)assert.match(html,/양방향 조건 강함/);
      if(packet?.events?.bottom&&packet.events.top)assert.match(html,/양방향 경보 충돌/);
    }
  } finally {await server.close();}
});

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
// Synthetic legacy contract fixture, independent of deploy-time status conversion.
function legacyObservationStatusFixture(){return {schema_version:'radar_observation_status_v1',mode:'OBSERVATION_BETA',decision:'NO_SIGNAL',evidence_ready:false,
    model_score:null,events:{bottom:false,top:false},status:'OBSERVED_NO_SIGNAL',model_policy:'close90_v1_unchanged',collection_policy:'next_open_observation_only',historical_first_seen_claimed:false,
    market_close_utc:'2026-10-02T20:00:00Z',next_open_utc:'2026-10-05T13:30:00Z',computed_at_utc:'2026-10-03T10:00:10Z',next_scheduled_at_utc:'2026-10-06T10:00:00Z',
    source_market_close_utc:'2026-10-02T20:00:00Z',provider_updated_at_utc:'2026-10-02T23:59:58Z',first_seen_at_utc:'2026-10-03T10:00:00Z',received_at_utc:'2026-10-03T10:00:00Z',built_at_utc:null,published_at_utc:null,source_session:'2026-10-02'};}

test('daily status always remains NO_SIGNAL and expires at next open',()=>{
  const value=legacyObservationStatusFixture();
  assert.equal(validateObservationStatus(value),value);
  assert.equal(observationState(value,Date.parse('2026-10-04T10:00:00Z')),'OBSERVED_NO_SIGNAL');
  assert.equal(observationState(value,Date.parse(value.next_open_utc)),'STALE');
  for(const mutate of [v=>v.events.bottom=true,v=>v.decision='ALERT',v=>v.model_score=50,v=>v.first_seen_at_utc='2026-10-04T10:00:00Z']) {
    const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateObservationStatus(bad));
  }
});
test('observation-only configuration never requests an absent model feed',async(t)=>{
  const status=legacyObservationStatusFixture();
  // This case models an absent feed, even after a real feed has been published.
  status.score_delivery_available=false;
  const requested=[];
  t.mock.method(globalThis,'fetch',async url=>{
    requested.push(url);assert.equal(url,'/status');return {ok:true,json:async()=>status};
  });
  assert.equal(await loadOptionalRadarDelivery('/status','/model-feed','TEST_ONLY_NOT_REAL'),null);
  assert.deepEqual(requested,['/status']);
});
test('published observation configuration requests the encrypted model feed',async(t)=>{
  const status=legacyObservationStatusFixture();
  status.score_delivery_available=true;
  const requested=[];
  t.mock.method(globalThis,'fetch',async url=>{
    requested.push(url);return url==='/status'?{ok:true,json:async()=>status}:{ok:false};
  });
  await assert.rejects(loadOptionalRadarDelivery('/status','/model-feed','TEST_ONLY_NOT_REAL'),/RADAR_UNAVAILABLE/);
  assert.deepEqual(requested,['/status','/model-feed']);
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


test('v3 keeps a scalar for weak and strong mixed context and reserves conflict for both final alerts',()=>{
  for(const [b,t,score] of [[.001,.002,50],[.5,.5,50],[1,1,50],[.5,.501,50],[.501,.5,50],[.9,.1,26],[.1,.9,74]]) {
    const v=dailyFixture(false,false,true);v.gauge.score=score;v.gauge.level=score<40?'Low':score<60?'Neutral':'High';v.gauge.mixed_strength=Math.min(b,t);
    for(const [side,u] of [['bottom',b],['top',t]]) {
      const r=SIGNAL_REFERENCES['2026'][side],s=r.q50+u*(r.q90-r.q50);v.scores[side]=s;
      Object.assign(v.gauge.normalization[side],{native_score:s,proximity:u,conditional_score:Math.max(20,Math.min(79,Math.floor(50+(side==='bottom'?-30:30)*u+.5+1e-12)))});
      v.native_details[side].above_threshold=s>=r.q90;
    }
    assert.equal(validateRadarDelivery(v).gauge.score,score);
    const hidden=structuredClone(v);hidden.gauge.score=null;hidden.gauge.level='CONFLICT';assert.throws(()=>validateRadarDelivery(hidden));
  }
  const legacy=dailyFixture(false,false,true);legacy.gauge.presentation_version='marketradar-signal-distance-v2';legacy.gauge.score=null;legacy.gauge.level='CONFLICT';
  assert.equal(validateRadarDelivery(legacy),legacy); // immutable historical v2 envelopes remain readable
});


test('missing VIX rank makes calculation unavailable even when other scalar inputs are present',()=>{
  const v=unavailableDailyFixture();v.inputs.cnn_rank=.5;v.input_positions.vix_rank=null;
  assert.equal(validateRadarDelivery(v),v);
  v.input_positions.vix_rank=.5;assert.throws(()=>validateRadarDelivery(v));
});

test('dial endpoints and every band boundary have one accurate needle; unavailable has none',async()=>{
  const server=await createRadarTestServer();
  try {
    const {MarketGauge}=await server.ssrLoadModule('/src/features/radar/MarketGauge.jsx');
    const {createElement}=await import('react');
    const {renderToStaticMarkup}=await import('react-dom/server');
    for(const score of [0,19,20,39,40,59,60,79,80,100]) {
      const html=renderToStaticMarkup(createElement(MarketGauge,{score,level:'TEST_ONLY'}));
      assert.match(html,new RegExp(`aria-valuenow="${score}"`));
      assert.equal((html.match(/radar-dial-band is-current/g)||[]).length,1);
      assert.ok(html.includes(`rotate(${score*1.8-90}deg)`));
    }
    for(const score of [null,undefined,NaN,-1,101,19.5]) {
      const html=renderToStaticMarkup(createElement(MarketGauge,{score}));
      assert.doesNotMatch(html,/aria-valuenow|radar-dial-needle|is-current/);
    }
  } finally {await server.close();}
});

test('redesigned information hierarchy preserves conflict, stale, missing and raw-input distinctions',async()=>{
  const server=await createRadarTestServer();
  try {
    const {RadarView}=await server.ssrLoadModule('/src/features/radar/RadarView.jsx');
    const {createElement}=await import('react');
    const {renderToStaticMarkup}=await import('react-dom/server');
    const render=value=>renderToStaticMarkup(createElement(RadarView,{delivery:value}));
    const mixed=dailyFixture(false,false,true),before=structuredClone(mixed);
    const html=render(mixed);
    assert.match(html,/aria-valuenow="50"/);
    assert.match(html,/중립 구간<\/strong>입니다/);
    assert.doesNotMatch(html,/DATED_OBSERVATION|MIXED_DIRECTIONAL_CONTEXT|자료 상태 \/ 표시 사유/);
    assert.match(html,/양방향 조건 강함/);
    assert.match(html,/RSI \(14\)/);
    assert.ok(html.indexOf('시장 전환 지수')<html.indexOf('저점·고점 경보'));
    assert.ok(html.indexOf('>구성 지표</h2>')<html.indexOf('>보조 지표</h2>'));
    assert.match(html,/>보조 지표<\/h2>/);assert.match(html,/>구성 지표<\/h2>/);
    assert.doesNotMatch(html,/시장 보조 지표|시장 전환 구성 지표/);
    assert.equal((html.match(/<dt>낮을수록<\/dt>/g)||[]).length,2);
    assert.equal((html.match(/<dt>높을수록<\/dt>/g)||[]).length,2);
    assert.equal((html.match(/<dt>음수일 때<\/dt>/g)||[]).length,3);
    assert.equal((html.match(/<dt>양수일 때<\/dt>/g)||[]).length,3);
    assert.match(html,/<dt>0일 때<\/dt><dd>예상 변동성과 실제 변동성이 같음/);
    assert.match(html,/최근 20일 변동성의 역사적 크기/);
    assert.match(html,/하락 확률은 아닙니다/);
    assert.match(html,/원점수 \/ q90/);assert.match(html,/저점 공포 지표/);
    assert.equal((html.match(/class="radar-threshold-track"/g)||[]).length,2);
    for(const side of ['bottom','top']) {
      assert.ok(html.includes(`aria-valuenow="${mixed.scores[side]}"`));
      assert.ok(html.includes(`left:${mixed.native_details[side].threshold*100}%`));
    }
    assert.deepEqual(mixed,before);
    const activeHtml=render(dailyFixture(true,false));
    assert.equal((activeHtml.match(/role="alert"/g)||[]).length,1);
    assert.match(activeHtml,/radar-alert-outcome is-issued/);
    assert.match(activeHtml,/radar-headline is-alert/);
    assert.match(html,/radar-headline is-normal/);
    const sourceTransitionHold=dailyFixture();
    sourceTransitionHold.timing.eligible=false;
    sourceTransitionHold.timing.reason='SOURCE_TRANSITION_LATE_OBSERVATION';
    for(const side of ['bottom','top'])sourceTransitionHold.native_details[side].block_reasons=['SOURCE_TRANSITION_LATE_OBSERVATION'];
    const hiddenStatusHtml=render(sourceTransitionHold);
    assert.doesNotMatch(hiddenStatusHtml,/SOURCE_TRANSITION_LATE_OBSERVATION|추가 확인 필요|마감 충족|차단 없음|경보 제한/);
    const timingOnlyHold=structuredClone(sourceTransitionHold);
    for(const side of ['bottom','top'])timingOnlyHold.native_details[side].block_reasons=['BELOW_Q90'];
    assert.doesNotMatch(render(timingOnlyHold),/경보 제한/);
    const firstInput=html.slice(html.indexOf('data-input="cnn_rank"'));
    assert.ok(firstInput.indexOf('radar-input-label')<firstInput.indexOf('radar-card-value'));
    assert.ok(firstInput.indexOf('radar-card-value')<firstInput.indexOf('radar-input-position'));
    assert.ok(firstInput.indexOf('radar-input-position')<firstInput.indexOf('radar-input-meaning'));
    assert.doesNotMatch(html,/radar-reference-rank/);
    const stale=dailyFixture(true,false);stale.gauge.data_status='DATED_STALE_OBSERVATION';
    stale.observation.expected_session='2026-03-13';stale.observation.latest_session_input_missing=['VIX'];
    const staleHtml=render(stale);assert.doesNotMatch(staleHtml,/role="alert"/);
    assert.match(staleHtml,/03.12 Updated/);assert.match(staleHtml,/과거 기준일 발생/);
    Object.assign(stale.observation,{latest_session_input_missing:[],collection_status:'FAILED_RETAINED_DATED',
      failure_code:'SOURCE_FETCH_FAILED',last_attempt_at_utc:new Date().toISOString()});
    const failedHtml=render(stale);
    assert.match(failedHtml,/03.12 Updated/);
    assert.doesNotMatch(failedHtml,/일부 미확보/);
    for(const v of [null,unavailableDailyFixture(),dailyFixture(true,true)]) {
      const output=render(v);assert.doesNotMatch(output,/class="radar-dial-needle"/);
      if(!v||v.gauge.level==='UNAVAILABLE')assert.doesNotMatch(output,/>제한 없음<|>유지 중<|radar-threshold-track/);
    }
  } finally {await server.close();}
});


test('Overview score uses the Radar contract and preserves invalid, stale, mixed and conflicting states',async()=>{
  const server=await createRadarTestServer();
  try {
    const {RadarSummary}=await server.ssrLoadModule('/src/features/radar/RadarSummary.jsx');
    const {createElement}=await import('react');
    const {renderToStaticMarkup}=await import('react-dom/server');
    const render=value=>renderToStaticMarkup(createElement(RadarSummary,{delivery:value}));
    for(const args of [[false,false],[true,false],[false,true],[false,false,true]]) {
      const v=dailyFixture(...args),before=structuredClone(v),html=render(v);
      assert.ok(html.includes(`<strong>${v.gauge.score}</strong>`));
      assert.ok(html.includes(v.session));
      assert.deepEqual(v,before);
      assert.match(html,args[0]||args[1]?/radar-headline is-alert/:/radar-headline is-normal/);
      if(!args[0]&&!args[1]&&!args[2])assert.match(html,/중립 구간<\/strong>입니다/);
      assert.match(html,/지수 자세히/);
      if(args[2])assert.match(html,/양방향 조건 강함/);
    }
    const both=render(dailyFixture(true,true));
    assert.match(both,/양방향 경보 충돌/);assert.match(both,/<strong>—<\/strong>/);
    const invalid=dailyFixture(true,false);invalid.scores.bottom=0;
    for(const v of [null,{},invalid,unavailableDailyFixture()]) {
      const html=render(v);assert.match(html,/계산 불가/);assert.match(html,/경보 미계산/);
      assert.match(html,/<strong>—<\/strong>/);assert.match(html,/radar-headline is-unavailable/);assert.doesNotMatch(html,/radar-headline is-alert|Neutral|Extreme Low|NaN/);
    }
    const stale=dailyFixture(true,false);stale.gauge.data_status='DATED_STALE_OBSERVATION';
    Object.assign(stale.observation,{expected_session:'2026-03-13',latest_session_input_missing:['VIX']});
    const html=render(stale);assert.doesNotMatch(html,/갱신 지연/);
    assert.match(html,/저점 경보/);assert.match(html,/03.12 Updated/);
  } finally {await server.close();}
});
