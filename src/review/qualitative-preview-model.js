import {stockBriefing} from '../features/qualitative/briefing-model.js';

// This local review is a projection of an actual isolated API validation receipt.
// It grants neither a current numeric observation nor a cohort ranking.
export function qualitativePreview(value) {
  const row=value?.recommendation,receipt=value?.receipt;
  if(value?.schema!=='gpt_qualitative_review_v1'||value.numeric_current!==false
    ||value.full_cohort_evaluation!==false||typeof value.created_at!=='string'
    ||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value.created_at)||!Number.isFinite(Date.parse(value.created_at))
    ||!row||!['TENX','MLG'].includes(row.strategy)||!/^[A-Z0-9.^-]{1,20}$/.test(row.symbol)
    ||row.ranking_basis!=='quantitative_score'||!receipt
    ||!Number.isSafeInteger(receipt.provider_calls)||receipt.provider_calls<0||receipt.provider_calls>100
    ||typeof receipt.run_id!=='string'||!/^\d+$/.test(receipt.run_id)
    ||typeof receipt.source_sha!=='string'||!/^[a-f0-9]{40}$/.test(receipt.source_sha))throw Error('INVALID_QUALITATIVE_REVIEW');
  const briefing=stockBriefing(row);
  if(!briefing||briefing.status==='invalid')throw Error('INVALID_QUALITATIVE_REVIEW');
  if(row.strategy==='TENX'&&(typeof row.quantitative_score!=='number'
    ||!Number.isFinite(row.quantitative_score)||row.quantitative_score<0||row.quantitative_score>100))throw Error('INVALID_QUALITATIVE_REVIEW');
  return {createdAt:value.created_at,recommendation:row,
    receipt:{providerCalls:receipt.provider_calls,runId:receipt.run_id,sourceSha:receipt.source_sha}};
}
