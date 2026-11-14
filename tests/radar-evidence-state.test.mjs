import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,pbkdf2Sync,randomBytes} from 'node:crypto';
import {radarBriefing,radarSourceEvidence,RADAR_SOURCE_VERIFICATION_COPY} from '../src/features/qualitative/briefing-model.js';
import {decryptRadarNewsEnvelope} from '../src/features/qualitative/news-envelope.js';
const cutoff='2026-11-13T16:42:33Z',analysis='2026-11-13T18:24:23Z',published='2026-11-13T12:28:28Z';
const now=Date.parse(analysis)+60000;
const source=(grade='independent_original')=>({url:'https://example.com/TEST_ONLY_'+grade,publisher:'TEST_ONLY',
  excerpt:'TEST_ONLY_EXACT_SHORT_QUOTE',published_at:published,source_verification:grade,
  publication_time_unverified:grade==='provider_citation'});
const item=(id,grade)=>({event_id:id,headline:'TEST_ONLY 보도 제목',summary:'TEST_ONLY 확인된 보도',
  why_it_matters:'TEST_ONLY 조건부 시장 해석',published_at:published,sources:[source(grade)]});
const packet=()=>({schema_version:'radar_news_v1',policy_version:'gs-gpt-02-radar-v3',status:'ready',
  affects_beta:false,run_id:'TEST_ONLY',cutoff_at:cutoff,analyzed_at:analysis,
  events:[item('TEST_ONLY_REFERENCE','provider_citation'),item('TEST_ONLY_ORIGINAL','independent_original')],
  coverage:{search_complete:false,model_incomplete_reason:'excerpt_unverified',
    other_candidates_unverified:true,original_documents_not_all_verified:true}});
function seal(value,password){
  const salt=randomBytes(16),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,600000,32,'sha256'),iv);
  cipher.setAAD(Buffer.from('radar_news_v1'));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]);
  return {envelope_version:'radar_news_encrypted_v1',algorithm:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:600000,
    salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:encrypted.toString('base64'),
    payload_hash_kind:'ciphertext_sha256',payload_hash:createHash('sha256').update(encrypted).digest('hex')};
}

test('authenticated canonical payload keeps partial and both source grades through the consumer',async()=>{
  const value=packet(),before=structuredClone(value),password='TEST_ONLY_'+randomBytes(16).toString('hex');
  const decoded=await decryptRadarNewsEnvelope(seal(value,password),password);
  assert.deepEqual(decoded,value);
  const view=radarBriefing(decoded,now);
  assert.equal(view.status,'ready');assert.equal(view.searchComplete,false);assert.equal(view.incompleteReason,'excerpt_unverified');
  assert.equal(view.otherCandidatesUnverified,true);assert.equal(view.originalDocumentsNotAllVerified,true);
  assert.match(view.coverageCopy,/검색 검토가 미완료/);assert.match(view.coverageCopy,/원문의 인용과 발행 시각은 독립 검증되지/);
  assert.equal(view.events[0].sources[0].sourceVerification,'provider_citation');assert.equal(view.events[0].sources[0].quote,null);
  assert.equal(view.events[0].sources[0].publicationTimeVerified,false);
  assert.equal(view.events[1].sources[0].sourceVerification,'independent_original');
  assert.equal(view.events[1].sources[0].verificationScope,'received_excerpt_and_publication_clock');
  assert.equal(view.events[1].sources[0].publicationTimeConfidence,'independently_verified');
  assert.deepEqual(value,before);assert.deepEqual(view.scores,[]);
});

test('legacy source and absent coverage remain unknown rather than independently verified',()=>{
  const value=packet();value.events=value.events.slice(1);delete value.coverage;
  delete value.events[0].sources[0].source_verification;delete value.events[0].sources[0].publication_time_unverified;
  const view=radarBriefing(value,now),s=view.events[0].sources[0];
  assert.equal(view.searchComplete,null);assert.equal(view.otherCandidatesUnverified,null);
  assert.equal(view.originalDocumentsNotAllVerified,null);assert.equal(s.sourceVerification,'legacyunknown');
  assert.equal(s.publicationTimeVerified,null);assert.equal(s.publicationTimeUnverified,null);
  assert.equal(s.publicationTimeConfidence,'unknown');assert.equal(s.sourceReceivedAt,null);
  assert.equal(s.receivedByDataCutoff,null);assert.match(view.coverageCopy,/미기록/);
});

test('publication and source receipt clocks stay separate when receipt follows the cutoff',()=>{
  const value=source();value.retrieved_at='2026-11-13T16:42:36Z';
  const view=radarSourceEvidence(value,{dataAsOf:cutoff,analyzedAt:analysis});
  assert.equal(view.sourcePublishedAt,published);assert.equal(view.sourceReceivedAt,value.retrieved_at);
  assert.equal(view.receivedByDataCutoff,false);assert.equal(view.publicationTimeVerified,true);
  assert.equal(view.dataAsOf,cutoff);
});

