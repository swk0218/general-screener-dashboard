// Layout and interaction evidence only. These are not real companies or API results.
export function cohortPreviewFixture() {
  const cutoff='2026-11-18T08:00:00Z',analyzed='2026-11-18T08:01:00Z';
  const event={id:'TEST_ONLY-contract',symbol:'TESTA',published_at:'2026-11-17T12:00:00Z',
    source_url:'https://example.com/TEST_ONLY/contract',quote:'TEST_ONLY disclosed contract.',
    reason:'TEST_ONLY 확정된 계약의 사업 영향을 확인했습니다.',q:2,mlg_state:'positive',
    scoring_basis:'business_event',new_state:true};
  const first={strategy:'TENX',run_id:'TEST_ONLY-tenx',symbol:'TESTA',company_name:'TEST_ONLY 회사 A',
    recommendation_rank:1,score:72,screening_price:100,current_price:null,current_price_as_of:null,
    quantitative_score:70,qualitative_adjustment:2,adjusted_score:72,ranking_basis:'adjusted_score',
    risk_flags:'event_risk_status=available',qualitative:{status:'evaluated',q:2,event,
      data_as_of:cutoff,analyzed_at:analyzed,collection_scope:'fmp_stock_news_first_page',
      collection_summary:{raw_count:2,admitted_count:2,excluded_count:0,pagination_may_continue:false}}};
  const second={...first,symbol:'TESTB',company_name:'TEST_ONLY 회사 B',recommendation_rank:2,
    score:65,quantitative_score:65,qualitative_adjustment:0,adjusted_score:65,
    qualitative:{status:'evaluated',q:0,event:null,data_as_of:cutoff,analyzed_at:analyzed,
      assessment_method:'verified_empty_candidate_set',model:'not_used',
      coverage:{scope:'fmp_stock_news_first_page',claim:'retrieved_candidate_set_only'}}};
  const mlg={strategy:'MLG',run_id:'TEST_ONLY-mlg',symbol:'TESTAI',company_name:'TEST_ONLY AI 회사',
    recommendation_rank:1,score:63,screening_price:100,current_price:null,current_price_as_of:null,
    risk_flags:'event_risk_status=available',qualitative:{status:'evaluated',legacy_a:0,adopted_a:3,
      legacy_e:.65,adopted_e:.65,score_delta:3,data_as_of:cutoff,analyzed_at:analyzed,events:[],
      ai_supply:'eligible',ai_evidence:{symbol:'TESTAI',source_url:'https://example.com/TEST_ONLY/ai',
        published_at:'2026-11-17T12:00:00Z',role:'model_cloud'}}};
  const payload={contract_version:'general_screener_v2',generated_at:analyzed,benchmark:'QQQ',
    evidence_status:'HOLD: DEVELOPMENT_REVIEW',runs:[{strategy:'TENX',run_id:'TEST_ONLY-tenx',
      report_created_at:analyzed},{strategy:'MLG',run_id:'TEST_ONLY-mlg',report_created_at:analyzed}],
    recommendations:[first,second,mlg],performance:{aggregates:[],signals:[]}};
  return {schema:'gpt_cohort_review_v1',payload,
    cohort:{strategy:'TENX',status:'complete',expected_count:2,evaluated_count:2,unevaluated_count:0,
      ranking_basis:'adjusted_score',run_id:'TEST_ONLY-tenx',source_sha:'a'.repeat(40),cutoff_at:cutoff,
      candidates:[{symbol:'TESTA',status:'evaluated',q:2,rank:1},{symbol:'TESTB',status:'evaluated',q:0,rank:2}]}};
}
