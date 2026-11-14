import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,mkdir,symlink,link,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildFinalLiveReview,validateFinalLiveReview,finalLiveReview,finalLiveRows,
  attachFinalLiveReview,buildRadarSnapshotReview,validateRadarSnapshotReview} from '../src/review/final-live-model.js';
import {reviewBundle} from '../src/review/review-model.js';
import {privateOutputPath,writePrivateJson,loadArtifactProfile,attachOfflineReview} from '../scripts/attach-final-live-review.mjs';
import {reviewFixture} from './review-fixture.mjs';

function testOnlyRawProfile(id='q3_one_real_company'){
  const legacy=id==='legacy_six_request',names=legacy?['saved-1','saved-2','control-a','control-b','control-c','radar-1']:['saved-1'];
  const packets=[],request_manifest=[],assessments={},provider_responses={},http_receipts={},runtime_results={};
  for(const [index,name] of names.entries()){
    const radar=name==='radar-1',task=radar?'radar_news':['saved-2','control-b','control-c'].includes(name)?'tenx':'mlg';
    const cutoff=radar?'2026-11-12T11:00:00Z':'2026-11-09T10:00:00Z',analysis='2026-11-12T12:00:00Z';
    const url='https://example.com/TEST_ONLY/'+name;
    const event={id:'TEST_ONLY-event-'+name,reason:'TEST_ONLY stored proposal',quote:'TEST_ONLY quote, never copied to DTO',
      source_url:url,published_at:cutoff,occurred_at:cutoff.slice(0,10),q:name==='control-c'?0:-1,mlg_state:'watch',scoring_basis:'business_event',confirmed:true,new_state:true};
    const decision=radar?{search_complete:false,events:[]}:{ai_supply:'unknown',ai_reason:'TEST_ONLY supply uncertainty',
      collection_complete:false,evidence_sufficient:true,events:[event]};
    const adopted=task==='tenx'?{status:name==='saved-2'?'unevaluated':'evaluated',
      reason:name==='saved-2'?'incomplete_collection':null,q:name==='saved-2'?null:name==='control-c'?0:-1}:
      {status:'evaluated',baseline_e:.65,baseline_a:0,proposed_e:.35,proposed_a:0,adopted_e:.35,adopted_a:0,score_delta:-1.8};
    packets.push({...(radar?{}:{case_id:name,symbol:'TEST_ONLY_'+index,company_name:'TEST_ONLY company '+index}),
      task,as_of:cutoff,evidence:[{url,published_at:cutoff,quote:event.quote}]});
    request_manifest.push({case_id:name,request_hash:'a'.repeat(64)});
    provider_responses[name]={id:'TEST_ONLY-response-'+name,status:'completed',output:[{type:'message',role:'assistant',
      content:[{type:'output_text',text:JSON.stringify(decision)}]}]};
    http_receipts[name]={case_id:name,http_status:200,provider_response_id:provider_responses[name].id};
    runtime_results[name]={analysis_at:analysis,request_hash:'a'.repeat(64),decision:structuredClone(decision)};
    assessments[name]={case_id:name,production_adopted:false,raw_model_decision:structuredClone(decision),
      envelope:{analysis_at:analysis,reason:'provider_completed',request_hash:'a'.repeat(64)},...(radar?{}:{adoption:adopted})};
  }
  return {id,report:{run_id:legacy?'1001':'1003',code_sha:'a'.repeat(40),production_adopted:false,
    status:'TEST_ONLY_completed_quality_review_required',provider_calls:names.length,saved_actual_cases:legacy?2:1,
    fictional_controls:legacy?3:0,radar_cases:legacy?1:0,quality_checks_failed:0},
    packets,request_manifest,assessments,provider_responses,http_receipts,runtime_results,
    binding:{artifact_id:legacy?'1002':'1004',run_id:legacy?'1001':'1003',source_head:'a'.repeat(40),
      archive_sha256:'b'.repeat(64),receipt_sha256:'c'.repeat(64)}};
}
function testOnlyFinalLiveInput(){
  return {created_at:'2026-11-14T10:00:00Z',selected_profile:'q3_one_real_company',
    profiles:[testOnlyRawProfile('legacy_six_request'),testOnlyRawProfile()]};
}
function testOnlyRadarSnapshot(){
  const source='2026-11-12T10:00:00Z',analysis='2026-11-12T11:00:00Z';
  return {schema:'radar_verified_snapshot_review_v1',status:'prepared_verified_snapshot_partial_review',
    prepared:true,review_kind:'derived_verified_original_subset',is_new_model_output:false,new_api_calls:0,
    news:{schema_version:'radar_news_v1',affects_beta:false,status:'ready',run_id:'TEST_ONLY-snapshot',
      policy_version:'TEST_ONLY',cutoff_at:source,analyzed_at:analysis,
      coverage:{search_complete:false,other_candidates_unverified:true,original_documents_not_all_verified:true,
        model_incomplete_reason:'excerpt_unverified'},events:[{event_id:'TEST_ONLY-radar-event',headline:'TEST_ONLY headline',
        summary:'TEST_ONLY recorded fact',why_it_matters:'TEST_ONLY conditional transmission',published_at:source,
        sources:[{url:'https://example.com/TEST_ONLY/primary',publisher:'TEST_ONLY source',excerpt:'TEST_ONLY excerpt',
          published_at:source,source_verification:'independent_original',publication_time_unverified:false}]}]},
    binding:{artifact_id:'1005',run_id:'1006',source_head:'d'.repeat(40),archive_sha256:'e'.repeat(64),receipt_sha256:'f'.repeat(64)},
    label:'TEST_ONLY 2026-11-12 저장 원문 일부',
    clocks:{data_as_of:source,model_analysis_at:analysis,source_received_at:null,source_published_at:source,
      stored_replay_reviewed_at:'2026-11-13T10:00:00Z',content_reviewed_at:'2026-11-14T10:00:00Z'},
    canonical_source_sha256:'1'.repeat(64),source_snapshot_sha256:'2'.repeat(64),source_response_sha256:'3'.repeat(64),
    excluded_event_count:2,original_canonical_event_count:3,excluded_events:[
      {event_id:'TEST_ONLY-excluded-1',reason:'TEST_ONLY provider citation unverified'},
      {event_id:'TEST_ONLY-excluded-2',reason:'TEST_ONLY excerpt unverified'}],
    scope_copy:'TEST_ONLY selected original subset only',freshness_copy:'TEST_ONLY source cutoff preserved',
    evidence_scope_copy:'TEST_ONLY not a new model response or completed search'};
}

