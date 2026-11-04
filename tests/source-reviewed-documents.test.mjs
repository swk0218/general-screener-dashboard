import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,copyFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceReviewedFixture,sourceReviewBackendAvailable} from './fixtures/source-reviewed-documents.mjs';
import {fixturePassword} from './fixtures/briefing-native.mjs';
import {encryptEnvelope} from '../src/crypto/envelope.js';
import {assertRoleDocumentContract,roleDocumentView} from '../src/features/briefing/role-documents.js';
import {assertSourceReviewRegistries,SOURCE_REVIEW_PINS} from '../src/features/briefing/source-reviewed-documents.js';
import {assertBriefingArtifact,encryptBriefingArtifact,readBriefingArtifact} from '../src/features/briefing/briefing-artifact.js';
import {roleTaxonomyFor,SOURCE_ROLE_PROFILE} from '../src/features/briefing/role-taxonomy.js';
import {sealBriefingArtifact,writeBriefingDeliveryStatus} from '../scripts/seal-briefing-artifact.mjs';
const skip=!sourceReviewBackendAvailable;
const folder=()=>mkdtemp(join(tmpdir(),'source-role-product-'));
const options=artifact=>({expectedExecutionMode:'fake_transport',expectedSession:artifact.briefing.session,
  now:Date.parse(artifact.created_at),maxAgeMs:7*24*3600*1000});
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const shaText=value=>createHash('sha256').update(value).digest('hex');
function rebindInput(artifact){
  const data=artifact.briefing;
  data.input_canonical_json=JSON.stringify(sorted(Object.fromEntries(['schema_version','demo','session','engines','companies'].map(key=>[key,data[key]]))));
  data.identity.input_hash=artifact.source_binding.input_hash=shaText(data.input_canonical_json);
}
async function readerRejects(artifact){
  // Direct envelope encryption deliberately bypasses the product writer checks.
  await assert.rejects(readBriefingArtifact(await encryptEnvelope(artifact,fixturePassword),fixturePassword,options(artifact)));
}

test('separate code-owned registry pins cross-check and publish no source text',async()=>{
  await assertSourceReviewRegistries();
  for(const [key,file] of Object.entries({provenance_hash:'source-provenance-registry-v2.json',receipts_hash:'source-review-receipts-v2.json',semantics_hash:'source-semantic-registry-v2.json',taxonomy_hash:'role-taxonomy-v2.json'})){
    const registry=JSON.parse(await readFile(new URL(`../src/features/briefing/${file}`,import.meta.url),'utf8'));
    assert.equal(hash(registry),SOURCE_REVIEW_PINS[key]);
    if(key==='provenance_hash')for(const row of registry.records){
      assert.deepEqual(Object.keys(row).sort(),['symbol','case_id','id','source_version_hash','text_sha256'].sort());
    }
  }
});

test('source writer -> encrypted product reader preserves all metadata and six held rows',{skip},async()=>{
  const {artifact,base_artifact}=await sourceReviewedFixture(await folder());
  assert.deepEqual(artifact.briefing,base_artifact.briefing);
  const read=await readBriefingArtifact(await encryptBriefingArtifact(artifact,fixturePassword),fixturePassword,options(artifact));
  assert.equal(read._validated_role_profile,SOURCE_ROLE_PROFILE);
  assert.equal(roleTaxonomyFor(read).schema,'gpt_role_taxonomy_v2');
  assert.equal(read.score_effect,0);assert.deepEqual(read.engines,base_artifact.briefing.engines);
  const rows=read._validated_role_documents;
  assert.deepEqual(rows.map(row=>row.reason),['semantic_mapping_review_pending','semantic_mapping_review_pending',
    'role_or_document_claim_not_established','role_or_document_claim_not_established','publication_date_unconfirmed','role_or_document_claim_not_established']);
  for(let index=0;index<rows.length;index++){
    const row=rows[index],record=artifact.role_document_contract.source_records[index],view=roleDocumentView(read,read.roles[index]);
    assert.deepEqual(row.documents,[record]);
    assert.equal(row.claim.evidence[0].source_version_hash,hash(record));
    assert.equal(row.source_admission.source_version_hash,hash(record));
    assert.deepEqual(row.source_admission.candidate,row.claim);
    assert.equal(row.review_status,'held');assert.equal(row.current_verification.state,'unverified');
    assert.equal(row.engine_comparison.state,'held');assert.equal(row.score_effect,0);
    assert.equal(view.admitted,false);assert.equal(view.role,'unknown');assert.equal(view.assessedAt,artifact.role_document_contract.assessed_at);
    assert.notEqual(view.assessedAt,read.generated_at);assert.match(view.reviewNote,/독립 AI/);
    if(index>1)assert.equal(row.claim.document_tense,null);
  }
  assert.equal(rows[4].documents[0].published_on,null);
  assert.match(roleDocumentView(read,read.roles[4]).detail,/공시일/);
});

