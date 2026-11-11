import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBundle,numericRows,radarReviewProvenance} from '../src/review/review-model.js';
import {reviewFixture,radarReplayFixture} from './review-fixture.mjs';
test('review keeps original scores and order without assigning sample Q to the numeric run',()=>{
 const source=reviewFixture(),before=structuredClone(source),bundle=reviewBundle(source);
 assert.equal(bundle.numeric.result.ranked_all[0].tenx_score,70);
 assert.equal(bundle.numeric.result.ranked_all[0].adjusted_score,undefined);
 assert.equal(bundle.samples[0].report.sample_events[0].q,2);
 assert.deepEqual(numericRows(bundle,'test'),bundle.numeric.result.ranked_all);
 assert.deepEqual(source,before);
});
test('import refuses false production adoption, mismatched evidence and unsafe sources',()=>{
 for(const mutate of [
  x=>x.samples[0].report.production_adopted=true,
  x=>x.samples[0].report.collection_complete=true,
  x=>x.samples[0].report.sample_events[0]={...x.samples[0].report.sample_events[0],symbol:'OTHER'},
  x=>x.samples[0].packet.evidence[0].url='javascript:alert(1)',
  x=>x.samples[0].packet.evidence[0].quote='Different exact quote',
  x=>x.samples[0].packet.evidence[0].published_at='2030-01-01T00:00:00Z',
  x=>x.numeric.result.top5=[{symbol:'OTHER',tenx_score:72}],
  x=>x.numeric.result.ranked_all[0].rank=2
 ]){const fixture=reviewFixture();mutate(fixture);assert.throws(()=>reviewBundle(fixture),/REVIEW_BUNDLE_INVALID/);}
});

test('legacy observations remain a review hold and cannot imply company coverage',()=>{
 const fixture=reviewFixture();
 assert.equal(reviewBundle(fixture).legacy_review.evaluation_coverage,0);
 fixture.legacy_review.evaluation_coverage=1;
 assert.throws(()=>reviewBundle(fixture),/REVIEW_BUNDLE_INVALID/);
});


test('reviewed legacy eligibility retains all risks and actual Radar failure is never ready',()=>{
 const source=reviewFixture();
 source.legacy_review.mode='reviewed_retained';source.legacy_review.evaluation_coverage=1;
 source.legacy_review.reviewed_symbols=['TEST'];source.legacy_review.companies[0].reviewed=true;
 source.radar_validation={status:'incomplete',run_id:123,provider_requests:1,search_completed:false,reason:'provider_http_error',retries:0,actual_billing_confirmed:false};
 assert.equal(reviewBundle(source).legacy_review.companies[0].level,'watch');
 for(const mutate of [x=>x.legacy_review.reviewed_symbols=['OTHER'],x=>x.radar_validation.search_completed=true,x=>x.radar_validation.status='ready']){
  const bad=structuredClone(source);mutate(bad);assert.throws(()=>reviewBundle(bad),/REVIEW_BUNDLE_INVALID/);
 }
});

test('completed actual query cannot be relabelled as completed evidence analysis',()=>{
 const source=reviewFixture();
 source.radar_validation={status:'incomplete',run_id:42669057252,provider_requests:1,
  search_completed:false,search_queries_completed:1,reason:'search_evidence_incomplete',
  retries:0,actual_billing_confirmed:false,artifact_sha256:'a'.repeat(64),
  cutoff:'2026-11-09T17:52:26Z',analyzed_at:'2026-11-09T17:54:22Z'};
 assert.equal(reviewBundle(source).radar_validation.search_queries_completed,1);
 for(const change of [{search_completed:true},{search_queries_completed:0},{artifact_sha256:null},{status:'ready'}]){
  const bad=structuredClone(source);Object.assign(bad.radar_validation,change);
  assert.throws(()=>reviewBundle(bad),/REVIEW_BUNDLE_INVALID/);
 }
});

