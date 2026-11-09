import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBundle,numericRows} from '../src/review/review-model.js';
import {reviewFixture} from './review-fixture.mjs';
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
