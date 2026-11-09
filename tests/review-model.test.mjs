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
