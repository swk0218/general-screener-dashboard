export function reviewFixture() {
  const cutoff='2026-11-09T10:00:00Z',url='https://www.sec.gov/Archives/edgar/data/1/test.htm';
  const quote='TEST_ONLY company signed a contract.';
  const packet={task:'tenx',symbol:'TEST',company_name:'Test Company',as_of:cutoff,evidence:[{symbol:'TEST',url,published_at:cutoff,quote}]};
  const event={id:'test-contract',symbol:'TEST',q:2,published_at:cutoff,occurred_at:'2026-11-09',source_url:url,quote,reason:'TEST_ONLY confirmed contract.'};
  const row={rank:1,symbol:'TEST',company_name:'Test Company',tenx_score:70,growth_score:.5,value_score:.6,cash_score:.7,price_exposure:.8};
  return {legacy_review:{mode:'carry_only',evaluation_coverage:0,state_sha256:'c'.repeat(64),source_run_id:123,observed_by:cutoff,companies:[{symbol:'TEST',level:'watch',observations:1,missing_publication:1,action_dates:['2026-11-02']}]},schema:'gpt_private_review_v1',created_at:cutoff,source_files:['numeric','inputs','report'].map(name=>({name,sha256:'a'.repeat(64)})),numeric:{run_id:'123',result:{schema:'tenx2_result_v1',strategy:'TENX',created_at:cutoff,counts:{rankable:1,universe_raw:1},ranked_all:[row],top5:[row]}},samples:[{case_id:'test-case',packet,report:{case_id:'test-case',status:'sample_validated',production_adopted:false,collection_complete:false,scope:'reviewed_sec_excerpt_sample',request_hash:'b'.repeat(64),provider_status:'evaluated',model_decision:{events:[event],ai_evidence:null},sample_events:[event],usage:{input_tokens:100,output_tokens:50}}}]};
}