test('observed company review preserves numeric source and keeps missing Q distinct from zero',()=>{
 const source=reviewFixture();
 source.observed_review={schema:'observed_company_preview_v1',data_as_of:'2026-11-09T10:00:00Z',
  production_adopted:false,numeric_run_id:'123',monthly_allocation_microusd:4000000,cases:[{
   strategy:'tenx',symbol:'TEST',company_name:'Test Company',production_adopted:false,
   semantic_rule_status:'unevaluated',quantitative_score:70,q:null,adjusted_score:null,
   events:[],sources:[]}]};
 const before=structuredClone(source);
 assert.equal(reviewBundle(source).observed_review.cases[0].q,null);
 assert.deepEqual(source,before);
 for(const mutate of [x=>x.observed_review.cases[0].q=0,
  x=>x.observed_review.cases[0].quantitative_score=71,
  x=>x.observed_review.production_adopted=true,
  x=>x.observed_review.cases.push(structuredClone(x.observed_review.cases[0]))]){
  const bad=structuredClone(source);mutate(bad);assert.throws(()=>reviewBundle(bad),/REVIEW_BUNDLE_INVALID/);
 }
 source.observed_review.cases[0]={...source.observed_review.cases[0],semantic_rule_status:'cached',q:0,adjusted_score:70};
 assert.equal(reviewBundle(source).observed_review.cases[0].q,0);
});


test('actual Radar snapshot stays independent from Beta and historical source clocks',()=>{
 const b=reviewFixture();b.actual_radar_news={schema_version:'radar_news_v1',affects_beta:false,
 status:'ready',events:[],run_id:'123',policy_version:'fixture',
 cutoff_at:'2026-11-09T09:59:00Z',analyzed_at:'2026-11-09T10:00:00Z'};
 assert.equal(reviewBundle(b).actual_radar_news.events.length,0);
 b.actual_radar_news.affects_beta=true;assert.throws(()=>reviewBundle(b),/REVIEW_BUNDLE_INVALID/);
});


test('review distinguishes original live adoption from zero-call cached revalidation',()=>{
 const b=radarReplayFixture(),before=structuredClone(b);
 assert.equal(reviewBundle(b),b);
 assert.deepEqual(radarReviewProvenance(b),{originalRun:123,originalCount:1,replayCount:3,originalCutoff:b.created_at});
 assert.deepEqual(b,before);
 for(const mutate of [
  x=>x.radar_completion_review.final_receiver_revalidation.original_events=3,
  x=>x.radar_completion_review.final_receiver_revalidation.replay_events=1,
  x=>x.radar_completion_review.final_receiver_revalidation.model_calls=1,
  x=>x.actual_radar_news.status='ready',
  x=>x.radar_completion_review.final_receiver_revalidation.original_run=456,
  x=>x.radar_completion_review.latest_actual_report.cutoff='2026-11-08T10:00:00Z'
 ]){const bad=structuredClone(b);mutate(bad);assert.throws(()=>reviewBundle(bad),/REVIEW_BUNDLE_INVALID/);}
 assert.equal(radarReviewProvenance(reviewFixture()),null);
});


test('review keeps normalized exclusion and original proposal distinct and rejects a conflicting adopted Q',()=>{
 const source=reviewFixture();
 source.observed_review={schema:'observed_company_preview_v1',data_as_of:'2026-11-09T10:00:00Z',production_adopted:false,numeric_run_id:'123',monthly_allocation_microusd:4400000,cases:[{
  strategy:'tenx',symbol:'TEST',company_name:'TEST_ONLY',production_adopted:false,semantic_rule_status:'cached',quantitative_score:70,q:0,adjusted_score:70,
  events:[{quote:'TEST_ONLY donation.',reason:'TEST_ONLY 점수 제외',scoring_basis:'donation',scoring_excluded:true,scoring_exclusion_reason:'donation_excluded',mlg_state:'neutral',q:0,model_q:1}],sources:[]}]};
 const before=structuredClone(source);assert.equal(reviewBundle(source).observed_review.cases[0].events[0].model_q,1);assert.deepEqual(source,before);
 const bad=structuredClone(source);Object.assign(bad.observed_review.cases[0],{q:1,adjusted_score:71});assert.throws(()=>reviewBundle(bad),/REVIEW_BUNDLE_INVALID/);
 const malformed=structuredClone(source);malformed.observed_review.cases[0].events[0].scoring_exclusion_reason='private arbitrary prose';assert.throws(()=>reviewBundle(malformed),/REVIEW_BUNDLE_INVALID/);
});