const hash=raw=>createHash('sha256').update(raw).digest('hex');

test('TEST_ONLY new reconstruction preserves 2 real + 3 fictional + Radar versus Q3 one real scope',()=>{
  const raw=testOnlyFinalLiveInput(),before=structuredClone(raw),value=buildFinalLiveReview(raw);
  assert.deepEqual(raw,before);
  assert.equal(value.profiles[0].report.expected_requests,6);
  assert.equal(value.profiles[0].report.actual_companies,2);
  assert.equal(value.profiles[0].cases.filter(c=>c.kind==='fictional_control').length,3);
  assert.equal(value.profiles[0].cases.filter(c=>c.kind==='radar').length,1);
  assert.equal(value.profiles[1].report.actual_companies,1);
  assert.equal(value.profiles[1].report.radar_requests,0);
  assert.equal(value.profiles[1].execution.new_api_calls,0);
  assert.ok(value.profiles.every(p=>p.quality.status==='pending'));
  assert.equal(value.profiles[0].report.estimated_cost_microusd,null);
  assert.equal(value.profiles[0].report.invoice_confirmed,false);
});
test('TEST_ONLY actual provider completion stays separate from producer adoption and Q zero',()=>{
  const value=buildFinalLiveReview(testOnlyFinalLiveInput()),rows=value.profiles[0].cases;
  const held=rows.find(c=>c.case_id==='saved-2'),zero=rows.find(c=>c.case_id==='control-c');
  assert.equal(held.api_status,'completed');
  assert.equal(held.adoption.status,'unevaluated');
  assert.equal(held.adoption.q,null);
  assert.equal(held.adoption.adjusted_score,null);
  assert.equal(held.events[0].q,-1);
  assert.equal(zero.adoption.q,0);
  assert.notEqual(rows[0].source_cutoff,rows.at(-1).source_cutoff);
});
test('TEST_ONLY missing responses are explicit null and missing identities are not manufactured',()=>{
  const raw=testOnlyFinalLiveInput();delete raw.profiles[0].provider_responses['saved-2'];
  const missing=buildFinalLiveReview(raw).profiles[0];
  assert.equal(missing.cases.find(c=>c.case_id==='saved-2').api_status,'missing');
  assert.equal(missing.cases.find(c=>c.case_id==='saved-2').adoption.q,null);
  assert.equal(missing.quality.missing,1);
  raw.profiles[0].packets=raw.profiles[0].packets.filter(p=>p.case_id!=='saved-2');
  const noIdentity=buildFinalLiveReview(raw).profiles[0];
  assert.equal(noIdentity.cases.some(c=>c.case_id==='saved-2'),false);
  assert.equal(noIdentity.quality.missing,1);
});
test('TEST_ONLY every displayed nested object is whitelisted without provider, quote, or ledger fields',()=>{
  const raw=testOnlyFinalLiveInput(),p=raw.profiles[1],sentinel='TEST_ONLY_SECRET_NOT_FOR_DTO';
  p.report.ledger={secret:sentinel};p.assessments['saved-1'].raw_model_decision.ignored=sentinel;
  p.provider_responses['saved-1'].output[0].content[0].text=JSON.stringify(p.assessments['saved-1'].raw_model_decision);
  p.runtime_results['saved-1'].decision=structuredClone(p.assessments['saved-1'].raw_model_decision);
  p.packets[0].evidence[0].headers={authorization:sentinel};
  p.assessments['saved-1'].raw_model_decision.events[0].private_trace=sentinel;
  p.provider_responses['saved-1'].output[0].content[0].text=JSON.stringify(p.assessments['saved-1'].raw_model_decision);
  p.runtime_results['saved-1'].decision=structuredClone(p.assessments['saved-1'].raw_model_decision);
  const value=buildFinalLiveReview(raw),wire=JSON.stringify(value);
  assert.ok(!wire.includes(sentinel));assert.ok(!wire.includes('never copied to DTO'));
  for(const mutate of [
    v=>v.provider_response=sentinel,v=>v.profiles[0].execution.secret=sentinel,
    v=>v.profiles[0].cases[0].events[0].quote=sentinel,v=>v.profiles[0].binding.authenticated=true,
    v=>v.profiles[0].cases[0].sources[0].headers={authorization:sentinel},
  ]){const bad=structuredClone(value);mutate(bad);assert.throws(()=>validateFinalLiveReview(bad),/FINAL_LIVE_REVIEW_INVALID/);}
});
test('TEST_ONLY raw provider decision and runtime/assessment identity must match',()=>{
  for(const change of [
    p=>p.runtime_results['saved-1'].decision.events=[],
    p=>p.assessments['saved-1'].raw_model_decision.events=[],
    p=>p.http_receipts['saved-1'].provider_response_id='OTHER',
  ]){
    const raw=testOnlyFinalLiveInput();change(raw.profiles[1]);
    if(raw.profiles[1].http_receipts['saved-1'].provider_response_id==='OTHER'){
      const out=buildFinalLiveReview(raw).profiles[1];assert.equal(out.cases[0].api_status,'failed');
      assert.equal(out.cases[0].adoption.q,null);
    }else assert.throws(()=>buildFinalLiveReview(raw),/FINAL_LIVE_REVIEW_INVALID/);
  }
});
test('TEST_ONLY profile counts, duplicate IDs, unsafe links, NaN and held Q cannot be laundered',()=>{
  const value=buildFinalLiveReview(testOnlyFinalLiveInput());
  for(const change of [
    x=>x.profiles[0].report.actual_companies=6,
    x=>x.profiles[0].cases.push(x.profiles[0].cases[0]),
    x=>x.profiles[0].cases[0].sources[0].url='https://name:password@example.com',
    x=>x.profiles[0].cases[0].adoption.score_delta=NaN,
    x=>x.profiles[0].cases[1].adoption.q=0,
    x=>x.profiles[0].cases[0].ai_reason='api_key=TEST_ONLY_SECRET123456',
    x=>x.profiles[1].binding.run_id='different',
  ]){const bad=structuredClone(value);change(bad);assert.throws(()=>validateFinalLiveReview(bad),/FINAL_LIVE_REVIEW_INVALID/);}
});
test('TEST_ONLY old zero failed checks cannot become a new quality receipt or PASS',()=>{
  const raw=testOnlyFinalLiveInput(),value=buildFinalLiveReview(raw);
  assert.equal(raw.profiles[1].report.quality_checks_failed,0);
  assert.equal(value.profiles[1].quality.status,'pending');
  value.profiles[1].quality.status='complete_within_scope';
  assert.throws(()=>validateFinalLiveReview(value),/FINAL_LIVE_REVIEW_INVALID/);
});
test('TEST_ONLY optional attachment preserves every original base field and rejects overwrite',()=>{
  const base=reviewFixture(),before=structuredClone(base),rawBytes=JSON.stringify(base);
  const live=buildFinalLiveReview(testOnlyFinalLiveInput()),snapshot=buildRadarSnapshotReview(testOnlyRadarSnapshot());
  const out=attachFinalLiveReview(base,live,snapshot);
  assert.deepEqual(base,before);assert.equal(JSON.stringify(base),rawBytes);
  const {final_live_review,radar_snapshot_review,...original}=out;
  assert.deepEqual(original,before);assert.deepEqual(reviewBundle(out),out);
  assert.equal(finalLiveReview(out).selected_profile,'q3_one_real_company');
  assert.equal(finalLiveRows(out,'mlg').length,1);
  assert.throws(()=>attachFinalLiveReview(out,live),/FINAL_LIVE_REVIEW_INVALID/);
  assert.equal(finalLiveReview(base),null);
});
test('TEST_ONLY separate Radar snapshot strips unknown raw fields and keeps partial source scope',()=>{
  const raw=testOnlyRadarSnapshot(),before=structuredClone(raw);
  raw.news.raw_response='TEST_ONLY_RAW_BODY';raw.news.events[0].provider_trace='TEST_ONLY_RAW_BODY';
  raw.news.events[0].sources[0].ledger='TEST_ONLY_RAW_BODY';
  const projected=buildRadarSnapshotReview(raw);
  assert.ok(!JSON.stringify(projected).includes('TEST_ONLY_RAW_BODY'));
  assert.equal(projected.news.coverage.search_complete,false);
  assert.equal(projected.original_canonical_event_count,3);assert.equal(projected.excluded_event_count,2);
  assert.equal(projected.new_api_calls,0);assert.equal(projected.is_new_model_output,false);
  assert.equal(projected.clocks.model_analysis_at,before.clocks.model_analysis_at);
  assert.equal(projected.news.cutoff_at,before.news.cutoff_at);
  assert.equal(before.news.raw_response,undefined);
});
test('TEST_ONLY invalid, falsely verified or falsely complete Radar snapshots fail closed',()=>{
  for(const change of [
    x=>x.news.events[0].sources[0].source_verification='provider_citation',
    x=>x.news.events[0].sources[0].publication_time_unverified=true,
    x=>x.news.events[0].sources[0].url='javascript:alert(1)',
    x=>x.news.coverage.search_complete=true,
    x=>x.news.status='unavailable',
    x=>x.news.events[0].published_at='2030-01-01T00:00:00Z',
    x=>x.news.events[0].sources[0].raw_body='TEST_ONLY',
    x=>x.original_canonical_event_count=4,
  ]){const raw=testOnlyRadarSnapshot();change(raw);assert.throws(()=>validateRadarSnapshotReview(raw),/FINAL_LIVE_REVIEW_INVALID/);}
});

