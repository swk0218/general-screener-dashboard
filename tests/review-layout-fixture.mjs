import {radarReplayFixture} from './review-fixture.mjs';
// Synthetic layout evidence only; no real company verdicts or market claims.
export function reviewLayoutFixture() {
  const b=radarReplayFixture(),stamp=new Date().toISOString();
  b.created_at=stamp;
  const ranked=Array.from({length:24},(_,i)=>({rank:i+1,symbol:'TEST'+String(i+1).padStart(2,'0'),company_name:'TEST_ONLY 예시 회사 '+String(i+1).padStart(2,'0'),tenx_score:80-i*.5,growth_score:.5,value_score:.6,cash_score:.7,price_exposure:.8}));
  b.numeric.result.ranked_all=ranked;b.numeric.result.top5=ranked.slice(0,5);b.numeric.result.counts.rankable=ranked.length;
  const reason='TEST_ONLY 예시 판단입니다. 확인한 계약과 실적 자료가 주요 사업에 기여할 가능성을 검토했습니다. 계약 체결과 실제 이행은 구분하며, 일정과 조건이 달라지면 영향도 달라질 수 있습니다. 이 문장은 화면의 읽기와 펼치기 동작을 확인하기 위한 합성 자료입니다. 실제 회사의 실적이나 시장 전망을 의미하지 않습니다. 원래 수치 점수와 별개로 제한된 사건 하나에 대한 제안을 확인합니다.';
  b.observed_review={schema:'observed_company_preview_v1',data_as_of:stamp,production_adopted:false,numeric_run_id:b.numeric.run_id,monthly_allocation_microusd:4400000,cases:['mlg','tenx'].flatMap(strategy=>ranked.map((r,i)=>({strategy,symbol:r.symbol,company_name:r.company_name,production_adopted:false,semantic_rule_status:i===23?'unevaluated':'cached',semantic_reason:i===23?'incomplete_collection':null,quantitative_score:r.tenx_score,q:i===23?null:1,adjusted_score:i===23?null:r.tenx_score+1,ai_supply:'eligible',ai_reason:reason,baseline_e:.65,proposed_e:.65,baseline_a:0,proposed_a:3,reviewer_note:'TEST_ONLY 검토 메모입니다. 확인 범위와 남은 조건을 구분하며 기존 위험을 해소로 바꾸지 않습니다.',events:[{quote:'TEST_ONLY confirmed contract.',reason,published_at:stamp,occurred_at:stamp.slice(0,10),mlg_state:'watch'}],sources:[{url:'https://example.com/TEST_ONLY/source/'+i,quote:'TEST_ONLY confirmed contract.',published_at:stamp,timezone_unknown:true}]})))};
  for(const event of b.actual_radar_news.events){event.published_at=stamp;event.headline='TEST_ONLY 예시 뉴스 · 정책 발표와 시장 전달 경로';event.event_id+='-'+event.sources[0].url.split('/').at(-1);event.summary=reason;event.why_it_matters='TEST_ONLY 조건부 시장 해석입니다. 실제 시장 반응을 주장하지 않습니다.';for(const s of event.sources)s.published_at=stamp;}
  b.actual_radar_news.events.forEach((e,i)=>e.headline+=' '+(i+1));
  Object.assign(b.actual_radar_news,{cutoff_at:stamp,analyzed_at:stamp,cached_cutoff_at:stamp,cached_analyzed_at:stamp});
  b.radar_completion_review.latest_actual_report.cutoff=stamp;b.radar_completion_review.final_receiver_revalidation.original_search_cutoff=stamp;
  return b;
}
