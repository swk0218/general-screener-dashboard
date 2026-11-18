import {assertDashboardPayload} from '../data/contract.js';
import {isQuarantinedDashboardRun} from '../data/payload-quarantine.js';
import {stockBriefing} from '../features/qualitative/briefing-model.js';

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const stamp=value=>typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const accepted=new Set(['evaluated','cached']);
const fail=()=>{throw Error('COHORT_REVIEW_INVALID');};
const privateKey=/^(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|provider_(?:error|response|output)|raw_(?:request|response)|request_headers)$/i;
function containsPrivateFields(value){
  if(!value||typeof value!=='object')return false;
  return Object.entries(value).some(([key,item])=>privateKey.test(key)||containsPrivateFields(item));
}

// The normal Dashboard consumes native producer order. This reader verifies the
// whole cohort receipt without promoting every candidate into a recommendation.
export function cohortReview(value) {
  if(!record(value)||value.schema!=='gpt_cohort_review_v1'||!record(value.cohort)||containsPrivateFields(value))fail();
  const c=value.cohort;
  if(c.numeric_as_of!==undefined&&!stamp(c.numeric_as_of))fail();
  if(c.execution_status!==undefined){
    const billingBlocked=c.blocker==='github_billing_limit'&&typeof c.blocked_run_id==='string'&&/^\d+$/.test(c.blocked_run_id);
    const disabled=c.blocker==='qualitative_disabled'&&c.blocked_run_id===undefined;
    if(c.execution_status!=='not_run'||!(billingBlocked||disabled)
      ||!stamp(c.numeric_as_of)||c.status!=='partial'||c.evaluated_count!==0
      ||c.unevaluated_count!==c.expected_count||c.ranking_basis!=='quantitative_score')fail();
  }else if(c.blocker!==undefined||c.blocked_run_id!==undefined)fail();
  if(!['MLG','TENX'].includes(c.strategy)||!['complete','partial'].includes(c.status)
    ||!['quantitative_score','adjusted_score'].includes(c.ranking_basis)
    ||typeof c.run_id!=='string'||!c.run_id.trim()||c.run_id.length>100
    ||typeof c.source_sha!=='string'||!/^[a-f0-9]{40}$/.test(c.source_sha)||!stamp(c.cutoff_at)
    ||!Number.isSafeInteger(c.expected_count)||c.expected_count<1||c.expected_count>5000
    ||!Number.isSafeInteger(c.evaluated_count)||c.evaluated_count<0
    ||!Number.isSafeInteger(c.unevaluated_count)||c.unevaluated_count<0
    ||c.evaluated_count+c.unevaluated_count!==c.expected_count
    ||!Array.isArray(c.candidates)||c.candidates.length!==c.expected_count)fail();
  const seen=new Set();let evaluated=0;
  const candidates=c.candidates.map((candidate,index)=>{
    if(!record(candidate)||typeof candidate.symbol!=='string'||!/^[A-Z0-9.^-]{1,20}$/.test(candidate.symbol)
      ||seen.has(candidate.symbol)||candidate.rank!==index+1
      ||!['evaluated','cached','unevaluated'].includes(candidate.status))fail();
    seen.add(candidate.symbol);
    if(accepted.has(candidate.status)){
      evaluated++;
      if(c.strategy==='TENX'&&(!Number.isInteger(candidate.q)||Math.abs(candidate.q)>3))fail();
    }else if(candidate.q!==null)fail();
    return {symbol:candidate.symbol,rank:candidate.rank,status:candidate.status,
      q:c.strategy==='TENX'?candidate.q:null};
  });
  if(evaluated!==c.evaluated_count||(c.status==='complete')!==(c.unevaluated_count===0)
    ||c.status==='partial'&&c.ranking_basis!=='quantitative_score')fail();
  const payload=assertDashboardPayload(value.payload);
  if(payload.runs.some(isQuarantinedDashboardRun)||payload.recommendations.some(isQuarantinedDashboardRun))fail();
  if(!payload.runs.some(run=>run.strategy===c.strategy&&String(run.run_id)===c.run_id))fail();
  const picks=payload.recommendations.filter(row=>row.strategy===c.strategy&&String(row.run_id)===c.run_id);
  const limit=c.strategy==='TENX'?5:10;
  if(picks.length!==Math.min(limit,c.expected_count))fail();
  for(const [index,row] of picks.entries()){
    const candidate=candidates[index],briefing=stockBriefing(row);
    if(!candidate||row.symbol!==candidate.symbol||row.recommendation_rank!==candidate.rank
      ||row.ranking_basis!==c.ranking_basis||!briefing||briefing.status==='invalid'
      ||row.qualitative.status!==candidate.status
      ||c.strategy==='TENX'&&((row.qualitative_adjustment??null)!==candidate.q
        ||(row.qualitative.q??null)!==candidate.q
        ||row.score!==row[c.ranking_basis]))fail();
    if(c.execution_status==='not_run'&&(row.adjusted_score!=null
      ||row.qualitative.data_as_of!=null||row.qualitative.analyzed_at!=null))fail();
  }
  return {payload,cohort:{strategy:c.strategy,status:c.status,expectedCount:c.expected_count,
    evaluatedCount:c.evaluated_count,unevaluatedCount:c.unevaluated_count,
    rankingBasis:c.ranking_basis,runId:c.run_id,sourceSha:c.source_sha,cutoffAt:c.cutoff_at,candidates,
    ...(c.numeric_as_of?{numericAsOf:c.numeric_as_of}:{}),
    ...(c.execution_status?{executionStatus:c.execution_status,blocker:c.blocker,blockedRunId:c.blocked_run_id}:{})}};
}
