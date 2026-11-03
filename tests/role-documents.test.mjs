import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {roleDocumentsFixture} from './fixtures/role-documents-v2.mjs';
import {fixturePassword,cutoff} from './fixtures/briefing-native.mjs';
import {encryptBriefingArtifact,readBriefingArtifact} from '../src/features/briefing/briefing-artifact.js';
import {roleDocumentView} from '../src/features/briefing/role-documents.js';
import {roleReviewState,roleLabel} from '../src/features/briefing/briefing-model.js';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../scripts/seal-briefing-artifact.mjs';
const skip=!process.env.BRIEFING_TEST_PYTHON||!process.env.BRIEFING_TEST_BACKEND;
const folder=()=>mkdtemp(join(tmpdir(),'role-documents-v2-'));
const options={expectedExecutionMode:'fake_transport',expectedSession:'2026-10-30',now:Date.parse(cutoff)};

test('actual opt-in writer -> authenticated v2 reader -> Korean document card model',{skip},async()=>{
  const {artifact,legacy}=await roleDocumentsFixture(await folder());
  assert.equal(artifact.version,2);assert.deepEqual(artifact.briefing,legacy.briefing);
  const encrypted=await encryptBriefingArtifact(artifact,fixturePassword);
  const read=await readBriefingArtifact(encrypted,fixturePassword,options);
  const view=roleDocumentView(read,read.roles[0]);
  assert.equal(view.admitted,true);assert.equal(roleLabel(view.role),'전력·냉각');
  assert.equal(view.statement,'문서상 제공 주장');assert.equal(view.current,'현시점 확인: 미확인');
  assert.equal(view.sources[0].published_on,'2026-10-28');assert.equal(view.sources[0].report_period,'2026-06-30');
  assert.equal(roleReviewState(read).baselineDisplayAvailable,false);
  assert.deepEqual(read.engines,legacy.briefing.engines);assert.equal(read.score_effect,0);
  for(const mutate of [
    a=>{a.role_document_contract.registry_hash='a'.repeat(64);},
    a=>{a.role_document_contract.reviews[0].current_verification.state='verified';},
    a=>{a.role_document_contract.reviews[0].engine_comparison.state='agree';},
    a=>{a.role_document_contract.reviews[0].claim.evidence[0].quote='We';},
    a=>{a.role_document_contract.reviews[0].documents[0].report_period='2026-12-31';},
    a=>{a.padding='x'.repeat(160000);},
    a=>{a.version=1;}
  ]){const bad=structuredClone(artifact);mutate(bad);await assert.rejects(encryptBriefingArtifact(bad,fixturePassword));}
});

test('fragment and Unicode source versions remain held; exact codepoint spans preserved',{skip},async()=>{
  for(const variant of [{fragment:true},{unicode:true}]){
    const {artifact}=await roleDocumentsFixture(await folder(),variant);
    const read=await readBriefingArtifact(await encryptBriefingArtifact(artifact,fixturePassword),fixturePassword,options);
    const view=roleDocumentView(read,read.roles[0]);
    assert.equal(view.admitted,false);assert.equal(view.role,'unknown');assert.equal(view.statement,'문서 해석 보류');
    if(variant.unicode)assert.ok(view.evidence[0].quote.startsWith('🙂 '));
    const bad=structuredClone(artifact);bad.role_document_contract.reviews[0].review_status='document_reviewed';
    await assert.rejects(encryptBriefingArtifact(bad,fixturePassword));
  }
});

test('later cessation is not silently dropped or combined by the writer',{skip},async()=>{
  await assert.rejects(roleDocumentsFixture(await folder(),{multiDocument:true}));
});

test('legacy reader cannot accept self-declared review or change old decisions',{skip},async()=>{
  const {legacy}=await roleDocumentsFixture(await folder());
  const old=structuredClone(legacy.briefing.roles);
  legacy.briefing._validated_role_documents=[{symbol:old[0].symbol,review_status:'document_reviewed',claim:{role:'compute'}}];
  const read=await readBriefingArtifact(await encryptBriefingArtifact(legacy,fixturePassword),fixturePassword,options);
  assert.deepEqual(read.roles,old);assert.equal(read._validated_role_documents,undefined);
  assert.equal(roleDocumentView(read,read.roles[0]).admitted,false);
  assert.equal(roleDocumentView(read,read.roles[0]).role,'unknown');
  const failed={...legacy,briefing:{status:'unavailable',demo:true}};
  const hold=await readBriefingArtifact(await encryptBriefingArtifact(failed,fixturePassword),fixturePassword,options);
  assert.deepEqual(roleReviewState(hold).roles,[]);
});

test('invalid v2 admission preserves prior ciphertext and delivery status',{skip},async()=>{
  const directory=await folder(),{artifact}=await roleDocumentsFixture(directory);
  const destination=join(directory,'briefing.enc.json'),status=join(directory,'status.json');
  await sealBriefingArtifact(artifact,fixturePassword,destination,{executionMode:'fake_transport'});
  const before=await readFile(destination);
  await writeBriefingDeliveryStatus(artifact,before,status);const statusBefore=await readFile(status);
  const bad=structuredClone(artifact);bad.role_document_contract.reviews[0].current_verification.state='verified';
  await assert.rejects(sealBriefingArtifact(bad,fixturePassword,destination,{executionMode:'fake_transport'}));
  await assert.rejects(writeBriefingDeliveryStatus(bad,before,status));
  assert.deepEqual(await readFile(destination),before);assert.deepEqual(await readFile(status),statusBefore);
});
