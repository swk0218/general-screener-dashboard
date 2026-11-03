import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipelineFixture } from './fixtures/briefing-pipeline.mjs';
import { encryptEnvelope } from '../src/crypto/envelope.js';
import { nativeInput, nativeArchive, nativeRadar, fixturePassword, cutoff } from './fixtures/briefing-native.mjs';
import { sha256, readScreeningArchive, readRadarSource, normalizeSources } from '../scripts/lib/briefing-input.mjs';
import { objectHash } from '../scripts/lib/briefing-input.mjs';
import { ARTIFACT_KIND, encryptBriefingArtifact, readBriefingArtifact, loadBriefingArtifact, loadBriefingDelivery } from '../src/features/briefing/briefing-artifact.js';
import { sealBriefingArtifact, rollbackBriefingArtifact, writeBriefingDeliveryStatus } from '../scripts/seal-briefing-artifact.mjs';
const python = process.env.BRIEFING_TEST_PYTHON;
const backend = process.env.BRIEFING_TEST_BACKEND;

test('validated rule identity permits changes across run commits; changed rules remain incomparable', () => {
  const native=nativeArchive();
  const packet=JSON.parse(native.raw.toString('utf8'));
  const payload=JSON.parse(packet.payload_json);
  payload.runs.forEach((run,index)=>{run.sha=String(index+1).repeat(40);});
  packet.payload_json=JSON.stringify(payload);packet.payload_sha256=sha256(packet.payload_json);
  packet.engine_contracts={};
  for (const run of payload.runs) {
    const rule={strategy:run.strategy,strategy_version:'fixed-contract-v1',rule_hash:'a'.repeat(16),implementation_hash:'c'.repeat(64)};
    packet.engine_contracts[`${run.strategy}:${run.run_id}`]={...rule,run_id:String(run.run_id),contract_id:objectHash(rule)};
  }
  function normalize(value){const raw=JSON.stringify(value);return normalizeSources({screening:readScreeningArchive(raw,sha256(raw)),companies:[],session:'2026-10-30',cutoff});}
  const data=normalize(packet);
  assert.equal(data.engines.TENX.current.contract,data.engines.TENX.previous.contract);
  assert.notEqual(data.engines.TENX.current.source_id,data.engines.TENX.previous.source_id);
  assert.deepEqual(data.engines.TENX.current.candidates.map(r=>r.score),[82,79,77]);
  const changed=structuredClone(packet), value=changed.engine_contracts['TENX:TENX-current'];
  value.rule_hash='b'.repeat(16);value.contract_id=objectHash({strategy:value.strategy,strategy_version:value.strategy_version,rule_hash:value.rule_hash,implementation_hash:value.implementation_hash});
  const held=normalize(changed);
  assert.notEqual(held.engines.TENX.current.contract,held.engines.TENX.previous.contract);
  const corrupted=structuredClone(packet);corrupted.engine_contracts['TENX:TENX-current'].contract_id='0'.repeat(64);
  assert.throws(()=>normalize(corrupted),/ENGINE_CONTRACTS/);
});

