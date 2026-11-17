import test from 'node:test';
import assert from 'node:assert/strict';
import {qualitativePreview} from '../src/review/qualitative-preview-model.js';

export function previewFixture(){
 return {schema:'gpt_qualitative_review_v1',created_at:'2026-11-17T10:00:00Z',numeric_current:false,full_cohort_evaluation:false,
  receipt:{run_id:'123',source_sha:'a'.repeat(40),provider_calls:1,validation_summary:'PRIVATE_NOT_FOR_DISPLAY'},
  recommendation:{symbol:'TEST',strategy:'TENX',quantitative_score:70,ranking_basis:'quantitative_score',qualitative:{status:'unevaluated',q:null,reason:'provider_timeout'}}};
}
test('private preview retains producer numeric values and projects safe receipt fields',()=>{
 const input=previewFixture(),before=structuredClone(input),view=qualitativePreview(input);
 assert.deepEqual(view.recommendation,input.recommendation);assert.deepEqual(input,before);
 assert.equal(view.receipt.providerCalls,1);assert.doesNotMatch(JSON.stringify(view),/PRIVATE_NOT_FOR_DISPLAY/);
});
test('private preview refuses current ranking claims, invalid source identity and malformed enrichment',()=>{
 for(const change of [v=>v.numeric_current=true,v=>v.full_cohort_evaluation=true,v=>v.receipt.run_id='not-a-run',v=>v.receipt.source_sha='missing',v=>v.receipt.provider_calls=-1,v=>v.recommendation.ranking_basis='adjusted_score',v=>v.recommendation.qualitative.status='wrong',v=>v.recommendation.quantitative_score=null]){
  const input=previewFixture();change(input);assert.throws(()=>qualitativePreview(input),/INVALID_QUALITATIVE_REVIEW/);
 }
});
