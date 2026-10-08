import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {bindStatus} from '../scripts/prepare-radar-status.mjs';
import {unavailableEngineStatus,validateEngineStatus,observationState} from '../src/features/radar/observation-status.js';
import {loadOptionalRadarDelivery} from '../src/features/radar/radar-envelope.js';
const feed=Buffer.from('TEST_ONLY_ENCRYPTED_FEED');
function sample(){return {...unavailableEngineStatus(),status:'DATED',source_session:'2026-10-06',expected_session:'2026-10-06',source_market_close_utc:'2026-10-06T20:00:00Z',input_admitted_at_utc:'2026-10-07T10:17:05Z',model_computed_at_utc:'2026-10-07T10:18:00Z',latest_attempt_at_utc:'2026-10-07T10:18:10Z',next_scheduled_at_utc:'2026-10-07T12:40:00Z',engine_result_id:'a'.repeat(64),feed_cipher_sha256:createHash('sha256').update(feed).digest('hex'),failure_code:null};}
test('build preparation preserves all source and model clocks, and exact feed binding',()=>{
  const value=sample(),prepared=bindStatus(value,feed);
  for(const key of ['source_session','expected_session','input_admitted_at_utc','model_computed_at_utc','latest_attempt_at_utc','engine_result_id'])assert.equal(prepared[key],value[key]);
  assert.throws(()=>bindStatus(value,Buffer.from('OTHER_TEST_ONLY_FEED')),/BINDING/);
  assert.throws(()=>validateEngineStatus({...value,schema_version:'other'}));
  assert.throws(()=>validateEngineStatus({...value,raw_provider_value:45}));
});
test('rebuild or publication time never promotes stale or failed engine data',()=>{
  const value=sample();
  Object.assign(value,{built_at_utc:'2026-10-08T01:00:00Z',published_at_utc:'2026-10-08T01:01:00Z',publication_receipt_result_id:value.engine_result_id});
  assert.equal(observationState(validateEngineStatus(value),Date.parse('2026-10-08T01:02:00Z')),'STALE');
  value.status='FAILED';assert.equal(observationState(value,Date.parse('2026-10-07T10:20:00Z')),'STALE');
  value.publication_receipt_result_id='b'.repeat(64);assert.throws(()=>validateEngineStatus(value),/BINDING/);
});
test('no-feed status requests no model; unavailable engine status may retain an existing dated feed',async(t)=>{
  const value=unavailableEngineStatus(),requests=[];
  t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return {ok:url==='/status',json:async()=>value};});
  assert.equal(await loadOptionalRadarDelivery('/status','/feed','TEST_ONLY'),null);
  assert.deepEqual(requests,['/status']);
  value.feed_cipher_sha256='c'.repeat(64);
  await assert.rejects(loadOptionalRadarDelivery('/status','/feed','TEST_ONLY'),/RADAR_UNAVAILABLE/);
  assert.equal(requests.at(-1),'/feed');
});
test('Pages contains no provider collection and publication receipt binds exact result/feed',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
  assert(!workflow.includes('radar-observation-status.py'));
  assert(!workflow.includes('financialmodelingprep'));
  assert(!workflow.includes('schedule:'));
  await assert.rejects(readFile(new URL('../scripts/radar-observation-status.py',import.meta.url)),{code:'ENOENT'});
  assert(workflow.includes('feed_cipher_sha256'));
  assert(workflow.includes('publication_receipt_result_id'));
  assert(workflow.includes("status['built_at_utc']"));
  assert(!workflow.includes("status['computed_at_utc']="));
});

test('runtime fetch rejects a rolling-deployment status/feed mismatch before decryption',async(t)=>{
  const value=sample();
  t.mock.method(globalThis,'fetch',async url=>url==='/status'?{ok:true,json:async()=>value}:{ok:true,arrayBuffer:async()=>new TextEncoder().encode('OTHER_TEST_ONLY_FEED').buffer});
  await assert.rejects(loadOptionalRadarDelivery('/status','/feed','TEST_ONLY'),/FEED_STATUS_BINDING_MISMATCH/);
});
