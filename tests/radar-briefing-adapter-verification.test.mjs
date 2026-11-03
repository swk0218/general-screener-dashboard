import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeRadar,fixturePassword,cutoff} from './fixtures/briefing-native.mjs';
import {sha256} from '../scripts/lib/briefing-input.mjs';
import {verifyRadarBriefingAdapter,runVerification} from '../scripts/verify-radar-briefing-adapter.mjs';

const options=value=>({raw:value.raw,status:value.status,expectedHash:sha256(value.raw),session:'2026-10-30',cutoff});
test('real adapter authenticates a public fixture without exporting native signal values',async()=>{
  const result=await verifyRadarBriefingAdapter(options(nativeRadar()),fixturePassword);
  assert.equal(result.authenticated,true);assert.equal(result.native_contract_validated,true);
  assert.equal(result.model_use_admitted,true);assert.equal(result.provider_calls,0);
  for(const key of ['market_state','snapshot','gauge','events','candidates','passphrase'])assert.equal(Object.hasOwn(result,key),false);
  assert.equal(JSON.stringify(result).includes(fixturePassword),false);
});
test('authenticated quarantine remains held',async()=>{
  const value=nativeRadar({state:'FAILED',failure:'REVISION_QUARANTINED'});
  const result=await verifyRadarBriefingAdapter(options(value),fixturePassword);
  assert.equal(result.authenticated,true);assert.equal(result.admission_status,'quarantined');assert.equal(result.model_use_admitted,false);
});
test('wrong password, wrong hash and not-yet-published data cannot produce a receipt',async()=>{
  const value=options(nativeRadar());
  await assert.rejects(verifyRadarBriefingAdapter(value,'WRONG_PUBLIC_FIXTURE'));
  await assert.rejects(verifyRadarBriefingAdapter({...value,expectedHash:'0'.repeat(64)},fixturePassword));
  await assert.rejects(verifyRadarBriefingAdapter({...value,cutoff:'2026-01-01T00:00:00Z'},fixturePassword));
});
test('disabled runner never reads files or a secret',async()=>{
  let reads=0;const env=new Proxy({}, {get(_t,key){reads++;throw Error('NO_SECRET_READ');}});
  await assert.rejects(runVerification([],env,()=>{throw Error('NO_FILE_READ');}));assert.equal(reads,0);
});
test('bad pinned plan is rejected before secret lookup',async()=>{
  const env={GITHUB_ACTIONS:'true',get DASHBOARD_PASSPHRASE(){throw Error('SECRET_MUST_NOT_BE_READ');}};
  await assert.rejects(runVerification(['--enable-readonly-runner-check','plan','raw','status'],env,async()=>'{"schema":"wrong"}'),/PLAN_CHANGED/);
});
test('correct plan with unbound ciphertext never reaches secret lookup',async()=>{
  const plan={schema:'radar_adapter_readonly_plan_v1',delivery_revision:'25dc04ab20593a3c48c45081faba88440284692c',
    cipher_sha256:'79f3a146d2c755157f130c929da221a6101bf4e0ac5f4e4f4b1ad21f1299c291',
    status_sha256:'f108f0931167aea21293634dfaa654ca3ab2910bcf5ad18c47d358d7f7ade554',session:'2026-11-02',cutoff:'2026-11-03T10:00:00Z'};
  const env={GITHUB_ACTIONS:'true',get DASHBOARD_PASSPHRASE(){throw Error('SECRET_MUST_NOT_BE_READ');}};
  const load=async path=>path==='plan'?JSON.stringify(plan):Buffer.from('{}');
  await assert.rejects(runVerification(['--enable-readonly-runner-check','plan','raw','status'],env,load),/BOUND_SOURCE_REQUIRED/);
});