test('full source identity rejects every metadata mutation even with coherent self-rehashing',{skip},async()=>{
  const {artifact}=await sourceReviewedFixture(await folder());
  for(const key of Object.keys(artifact.role_document_contract.source_records[0])){
    const bad=structuredClone(artifact),contract=bad.role_document_contract,source=contract.source_records[0],row=contract.reviews[0];
    source[key]=source[key]===null?'fabricated':`${source[key]} changed`;
    if(key==='text')source.text_sha256=shaText(source.text);
    row.documents[0]=structuredClone(source);
    row.claim.evidence[0].source_version_hash=row.source_admission.source_version_hash=hash(source);
    row.claim.evidence[0].source_text_hash=source.text_sha256;
    row.claim.evidence[0].quote=Array.from(source.text).slice(row.claim.evidence[0].start,row.claim.evidence[0].end).join('');
    row.source_admission.candidate=structuredClone(row.claim);
    await assert.rejects(assertRoleDocumentContract(bad),undefined,`metadata ${key}`);
  }
  const bad=structuredClone(artifact);
  bad.role_document_contract.source_records[0].normalization+=' changed';
  await readerRejects(bad);
});

test('encrypted reader rejects pin mixing, forged admission, source/span mismatches and injected registries',{skip},async()=>{
  const {artifact}=await sourceReviewedFixture(await folder());
  const changes=[
    a=>{a.role_document_contract.provenance_hash='0'.repeat(64);},
    a=>{a.source_binding.source_review_semantics_hash='0'.repeat(64);},
    a=>{a.role_document_contract.receipts_hash='0'.repeat(64);a.source_binding.source_review_receipts_hash='0'.repeat(64);},
    a=>{a.role_document_contract.taxonomy_hash='0'.repeat(64);a.source_binding.source_review_taxonomy_hash='0'.repeat(64);},
    a=>{a.role_document_contract.reviews[0].source_admission.pins.semantics_hash='0'.repeat(64);},
    a=>{a.role_document_contract.reviews[0].review_status='document_reviewed';},
    a=>{a.role_document_contract.reviews[0].source_admission.state='document_reviewed';},
    a=>{a.role_document_contract.reviews[0].current_verification.state='verified';},
    a=>{a.role_document_contract.reviews[0].engine_comparison.state='matched';},
    a=>{a.role_document_contract.reviews[0].score_effect=1;},
    a=>{a.role_document_contract.reviews[2].claim.document_tense='present_in_document';},
    a=>{a.role_document_contract.reviews[0].claim.evidence[0].start=1;},
    a=>{a.role_document_contract.reviews[0].claim.evidence[0].quote='invented';},
    a=>{a.role_document_contract.reviews[0].source_admission.source_version_hash='0'.repeat(64);},
    a=>{a.role_document_contract.reviews[0].source_admission.candidate.role='cloud';},
    a=>{a.role_document_contract.registry={entries:[]};},
    a=>{a.role_document_contract.assessed_at='2026-11-04T00:31:45Z';},
    a=>{a.role_document_contract.assessed_at='2026-11-05T00:31:46Z';},
    a=>{a.role_document_contract.reviews.reverse();},
    a=>{a.briefing.roles[0].role='compute';},
    a=>{a.briefing.companies[0].sources=[a.role_document_contract.source_records[0]];rebindInput(a);},
  ];
  for(const change of changes){const bad=structuredClone(artifact);change(bad);await readerRejects(bad);}
});

