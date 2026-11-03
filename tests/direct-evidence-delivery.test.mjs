import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {roleDocumentsFixture} from './fixtures/role-documents-v2.mjs';
import {fixturePassword,cutoff} from './fixtures/briefing-native.mjs';
import {encryptBriefingArtifact,readBriefingArtifact} from '../src/features/briefing/briefing-artifact.js';
import {roleDocumentView} from '../src/features/briefing/role-documents.js';
import {roleTaxonomyFor,DIRECT_ROLE_PROFILE} from '../src/features/briefing/role-taxonomy.js';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../scripts/seal-briefing-artifact.mjs';
const skip=!process.env.BRIEFING_TEST_PYTHON||!process.env.BRIEFING_TEST_BACKEND;
const options={expectedExecutionMode:'fake_transport',expectedSession:'2026-10-30',now:Date.parse(cutoff)};
for(const fragment of [false,true])test(`direct writer -> sealed reader -> card model; fragment=${fragment}`,{skip},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'direct-document-'));
  const {artifact,legacy}=await roleDocumentsFixture(directory,{direct:true,fragment});
  assert.deepEqual(artifact.briefing,legacy.briefing);
  assert.equal(artifact.role_document_contract.schema,'role_document_reviews_direct_v1');
  const destination=join(directory,'briefing.enc.json'),statusPath=join(directory,'status.json');
  const cipher=await sealBriefingArtifact(artifact,fixturePassword,destination,{executionMode:'fake_transport'});
  const before=await readFile(destination);await writeBriefingDeliveryStatus(artifact,before,statusPath);
  const statusBefore=await readFile(statusPath);
  const read=await readBriefingArtifact(cipher,fixturePassword,options),view=roleDocumentView(read,read.roles[0]);
  assert.equal(read._validated_role_profile,DIRECT_ROLE_PROFILE);
  assert.equal(roleTaxonomyFor(read).schema,'gpt_role_taxonomy_v2');
  assert.equal(view.admitted,!fragment);assert.equal(view.role,fragment?'unknown':'power_cooling');
  assert.deepEqual(read.engines,legacy.briefing.engines);assert.equal(read.score_effect,0);
  for(const change of [
    a=>{a.role_document_contract.registry_hash='0'.repeat(64);},
    a=>{a.role_document_contract.taxonomy_hash='0'.repeat(64);},
    a=>{a.role_document_contract.reviews[0].direct_evidence.reason='independently_reviewed_direct_claim';},
    a=>{a.role_document_contract.reviews[0].direct_evidence.current_verification='verified';},
    a=>{a.role_document_contract.reviews[0].review_status=fragment?'document_reviewed':'held';},
    a=>{a.role_document_contract.reviews[0].claim.evidence[0].quote='We';},
    a=>{a.role_document_contract.schema='role_document_reviews_v2';}
  ]){
    const bad=structuredClone(artifact);change(bad);
    await assert.rejects(encryptBriefingArtifact(bad,fixturePassword));
    await assert.rejects(sealBriefingArtifact(bad,fixturePassword,destination,{executionMode:'fake_transport'}));
  }
  assert.deepEqual(await readFile(destination),before);assert.deepEqual(await readFile(statusPath),statusBefore);
});
test('legacy/model profile claims cannot select the reviewed taxonomy',{skip},async()=>{
  const {legacy}=await roleDocumentsFixture(await mkdtemp(join(tmpdir(),'direct-legacy-')));
  legacy.briefing._validated_role_profile=DIRECT_ROLE_PROFILE;
  legacy.briefing.identity.prompt_version=DIRECT_ROLE_PROFILE;
  const read=await readBriefingArtifact(await encryptBriefingArtifact(legacy,fixturePassword),fixturePassword,options);
  assert.equal(read._validated_role_profile,undefined);
  assert.equal(roleTaxonomyFor(read).schema,'gpt_role_taxonomy_v1');
});