async function fixtureArchive(folder,id='q3_one_real_company'){
  const raw=testOnlyRawProfile(id),artifact=join(folder,'artifacts');await mkdir(artifact,{recursive:true});
  const files={'report.json':raw.report,'packets.json':raw.packets,'request-manifest.json':raw.request_manifest};
  for(const [name,a] of Object.entries(raw.assessments))files['assessments/'+name+'.json']=a;
  for(const [prefix,group] of [['provider-response',raw.provider_responses],['http-receipt',raw.http_receipts],['runtime-result',raw.runtime_results]])
    for(const [name,v] of Object.entries(group))files[prefix+'-'+name+'.json']=v;
  const entries=[];
  for(const [name,value] of Object.entries(files)){
    const bytes=JSON.stringify(value),path=join(artifact,name);await mkdir(resolve(path,'..'),{recursive:true});
    await writeFile(path,bytes);entries.push({path:name,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)});
  }
  const archive=Buffer.from('TEST_ONLY synthetic archived bytes; not native authentication');
  await writeFile(join(folder,'original.zip'),archive);
  await writeFile(join(folder,'RECOVERY_RECEIPT.json'),JSON.stringify({
    schema:'recovered_native_Actions_artifact_v1',run_id:Number(raw.binding.run_id),
    artifact_id:Number(raw.binding.artifact_id),head:raw.binding.source_head,
    expected_bytes:archive.length,expected_sha256:hash(archive),sha256:hash(archive),files:entries,
    authenticated:true,old_quality_pass:true,
  }));
}
test('TEST_ONLY private CLI refuses checkout paths, dot-dot lookalikes, symlink parents and existing outputs',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'TEST_ONLY-final-live-'));
  try{
    const root=join(folder,'source'),external=join(folder,'private');await mkdir(root);await mkdir(external);
    await mkdir(join(root,'..private'));await symlink(root,join(external,'into-checkout'));
    for(const path of [join(root,'file.json'),join(root,'..private','file.json'),join(external,'into-checkout','file.json')])
      await assert.rejects(privateOutputPath(path,root));
    const first=join(external,'result.json');await writePrivateJson(first,{TEST_ONLY:true},{root});
    assert.equal((await stat(first)).mode&0o777,0o600);
    await assert.rejects(writePrivateJson(first,{TEST_ONLY:'overwrite'},{root}));
    await link(first,join(external,'hardlink.json'));
    await assert.rejects(writePrivateJson(join(external,'hardlink.json'),{}, {root}));
    assert.deepEqual(JSON.parse(await readFile(first)),{TEST_ONLY:true});
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('TEST_ONLY artifact bytes and member hashes bind references without self-authentication',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'TEST_ONLY-native-reference-'));
  try{
    const root=join(folder,'source'),artifact=join(folder,'private-artifact');await mkdir(root);await mkdir(artifact);
    await fixtureArchive(artifact);
    const raw=await loadArtifactProfile(artifact,'q3_one_real_company',{root});
    const value=buildFinalLiveReview({created_at:'2026-11-14T10:00:00Z',selected_profile:raw.id,profiles:[raw]});
    assert.equal(value.profiles[0].binding.authenticated,undefined);
    assert.equal(value.profiles[0].quality.status,'pending');
    await writeFile(join(artifact,'artifacts/report.json'),'TEST_ONLY tamper');
    await assert.rejects(loadArtifactProfile(artifact,'q3_one_real_company',{root}));
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('TEST_ONLY offline attach supports a private DTO-only result without fabricating an original base',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'TEST_ONLY-offline-attach-'));
  try{
    const root=join(folder,'source'),artifact=join(folder,'artifact');await mkdir(root);await mkdir(artifact);
    await fixtureArchive(artifact);
    const out=join(folder,'profile.json');
    const summary=await attachOfflineReview({root,q3ArtifactDir:artifact,profilesOnly:true,output:out,
      createdAt:'2026-11-14T10:00:00Z'});
    assert.equal(summary.status,'private_profile_dto_prepared');assert.equal(summary.new_http_calls,0);
    const result=JSON.parse(await readFile(out));assert.equal(result.numeric,undefined);
    assert.equal(result.schema,'final_live_company_review_v1');
    await assert.rejects(attachOfflineReview({root,q3ArtifactDir:artifact,output:join(folder,'missing-base.json')}));
    await assert.rejects(attachOfflineReview({root,q3ArtifactDir:artifact,profilesOnly:true,output:out}));
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('TEST_ONLY CLI errors print only a fixed code and never private contents',()=>{
  const result=spawnSync(process.execPath,['scripts/attach-final-live-review.mjs','--unknown','TEST_ONLY_PRIVATE_BODY'],
    {cwd:resolve(import.meta.dirname,'..'),encoding:'utf8',env:{...process.env,HTTP_PROXY:'',HTTPS_PROXY:''}});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.equal(result.stderr,'FINAL_LIVE_ATTACH_FAILED\n');
  assert.ok(!result.stderr.includes('TEST_ONLY_PRIVATE_BODY'));
});

test('TEST_ONLY missing response IDs never count as completed and assessment/request identity mismatches fail',()=>{
  const raw=testOnlyFinalLiveInput(),profile=raw.profiles[1];
  delete profile.provider_responses['saved-1'].id;delete profile.http_receipts['saved-1'].provider_response_id;
  assert.equal(buildFinalLiveReview(raw).profiles[1].cases[0].api_status,'failed');
  for(const mutate of [p=>p.assessments['saved-1'].case_id='OTHER',
    p=>p.runtime_results['saved-1'].request_hash='d'.repeat(64),
    p=>p.assessments['saved-1'].envelope.request_hash='d'.repeat(64)]){
    const bad=testOnlyFinalLiveInput();mutate(bad.profiles[1]);
    assert.throws(()=>buildFinalLiveReview(bad),/FINAL_LIVE_REVIEW_INVALID/);
  }
});
test('TEST_ONLY a recorded API completion without adoption evidence stays missing with null adopted values',()=>{
  const raw=testOnlyFinalLiveInput();delete raw.profiles[1].assessments['saved-1'];
  const out=buildFinalLiveReview(raw).profiles[1];
  assert.equal(out.cases[0].api_status,'completed');assert.equal(out.cases[0].adoption.status,'missing');
  assert.equal(out.cases[0].adoption.proposed_e,null);assert.equal(out.cases[0].adoption.q,null);
  assert.equal(out.quality.held,1);assert.equal(out.quality.status,'pending');
});
test('TEST_ONLY final-answer extraction excludes commentary and rejects ambiguous or refused finals',()=>{
  const raw=testOnlyFinalLiveInput(),p=raw.profiles[1].provider_responses['saved-1'];
  p.output[0].phase='final_answer';p.output[0].status='completed';
  p.output.unshift({type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'TEST_ONLY commentary, not JSON'}]});
  assert.equal(buildFinalLiveReview(raw).profiles[1].cases[0].api_status,'completed');
  p.output.push(structuredClone(p.output[1]));
  assert.throws(()=>buildFinalLiveReview(raw),/FINAL_LIVE_REVIEW_INVALID/);
  p.output.pop();p.output[1].content.push({type:'refusal',refusal:'TEST_ONLY'});
  assert.throws(()=>buildFinalLiveReview(raw),/FINAL_LIVE_REVIEW_INVALID/);
});
test('TEST_ONLY excluded Radar IDs must be unique and disjoint from the displayed subset',()=>{
  for(const mutate of [
    x=>x.excluded_events[1].event_id=x.excluded_events[0].event_id,
    x=>x.excluded_events[0].event_id=x.news.events[0].event_id,
  ]){const raw=testOnlyRadarSnapshot();mutate(raw);
    assert.throws(()=>validateRadarSnapshotReview(raw),/FINAL_LIVE_REVIEW_INVALID/);}
});
test('TEST_ONLY input source links do not acquire a model-only URL',()=>{
  const raw=testOnlyFinalLiveInput(),p=raw.profiles[1],decision=p.assessments['saved-1'].raw_model_decision;
  decision.events[0].source_url='https://example.com/TEST_ONLY/not-in-input';
  p.provider_responses['saved-1'].output[0].content[0].text=JSON.stringify(decision);
  p.runtime_results['saved-1'].decision=structuredClone(decision);
  const row=buildFinalLiveReview(raw).profiles[1].cases[0];
  assert.equal(row.sources.length,0);assert.equal(row.events.length,1);
});
test('TEST_ONLY the CLI keeps original base file bytes and all original JSON fields unchanged',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'TEST_ONLY-base-preserve-'));
  try{
    const root=join(folder,'source'),artifact=join(folder,'artifact');await mkdir(root);await mkdir(artifact);
    await fixtureArchive(artifact);
    const base=join(folder,'original-base.json'),output=join(folder,'attached.json'),value=reviewFixture();
    const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(base,bytes,{mode:0o600});
    const before=hash(await readFile(base));
    await attachOfflineReview({root,q3ArtifactDir:artifact,base,output,createdAt:'2026-11-14T10:00:00Z'});
    assert.equal(hash(await readFile(base)),before);
    const {final_live_review,...original}=JSON.parse(await readFile(output));
    assert.deepEqual(original,value);assert.equal(final_live_review.profiles.length,1);
    assert.equal((await stat(output)).mode&0o777,0o600);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('TEST_ONLY a fresh quality receipt stays scope-bound and does not claim native authentication',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'TEST_ONLY-quality-scope-'));
  try{
    const root=join(folder,'source'),artifact=join(folder,'artifact');await mkdir(root);await mkdir(artifact);
    await fixtureArchive(artifact);
    const profile=await loadArtifactProfile(artifact,'q3_one_real_company',{root});
    const path=join(folder,'quality.json'),receipt={schema:'final_live_scope_quality_receipt_v1',
      profile:'q3_one_real_company',run_id:profile.binding.run_id,artifact_id:profile.binding.artifact_id,
      archive_sha256:profile.binding.archive_sha256,reviewed_at:'2026-11-14T10:00:00Z',
      status:'reviewed_with_limitations',limitations:['TEST_ONLY selected source scope, not company-wide coverage']};
    await writeFile(path,JSON.stringify(receipt),{mode:0o600});
    const loaded=await loadArtifactProfile(artifact,'q3_one_real_company',{root,qualityReceipt:path});
    const value=buildFinalLiveReview({created_at:'2026-11-14T10:00:00Z',selected_profile:loaded.id,profiles:[loaded]});
    assert.equal(value.profiles[0].quality.status,'reviewed_with_limitations');
    assert.equal(value.profiles[0].binding.authenticated,undefined);
    assert.equal(value.profiles[0].quality.receipt_sha256,hash(await readFile(path)));
    for(const mutate of [x=>x.profile='legacy_six_request',x=>x.artifact_id='9999',
      x=>x.archive_sha256='d'.repeat(64),x=>x.reviewed_at='2026-11-14',
      x=>x.reviewed_at='2026-11-10T10:00:00Z']){
      const bad=structuredClone(receipt);mutate(bad);await writeFile(path,JSON.stringify(bad));
      await assert.rejects(loadArtifactProfile(artifact,'q3_one_real_company',{root,qualityReceipt:path}));
    }
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('TEST_ONLY a receipt cannot declare complete scope while an adoption or request is held',()=>{
  const raw=testOnlyFinalLiveInput();raw.profiles[0].quality={
    status:'complete_within_scope',receipt_sha256:'a'.repeat(64),limitations:['TEST_ONLY scope only']};
  assert.throws(()=>buildFinalLiveReview(raw),/FINAL_LIVE_REVIEW_INVALID/);
  raw.profiles[0].quality.status='reviewed_with_limitations';
  assert.equal(buildFinalLiveReview(raw).profiles[0].quality.held,2);
});
