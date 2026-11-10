export function reviewFixture() {
  const cutoff='2026-11-09T10:00:00Z',url='https://www.sec.gov/Archives/edgar/data/1/test.htm';
  const quote='TEST_ONLY company signed a contract.';
  const packet={task:'tenx',symbol:'TEST',company_name:'Test Company',as_of:cutoff,evidence:[{symbol:'TEST',url,published_at:cutoff,quote}]};
  const event={id:'test-contract',symbol:'TEST',q:2,published_at:cutoff,occurred_at:'2026-11-09',source_url:url,quote,reason:'TEST_ONLY confirmed contract.'};
  const row={rank:1,symbol:'TEST',company_name:'Test Company',tenx_score:70,growth_score:.5,value_score:.6,cash_score:.7,price_exposure:.8};
  return {legacy_review:{mode:'carry_only',evaluation_coverage:0,state_sha256:'c'.repeat(64),source_run_id:123,observed_by:cutoff,companies:[{symbol:'TEST',level:'watch',observations:1,missing_publication:1,action_dates:['2026-11-02']}]},schema:'gpt_private_review_v1',created_at:cutoff,source_files:['numeric','inputs','report'].map(name=>({name,sha256:'a'.repeat(64)})),numeric:{run_id:'123',result:{schema:'tenx2_result_v1',strategy:'TENX',created_at:cutoff,counts:{rankable:1,universe_raw:1},ranked_all:[row],top5:[row]}},samples:[{case_id:'test-case',packet,report:{case_id:'test-case',status:'sample_validated',production_adopted:false,collection_complete:false,scope:'reviewed_sec_excerpt_sample',request_hash:'b'.repeat(64),provider_status:'evaluated',model_decision:{events:[event],ai_evidence:null},sample_events:[event],usage:{input_tokens:100,output_tokens:50}}}]};
}


export function radarReplayFixture() {
  const b=reviewFixture(),cutoff=b.created_at;
  const events=Array.from({length:3},(_,i)=>({event_id:'TEST_ONLY-'+i,
    headline:'TEST_ONLY 뉴스 '+i,summary:'TEST_ONLY 확인된 사실',why_it_matters:'TEST_ONLY 조건부 해석',
    published_at:cutoff,sources:[{url:'https://example.com/news/'+i,publisher:'TEST_ONLY 매체',
      excerpt:'',published_at:cutoff,source_verification:'provider_citation',publication_time_unverified:true}]}));
  b.actual_radar_news={schema_version:'radar_news_v1',affects_beta:false,policy_version:'TEST_ONLY',
    status:'cached',run_id:'123-receiver-replay',cutoff_at:cutoff,analyzed_at:cutoff,
    cached_cutoff_at:cutoff,cached_analyzed_at:cutoff,events};
  b.radar_completion_review={current_display_is_cached_revalidation_not_new_paid_search:true,
    latest_actual_report:{status:'live_search_and_adoption_pass',news_status:'ready',events:1,
      provider_calls:1,cutoff},final_receiver_revalidation:{schema:'completed_search_source_binding_replay_v1',
      original_run:123,original_status:'ready',original_events:1,replay_status:'cached',replay_events:3,
      model_calls:0,http_calls:0,financial_writes:0,original_live_result_preserved:true,original_search_cutoff:cutoff}};
  return b;
}
