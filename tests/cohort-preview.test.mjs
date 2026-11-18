import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cohortReview} from '../src/review/cohort-preview-model.js';
import {cohortPreviewServer} from '../scripts/cohort-preview-server.mjs';
import {cohortPreviewFixture,notRunCohortPreviewFixture} from './cohort-preview-fixture.mjs';

test('full cohort receipt reconciles every native rank and preserves the actual Dashboard payload',()=>{
  const input=cohortPreviewFixture(),before=structuredClone(input),result=cohortReview(input);
  assert.deepEqual(result.payload,input.payload);assert.deepEqual(input,before);
  assert.equal(result.cohort.evaluatedCount,2);assert.equal(result.cohort.candidates.length,2);
  for(const change of [v=>v.cohort.candidates.pop(),v=>v.cohort.evaluated_count=1,
    v=>v.cohort.candidates[1].symbol='TESTA',v=>v.cohort.candidates[1].rank=3,
    v=>v.payload.recommendations[0].qualitative_adjustment=3,
    v=>v.payload.recommendations[0].symbol='OTHER',v=>v.payload.api_key='TEST_ONLY_PRIVATE',
    v=>v.cohort.candidates[0].provider_response={text:'TEST_ONLY_PRIVATE'}]){
    const invalid=cohortPreviewFixture();change(invalid);assert.throws(()=>cohortReview(invalid),/COHORT_REVIEW_INVALID/);
  }
});

test('partial cohort keeps the whole run on S and never fills an unevaluated Q with zero',()=>{
  const value=cohortPreviewFixture();Object.assign(value.cohort,{status:'partial',evaluated_count:1,unevaluated_count:1,ranking_basis:'quantitative_score'});
  Object.assign(value.cohort.candidates[0],{status:'unevaluated',q:null});
  for(const row of value.payload.recommendations.filter(row=>row.strategy==='TENX')){row.ranking_basis='quantitative_score';row.score=row.quantitative_score;}
  const row=value.payload.recommendations[0];row.qualitative={status:'unevaluated',reason:'provider_timeout'};
  delete row.qualitative_adjustment;delete row.adjusted_score;
  assert.equal(cohortReview(value).cohort.candidates[0].q,null);
  value.cohort.ranking_basis='adjusted_score';assert.throws(()=>cohortReview(value),/COHORT_REVIEW_INVALID/);
});

test('a job blocked before start stays NOT_RUN with a separate numeric source clock',()=>{
  const input=notRunCohortPreviewFixture(),result=cohortReview(input);
  assert.equal(result.cohort.executionStatus,'not_run');assert.equal(result.cohort.evaluatedCount,0);
  assert.equal(result.cohort.numericAsOf,input.cohort.numeric_as_of);
  assert.equal(result.cohort.blockedRunId,'999001');
  for(const change of [v=>v.cohort.execution_status='completed',v=>v.cohort.evaluated_count=1,
    v=>v.cohort.numeric_as_of='not-a-clock',v=>v.cohort.blocker='unknown',
    v=>delete v.cohort.execution_status,v=>v.cohort.ranking_basis='adjusted_score',
    v=>v.payload.recommendations[0].score=72,v=>v.payload.recommendations[0].adjusted_score=70,
    v=>v.payload.recommendations[0].qualitative.analyzed_at=v.cohort.numeric_as_of]){
    const invalid=notRunCohortPreviewFixture();change(invalid);assert.throws(()=>cohortReview(invalid),/COHORT_REVIEW_INVALID/);
  }
});

test('private preview source is dev-only, loopback-only, outside the checkout and never logs its path',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cohort-review-server-'));
  try{
    const root=join(directory,'checkout');await mkdir(root);
    const input=join(directory,'actual-review.json');await writeFile(input,JSON.stringify(cohortPreviewFixture()));
    async function request({file=input,address='127.0.0.1',host='127.0.0.1:4178',origin,method='GET'}={}){
      const plugin=cohortPreviewServer({file});assert.equal(plugin.apply,'serve');plugin.configResolved({root});
      let handler;plugin.configureServer({middlewares:{use(value){handler=value;}}});
      const result={headers:{},statusCode:200,body:null};
      await handler({url:'/__development/cohort-review',method,socket:{remoteAddress:address},headers:{host,...(origin?{origin}:{})}},
        {setHeader(key,value){result.headers[key]=value;},set statusCode(value){result.statusCode=value;},end(body){result.body=body;}},()=>{throw Error('unexpected next');});
      return result;
    }
    const okay=await request();assert.equal(okay.statusCode,200);assert.equal(okay.headers['Cache-Control'],'no-store');
    assert.deepEqual(JSON.parse(okay.body),cohortPreviewFixture());
    for(const args of [{address:'10.0.0.2'},{host:'public.example.com'},{origin:'https://attacker.example'},{origin:'http://127.0.0.1:9999'}]){
      assert.equal((await request(args)).statusCode,403);
    }
    assert.equal((await request({method:'POST'})).statusCode,405);
    const inside=join(root,'private.json');await writeFile(inside,JSON.stringify(cohortPreviewFixture()));
    for(const file of [inside,join(directory,'missing.json'),'relative.json','']){
      const rejected=await request({file});assert.equal(rejected.statusCode,503);assert.doesNotMatch(rejected.body,/checkout|missing|private\.json/);
    }
    await writeFile(input,'{"api_key":"TEST_ONLY_PRIVATE"}');
    const rejected=await request();assert.equal(rejected.statusCode,503);assert.doesNotMatch(rejected.body,/TEST_ONLY_PRIVATE/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
