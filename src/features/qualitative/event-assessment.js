// Display only: producer-normalized scores remain authoritative.
const bases = ['business_event','analyst_view','donation','non_business'];
const states = ['neutral','positive','watch','severe','resolved'];
const exclusions = Object.freeze({
  analyst_view_excluded:'애널리스트 의견',
  donation_excluded:'기부 자체',
  non_business_excluded:'사업과 무관',
  numeric_duplicate_excluded:'수치에 이미 반영',
});
export function eventAssessment(event, strategy='MLG') {
  if(!event||typeof event!=='object'
    ||(event.scoring_basis!==undefined&&!bases.includes(event.scoring_basis))
    ||(event.scoring_excluded!==undefined&&typeof event.scoring_excluded!=='boolean')
    ||(event.quantitative_duplicate!==undefined&&typeof event.quantitative_duplicate!=='boolean')
    ||(event.new_state!==undefined&&typeof event.new_state!=='boolean')
    ||(event.q!==undefined&&(!Number.isInteger(event.q)||Math.abs(event.q)>3))
    ||(event.model_q!==undefined&&(!Number.isInteger(event.model_q)||Math.abs(event.model_q)>3))
    ||(event.mlg_state!==undefined&&!states.includes(event.mlg_state))
    ||(event.model_mlg_state!==undefined&&!states.includes(event.model_mlg_state)))return null;
  const reason=event.scoring_exclusion_reason;
  if(reason!==undefined&&!Object.hasOwn(exclusions,reason))return null;
  const classified=event.scoring_basis!==undefined;
  const expected=event.scoring_basis&&event.scoring_basis!=='business_event'
    ?event.scoring_basis+'_excluded':event.quantitative_duplicate===true?'numeric_duplicate_excluded':undefined;
  const excluded=event.scoring_excluded===true;
  if((expected&&(!excluded||reason!==expected))
    ||(reason&&!excluded)||(excluded&&!reason)
    ||(excluded&&((event.q!==undefined&&event.q!==0)
      ||(event.mlg_state!==undefined&&event.mlg_state!=='neutral'))))return null;
  if(excluded)return {excluded:true,tone:'neutral',label:'점수 제외',note:exclusions[reason],classified};
  if(strategy.toUpperCase()==='TENX'&&event.q!==undefined)
    return {excluded:false,tone:event.q>0?'positive':event.q<0?'negative':'neutral',
      label:`Q ${event.q>0?'+':''}${event.q}`,note:event.new_state===false?'일상적 이행·새 변화 없음':null,classified};
  const state=event.new_state===false?'neutral':event.mlg_state;
  const labels={positive:'긍정',neutral:'중립',watch:'위험 관찰',severe:'중대 위험',resolved:'해소 근거'};
  return {excluded:false,tone:['watch','severe'].includes(state)?'negative':state==='positive'?'positive':'neutral',
    label:labels[state]||'이전 저장 판정',note:event.new_state===false?'일상적 이행·새 변화 없음':null,classified};
}
