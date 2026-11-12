import {radarReplayFixture} from './review-fixture.mjs';
export function followupFixture() {
  const b=radarReplayFixture(),event={quote:'TEST_ONLY actual issuance.',reason:'TEST_ONLY 원래 판단',published_at:b.created_at,occurred_at:'2026-11-09',mlg_state:'watch'};
  b.observed_review={schema:'observed_company_preview_v1',data_as_of:b.created_at,production_adopted:false,numeric_run_id:'123',monthly_allocation_microusd:4400000,cases:[{strategy:'tenx',symbol:'TEST',company_name:'TEST_ONLY',production_adopted:false,semantic_rule_status:'cached',quantitative_score:70,q:-1,adjusted_score:69,events:[event],sources:[]}]};
  const source={url:'https://example.com/followup',label:'TEST_ONLY 추가 원문',evidence_class:'issuer_original_full_text_web_read',note:'TEST_ONLY 발행 완료 확인. 실제 발행 전 주식 수는 미확인.',verified_published_at:b.created_at};
  const news=b.actual_radar_news.events[0];
  b.review_followup={schema:'private_review_followup_v1',kind:'retrospective_manual_review',reviewed_at:b.created_at,model_calls:0,production_adopted:false,source_html_sha256:'d'.repeat(64),source_ciphertext_sha256:'e'.repeat(64),company:[{strategy:'tenx',symbol:'TEST',event_binding:{quote:event.quote,published_at:event.published_at,occurred_at:event.occurred_at},note:'TEST_ONLY 별도 사실 확인. 원래 Q와 시각 보존.',sources:[source]}],news:[{event_id:news.event_id,original_source_url:news.sources[0].url,original_published_at:news.published_at,note:'TEST_ONLY 원래 시각과 별도 확인 시각을 함께 보존합니다.',watch_point:'TEST_ONLY 정책의 실제 이행을 확인',market_impact:{direction:'mixed',scope:'TEST_ONLY 미국 주식·에너지 업종',condition:'TEST_ONLY 비용 완화와 생산자 부담이 함께 있을 때'},sources:[source]}]};
  return b;
}