test('malformed or conflicting receipt clocks are rejected without a guessed fallback',()=>{
  for(const change of [{received_at:'TEST_ONLY_BAD'},{retrieved_at:'2026-11-13T19:00:00Z'},
    {retrieved_at:'2026-11-13T11:00:00Z'},{retrieved_at:'2026-11-13T16:42:36Z',received_at:'2026-11-13T16:42:37Z'}]){
    assert.equal(radarSourceEvidence({...source(),...change},{dataAsOf:cutoff,analyzedAt:analysis}),null);
  }
});

test('malformed grades and clock flags cannot become positive verification',()=>{
  for(const change of [{source_verification:'TEST_ONLY_BAD'},{source_verification:null},
    {publication_time_unverified:'false'},{publication_time_unverified:null},
    {source_verification:'provider_citation',publication_time_unverified:false}]){
    const value=packet();Object.assign(value.events[1].sources[0],change);
    assert.equal(radarBriefing(value,now).status,'invalid');
  }
  assert.equal(Object.hasOwn(RADAR_SOURCE_VERIFICATION_COPY,'legacyunknown'),true);
});

test('unavailable empty keeps incomplete state and never becomes verified no-news',()=>{
  const value=packet();value.status='unavailable';value.events=[];
  const view=radarBriefing(value,now);
  assert.equal(view.status,'unavailable');assert.equal(view.emptyResultVerified,false);
  assert.equal(view.searchComplete,false);assert.equal(view.incompleteReason,'excerpt_unverified');
  assert.equal(view.originalDocumentsNotAllVerified,true);assert.match(view.coverageCopy,/미완료/);
});

test('only adequate complete empty can claim verified no-news',()=>{
  const value=packet();value.events=[];value.coverage={search_complete:true,model_incomplete_reason:null,
    other_candidates_unverified:false,original_documents_not_all_verified:false};
  assert.equal(radarBriefing(value,now).emptyResultVerified,true);
  const legacy=structuredClone(value);delete legacy.coverage;
  assert.equal(radarBriefing(legacy,now).status,'ready');assert.equal(radarBriefing(legacy,now).emptyResultVerified,false);
  const incomplete=structuredClone(value);incomplete.coverage.search_complete=false;
  assert.equal(radarBriefing(incomplete,now).status,'invalid');
  const evidenceGap=structuredClone(value);evidenceGap.coverage.original_documents_not_all_verified=true;
  assert.equal(radarBriefing(evidenceGap,now).status,'invalid');
});

test('cached and stale retain both warnings while source cutoff never advances',()=>{
  const value=packet();value.status='cached';value.cached_cutoff_at=cutoff;value.cached_analyzed_at=analysis;
  const view=radarBriefing(value,now+25*60*60*1000);
  assert.equal(view.status,'stale');assert.equal(view.cacheDataAsOf,cutoff);assert.equal(view.searchComplete,false);
  assert.equal(view.originalDocumentsNotAllVerified,true);assert.match(view.coverageCopy,/미완료/);assert.match(view.coverageCopy,/독립 검증되지/);
  const empty={...value,events:[],coverage:{search_complete:true}};
  assert.equal(radarBriefing(empty,now+25*60*60*1000).emptyResultVerified,false);
});

test('known legacy incomplete reason is retained and malformed coverage never upgrades',()=>{
  const value=packet();delete value.coverage.search_complete;
  assert.equal(radarBriefing(value,now).searchComplete,false);
  for(const mutate of [v=>v.coverage.search_complete='false',v=>v.coverage.other_candidates_unverified='true',
    v=>v.coverage.original_documents_not_all_verified=1,v=>v.coverage.model_incomplete_reason='TEST_ONLY_UNKNOWN',
    v=>v.coverage.search_complete=true,v=>v.coverage=[]]){
    const changed=structuredClone(value);mutate(changed);assert.equal(radarBriefing(changed,now).status,'invalid');
  }
});


test('cached receipt compares with retained source cutoff rather than the newer attempt cutoff',()=>{
  const value=packet();value.status='cached';value.events=value.events.slice(1);
  value.cutoff_at='2026-11-13T17:42:33Z';value.cached_cutoff_at=cutoff;value.cached_analyzed_at='2026-11-13T17:24:23Z';
  value.events[0].sources[0].retrieved_at='2026-11-13T16:42:36Z';
  const before=structuredClone(value),view=radarBriefing(value,now),source=view.events[0].sources[0];
  assert.equal(view.dataAsOf,value.cutoff_at);assert.equal(view.cacheDataAsOf,cutoff);
  assert.equal(source.sourceReceivedAt,'2026-11-13T16:42:36Z');
  assert.equal(source.dataAsOf,cutoff);assert.equal(source.receivedByDataCutoff,false);
  assert.equal(source.publicationTimeVerified,true);assert.deepEqual(value,before);
});