test('source profile cannot downgrade to legacy or direct review; fully stripped legacy has no admission',{skip},async()=>{
  const {artifact}=await sourceReviewedFixture(await folder());
  for(const version of [1,2]){
    const bad=structuredClone(artifact);bad.version=version;
    await readerRejects(bad);
  }
  const bad=structuredClone(artifact);
  bad.version=2;bad.role_document_contract.schema='role_document_reviews_direct_v1';
  bad.role_document_contract.profile='direct-reviewed-document-candidates-v1';
  for(const key of Object.keys(bad.source_binding))if(key.startsWith('source_review_'))delete bad.source_binding[key];
  await readerRejects(bad);
  const stripped=structuredClone(artifact);stripped.version=1;delete stripped.role_document_contract;
  for(const key of Object.keys(stripped.source_binding))if(key.startsWith('source_review_'))delete stripped.source_binding[key];
  stripped.briefing._validated_role_profile=SOURCE_ROLE_PROFILE;
  stripped.briefing._validated_role_documents=artifact.role_document_contract.reviews;
  const read=await readBriefingArtifact(await encryptBriefingArtifact(stripped,fixturePassword),fixturePassword,options(stripped));
  assert.equal(read._validated_role_profile,undefined);assert.equal(read._validated_role_documents,undefined);
  for(const role of read.roles){assert.equal(roleDocumentView(read,role).admitted,false);assert.equal(roleDocumentView(read,role).role,'unknown');}
});

test('per-source validation accepts reordered subset and independent assessment clock; no artifact allowlist',{skip},async()=>{
  const {artifact}=await sourceReviewedFixture(await folder());
  const subset=structuredClone(artifact),indices=[4,0];
  for(const key of ['companies','roles'])subset.briefing[key]=indices.map(index=>subset.briefing[key][index]);
  for(const key of ['source_records','reviews'])subset.role_document_contract[key]=indices.map(index=>subset.role_document_contract[key][index]);
  rebindInput(subset);
  subset.created_at=subset.role_document_contract.assessed_at='2026-11-04T01:00:00Z';
  for(const row of subset.role_document_contract.reviews)row.assessed_at=subset.role_document_contract.assessed_at;
  const read=await readBriefingArtifact(await encryptBriefingArtifact(subset,fixturePassword),fixturePassword,options(subset));
  assert.deepEqual(read._validated_role_documents.map(row=>row.symbol),['CSCO','AMD']);
  assert.equal(read.generated_at,artifact.briefing.generated_at);
  assert.deepEqual(read.engines,artifact.briefing.engines);
});

test('invalid source admission leaves previous ciphertext/status untouched and dated review remains non-current',{skip},async()=>{
  const directory=await folder(),{artifact}=await sourceReviewedFixture(directory);
  const file=join(directory,'briefing.enc.json'),statusPath=join(directory,'status.json');
  const cipher=await sealBriefingArtifact(artifact,fixturePassword,file,{executionMode:'fake_transport'});
  const before=await readFile(file);await writeBriefingDeliveryStatus(artifact,before,statusPath);
  const statusBefore=await readFile(statusPath),bad=structuredClone(artifact);
  bad.role_document_contract.reviews[0].review_status='document_reviewed';
  await assert.rejects(sealBriefingArtifact(bad,fixturePassword,file,{executionMode:'fake_transport'}));
  await assert.rejects(writeBriefingDeliveryStatus(bad,before,statusPath));
  assert.deepEqual(await readFile(file),before);assert.deepEqual(await readFile(statusPath),statusBefore);
  const dated=await readBriefingArtifact(cipher,fixturePassword,{...options(artifact),maxAgeMs:1});
  assert.equal(dated.status,'unavailable');assert.equal(dated.previous_is_current,false);
  assert.equal(dated.previous_briefing._validated_role_profile,SOURCE_ROLE_PROFILE);
  assert.equal(dated.previous_briefing._validated_role_documents.every(row=>row.review_status==='held'),true);
});

test('split or missing candidate stays held without losing source identity or implying a role tense',{skip},async()=>{
  const {artifact}=await sourceReviewedFixture(await folder());
  for(const variant of ['split','missing']){
    const changed=structuredClone(artifact),row=changed.role_document_contract.reviews[0];
    if(variant==='split'){
      const span=row.claim.evidence[0];span.end=Array.from(row.documents[0].text.split('.')[0]+'.').length;
      span.quote=Array.from(row.documents[0].text).slice(0,span.end).join('');
      row.source_admission.candidate=structuredClone(row.claim);
      row.reason=row.source_admission.reason='independent_source_review_required';
    }else{
      row.claim=row.source_admission.candidate=null;
      row.reason=row.source_admission.reason='no_document_extraction';
    }
    const read=await readBriefingArtifact(await encryptBriefingArtifact(changed,fixturePassword),fixturePassword,options(changed));
    const view=roleDocumentView(read,read.roles[0]);
    assert.equal(view.admitted,false);assert.equal(view.role,'unknown');
    assert.equal(view.evidence.length,1);assert.equal(view.assessedAt,changed.role_document_contract.assessed_at);
    assert.equal(read._validated_role_documents[0].source_admission.source_version_hash,hash(changed.role_document_contract.source_records[0]));
  }
});