test('fake provenance cannot be promoted by artifact, reader or publication', {skip:!python||!backend}, async()=>{
  const directory=await mkdtemp(join(tmpdir(),'briefing-provenance-'));
  const {artifact}=await pipelineFixture(directory,{demo:false});
  const file=join(directory,'cipher.json');
  await assert.rejects(sealBriefingArtifact(artifact,fixturePassword,file),/EXECUTION_MODE/);
  const promoted=structuredClone(artifact);promoted.execution_mode='provider';
  await assert.rejects(encryptBriefingArtifact(promoted,fixturePassword),/ARTIFACT_INVALID/);
  const wrapped=await encryptEnvelope(promoted,fixturePassword);
  await assert.rejects(readBriefingArtifact(wrapped,fixturePassword,{expectedSession:artifact.briefing.session,now:Date.parse(cutoff)}),/ARTIFACT_INVALID/);
  const valid=await sealBriefingArtifact(artifact,fixturePassword,file,{executionMode:'fake_transport'});
  await assert.rejects(readBriefingArtifact(valid,fixturePassword,{expectedExecutionMode:'provider'}),/ARTIFACT_INVALID/);
  const provider=structuredClone(artifact);provider.execution_mode=provider.briefing.execution_mode=provider.briefing.identity.execution_mode='provider';provider.briefing.provider_receipt.transport='network';
  await assert.rejects(sealBriefingArtifact(provider,fixturePassword,file),/EXECUTION_MODE/);
  await assert.rejects(rollbackBriefingArtifact(Buffer.from(JSON.stringify(valid)),sha256(JSON.stringify(valid)),fixturePassword,file),/EXECUTION_MODE/);
});
test('native archive adapter preserves ranks and rejects wrong bytes or future availability', async () => {
  const value = await nativeInput({
    demo: false
  });
  const rewrapped = await nativeInput({demo:false});
  assert.deepEqual(value.data,rewrapped.data,'cipher rewrapping does not change the semantic model input');
  assert.notEqual(value.binding.radar_cipher_sha256.current,rewrapped.binding.radar_cipher_sha256.current);
  assert.equal(value.data.demo, false);
  assert.equal(value.data.engines.Radar.current.market_state, 'caution');
  assert.deepEqual(value.data.engines.TENX.current.candidates.map(row => row.score), [82, 79, 77]);
  assert.throws(() => readScreeningArchive(value.archive.raw, '0'.repeat(64)), /BYTES_MISMATCH/);
  await assert.rejects(readRadarSource(value.radar.raw, value.radar.status, fixturePassword, '2026-10-30', '2026-11-01T00:00:00Z'), /NOT_AVAILABLE/);
  await assert.rejects(readRadarSource(value.radar.raw, {
    ...value.radar.status,
    feed_cipher_sha256: '0'.repeat(64)
  }, fixturePassword, '2026-10-30', cutoff), /BINDING/);
  const archive = nativeArchive();
  const source = readScreeningArchive(archive.raw, archive.hash);
  assert.throws(()=>normalizeSources({screening:source,selection:{TENX:{current:'TENX-previous'}},companies:[],session:'2026-10-30',cutoff}),/NONCONSECUTIVE/);
  assert.throws(() => normalizeSources({
    screening: source,
    selection: {
      TENX: {
        current: 'TENX-current'
      }
    },
    companies: [],
    session: '2026-10-30',
    cutoff: '2026-11-01T00:00:00Z'
  }), /CUTOFF/);
});
test('quarantined Radar remains unavailable in actual adapter path', async () => {
  const native = await nativeInput({
    state: 'FAILED',
    failure: 'REVISION_QUARANTINED'
  });
  assert.equal(native.data.engines.Radar.current.status, 'quarantined');
  assert.equal(native.data.engines.Radar.current.market_state, 'unavailable');
});
test('adapter -> Python provider/ledger -> encrypted artifact -> reader', {
  skip: !python || !backend
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'briefing-pipeline-'));
  const {
    artifact
  } = await pipelineFixture(directory);
  assert.equal(artifact.briefing.status, 'ready');
  const destination = join(directory, 'briefing.enc.json');
  const sealed = await sealBriefingArtifact(artifact, fixturePassword, destination, {executionMode:'fake_transport'});
  assert.ok(!JSON.stringify(sealed).includes('DEMO-B'));
  const read = await readBriefingArtifact(sealed, fixturePassword, {
    expectedSession: '2026-10-30',
    now: Date.parse(cutoff)
  });
  assert.equal(read.insights.length, 2);
  assert.equal(read.execution_mode, 'fake_transport');
  assert.equal(read.engines.TENX.current.candidates[0].score, 82);
  const stale = await readBriefingArtifact(sealed, fixturePassword, {
    expectedSession: '2026-11-02',
    now: Date.parse(cutoff)
  });
  assert.equal(stale.status, 'unavailable');
  assert.equal(stale.previous_is_current, false);
  assert.equal(stale.previous_briefing.generated_at, cutoff);
  const missing = await loadBriefingArtifact('/missing', fixturePassword, {}, async () => ({
    ok: false
  }));
  assert.equal(missing.status, 'unavailable');
  const original = await readFile(destination);
  await writeFile(`${destination}.lock`,'owned-by-test');
  await assert.rejects(sealBriefingArtifact(artifact,fixturePassword,destination,{executionMode:'fake_transport'}),/EEXIST/);
  assert.deepEqual(await readFile(destination),original,'busy publication preserves prior bytes');
  await rm(`${destination}.lock`);
  await sealBriefingArtifact({
    ...artifact,
    created_at: '2026-11-02T12:10:00Z'
  }, fixturePassword, destination, {executionMode:'fake_transport'});
  assert.deepEqual(await readFile(destination), original, 'rebuild does not replace identical sealed result');
  const bad = structuredClone(artifact);
  bad.briefing.identity.input_hash = '0'.repeat(64);
  await assert.rejects(sealBriefingArtifact(bad, fixturePassword, destination, {executionMode:'fake_transport'}));
  assert.deepEqual(await readFile(destination), original);
  const failed = structuredClone(artifact);
  failed.briefing = {
    status: 'unavailable',
    demo: true
  };
  await sealBriefingArtifact(failed, fixturePassword, destination, {executionMode:'fake_transport'});
  assert.deepEqual(await readFile(destination), original, 'provider failure retains old valid artifact');
  failed.source_binding.input_hash='f'.repeat(64);
  const delivery=await writeBriefingDeliveryStatus(failed,original,join(directory,'briefing-status.json'));
  let reads=0;
  const fetcher=async url=>{reads++;return url==='/status'?{ok:true,text:async()=>JSON.stringify(delivery)}:
    {ok:true,arrayBuffer:async()=>original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength)};};
  const held=await loadBriefingDelivery('/status','/cipher',fixturePassword,{expectedSession:'2026-10-30',now:Date.parse(cutoff)},fetcher);
  assert.equal(held.status,'unavailable');
  assert.equal(held.previous_is_current,false);
  assert.equal(held.generated_at,undefined);
  assert.equal(held.previous_briefing.generated_at,cutoff);
  delivery.cipher_sha256='0'.repeat(64);reads=0;
  const mismatched=await loadBriefingDelivery('/status','/cipher',fixturePassword,{expectedSession:'2026-10-30',now:Date.parse(cutoff)},fetcher);
  assert.equal(mismatched.status,'unavailable');
  assert.equal(reads,4,'one bounded pair retry; no unbound fallback');
  const newer = structuredClone(artifact);
  newer.created_at = newer.briefing.generated_at = '2026-11-02T12:20:00Z';
  await sealBriefingArtifact(newer, fixturePassword, destination, {executionMode:'fake_transport'});
  assert.notDeepEqual(await readFile(destination), original);
  await rollbackBriefingArtifact(original, sha256(original), fixturePassword, destination, {executionMode:'fake_transport'});
  assert.deepEqual(await readFile(destination), original, 'rollback restores exact prior ciphertext');
  await assert.rejects(rollbackBriefingArtifact(original, '0'.repeat(64), fixturePassword, destination, {executionMode:'fake_transport'}));
  await assert.rejects(readBriefingArtifact(sealed, 'wrong-password'));
  const tampered = structuredClone(sealed);
  tampered.aad = 'wrong';
  await assert.rejects(readBriefingArtifact(tampered, fixturePassword));
});
test('failed artifact has no new generation time or invented current sources', async () => {
  const native = await nativeInput();
  const artifact = {
    artifact_kind: ARTIFACT_KIND,
    version: 1,
    created_at: cutoff,
    execution_mode: 'fake_transport',
    source_binding: {
      ...native.binding,
      input_hash: 'e'.repeat(64)
    },
    briefing: {
      status: 'unavailable',
      demo: true
    }
  };
  const sealed = await encryptBriefingArtifact(artifact, fixturePassword);
  const read = await readBriefingArtifact(sealed, fixturePassword, {
    expectedSession: '2026-10-30',
    now: Date.parse(cutoff)
  });
  assert.equal(read.generated_at, undefined);
  assert.equal(read.engines, undefined);
});