test('isolated synthetic mapping approval binds receipt, object family and every check without approving product registries',{skip},async()=>{
  const {artifact}=await sourceReviewedFixture(await folder());
  const root=new URL('../src/features/briefing/',import.meta.url);
  const production=JSON.parse(await readFile(new URL('source-semantic-registry-v2.json',root),'utf8'));
  const cases=[
    ['valid',()=>{},'document_reviewed','independently_reviewed_document_claim'],
    ['wrong_object',entry=>{entry.object_family='semiconductor_memory';},'held','supply_relation_or_scope_unresolved'],
    ['wrong_context',entry=>{entry.context='data_center';},'held','supply_relation_or_scope_unresolved'],
    ['missing_check',entry=>{delete entry.checks.issuer_as_supplier;},'held','supply_relation_or_scope_unresolved'],
    ['false_check',entry=>{entry.checks.supply_relation_explicit=false;},'held','supply_relation_or_scope_unresolved'],
    ['missing_receipt',entry=>{entry.mapping_review_receipt=null;},'held','mapping_receipt_required'],
    ['wrong_mapping_hash',entry=>{entry.mapping_review_receipt.mapping_hash='0'.repeat(64);},'held','mapping_receipt_required'],
    ['wrong_receipt_pin',entry=>{entry.mapping_review_receipt.receipts_hash='0'.repeat(64);},'held','mapping_receipt_required'],
  ];
  for(const [name,change,state,reason] of cases){
    const directory=await folder(),registry=structuredClone(production),entry=registry.entries[0];
    entry.verdict='direct_support';entry.mapping_status='approved';
    entry.mapping_review_receipt={review_kind:'independent_mapping_review',mapping_hash:'',
      provenance_hash:SOURCE_REVIEW_PINS.provenance_hash,receipts_hash:SOURCE_REVIEW_PINS.receipts_hash,taxonomy_hash:SOURCE_REVIEW_PINS.taxonomy_hash,
      library_file_id:'libfile_synthetic_contract_only',sha256:'a'.repeat(64)};
    change(entry);
    if(entry.mapping_review_receipt&&name!=='wrong_mapping_hash')entry.mapping_review_receipt.mapping_hash=hash(Object.fromEntries(Object.entries(entry).filter(([key])=>!['mapping_status','mapping_review_receipt'].includes(key))));
    const pins={...SOURCE_REVIEW_PINS,semantics_hash:hash(registry)};
    // Only this private temporary module has the synthetic approved registry.
    // The application imports its original code-owned, pending registry/pins.
    for(const file of ['source-provenance-registry-v2.json','source-review-receipts-v2.json','role-taxonomy-v2.json','role-taxonomy.json','role-taxonomy.js'])await copyFile(new URL(file,root),join(directory,file));
    await writeFile(join(directory,'source-semantic-registry-v2.json'),JSON.stringify(registry));
    const code=(await readFile(new URL('source-reviewed-documents.js',root),'utf8')).replace(SOURCE_REVIEW_PINS.semantics_hash,pins.semantics_hash);
    await writeFile(join(directory,'source-reviewed-documents.mjs'),code);
    const isolated=await import(pathToFileURL(join(directory,'source-reviewed-documents.mjs')).href);
    const changed=structuredClone(artifact);Object.assign(changed.role_document_contract,pins);
    for(const [key,value] of Object.entries(pins))changed.source_binding[`source_review_${key}`]=value;
    for(const row of changed.role_document_contract.reviews)row.source_admission.pins={...pins};
    const row=changed.role_document_contract.reviews[0];
    row.review_status=row.source_admission.state=state;row.reason=row.source_admission.reason=reason;
    const rows=await isolated.assertSourceRoleDocumentContract(changed);
    assert.equal(rows[0].review_status,state,name);assert.equal(rows[0].reason,reason,name);
    assert.equal(rows[0].current_verification.state,'unverified');assert.equal(rows[0].score_effect,0);
  }
  await assertSourceReviewRegistries();
  assert.equal(production.entries.every(entry=>entry.mapping_status!=='approved'),true);
});
