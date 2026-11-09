import { safeSourceUrl } from '../features/qualitative/briefing-model.js';

const finite = x => typeof x === 'number' && Number.isFinite(x);
const stamp = x => typeof x === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
const fail = () => { throw new Error('REVIEW_BUNDLE_INVALID'); };
export function reviewBundle(value) {
  if (!value || value.schema !== 'gpt_private_review_v1' || !stamp(value.created_at)
      || !Array.isArray(value.source_files) || value.source_files.length !== 3
      || value.source_files.some(x => !x || typeof x.name !== 'string' || !/^[a-f0-9]{64}$/.test(x.sha256))
      || !value.numeric || !/^\d+$/.test(value.numeric.run_id)) fail();
  const r = value.numeric.result;
  if (r?.schema !== 'tenx2_result_v1' || r.strategy !== 'TENX' || !stamp(r.created_at)
      || !Array.isArray(r.ranked_all) || !r.ranked_all.length || r.ranked_all.length > 5000
      || r.counts?.rankable !== r.ranked_all.length || !Array.isArray(r.top5)
      || r.top5.length !== Math.min(5, r.ranked_all.length)) fail();
  const seen = new Set();
  for (const [i,row] of r.ranked_all.entries()) {
    if (!row || !/^[A-Z0-9.^-]{1,20}$/.test(row.symbol) || seen.has(row.symbol)
        || row.rank !== i+1 || !finite(row.tenx_score) || row.tenx_score<0 || row.tenx_score>100
        || (i && r.ranked_all[i-1].tenx_score < row.tenx_score)) fail();
    seen.add(row.symbol);
  }
  if (r.top5.some((x,i) => x.symbol !== r.ranked_all[i].symbol || x.tenx_score !== r.ranked_all[i].tenx_score)) fail();
  if (!Array.isArray(value.samples) || value.samples.length > 10) fail();
  const ids = new Set();
  for (const sample of value.samples) {
    const p=sample?.packet, report=sample?.report;
    if (!p || !['mlg','tenx'].includes(p.task) || !/^[A-Z0-9.^-]{1,20}$/.test(p.symbol)
        || typeof p.company_name!=='string' || p.company_name.length>500 || !stamp(p.as_of) || typeof sample.case_id!=='string' || !sample.case_id || ids.has(sample.case_id)
        || report?.case_id!==sample.case_id || report.status!=='sample_validated'
        || report.production_adopted!==false || report.collection_complete!==false
        || report.scope!=='reviewed_sec_excerpt_sample' || !/^[a-f0-9]{64}$/.test(report.request_hash)
        || !Array.isArray(p.evidence) || !p.evidence.length || p.evidence.length>50
        || p.evidence.some(e=>!e || e.symbol!==p.symbol || !safeSourceUrl(e.url)
          || !stamp(e.published_at) || Date.parse(e.published_at)>Date.parse(p.as_of)
          || typeof e.quote!=='string' || e.quote.length>6000)
        || !report.model_decision || (p.task==='mlg' && typeof report.model_decision.ai_reason!=='string') || !Array.isArray(report.sample_events) || report.sample_events.length>3) fail();
    ids.add(sample.case_id);
    for (const e of report.sample_events) {
      if (!e || e.symbol!==p.symbol || !Number.isInteger(e.q) || Math.abs(e.q)>3
          || typeof e.id!=='string' || typeof e.reason!=='string' || typeof e.quote!=='string' || typeof e.occurred_at!=='string' || !stamp(e.published_at) || !safeSourceUrl(e.source_url)
          || !p.evidence.some(s=>s.url===e.source_url && s.published_at===e.published_at && s.quote.includes(e.quote))) fail();
    }
    const ai=report.model_decision.ai_evidence;
    if (ai && (typeof ai.quote!=='string' || !p.evidence.some(e=>e.url===ai.source_url && e.quote.includes(ai.quote)))) fail();
  }
  if(value.legacy_review!=null){
    const legacy=value.legacy_review;
    if(legacy.mode!=='carry_only'||legacy.evaluation_coverage!==0
      ||!Number.isSafeInteger(legacy.source_run_id)||legacy.source_run_id<=0
      ||!stamp(legacy.observed_by)||!/^[a-f0-9]{64}$/.test(legacy.state_sha256)
      ||!Array.isArray(legacy.companies)||!legacy.companies.length||legacy.companies.length>5000)fail();
    const symbols=new Set();
    for(const item of legacy.companies){
      if(!item||!/^[A-Z0-9.^-]{1,20}$/.test(item.symbol)||symbols.has(item.symbol)
        ||!['watch','severe'].includes(item.level)||!Number.isSafeInteger(item.observations)
        ||item.observations<=0||!Number.isSafeInteger(item.missing_publication)
        ||item.missing_publication<0||item.missing_publication>item.observations
        ||!Array.isArray(item.action_dates)||item.action_dates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)))fail();
      symbols.add(item.symbol);
    }
  }
  return value;
}
export function findSample(bundle, strategy) {
  return bundle.samples.find(x=>x.packet.task===strategy);
}
export function numericRows(bundle, query='') {
  const q=query.trim().toUpperCase();
  return bundle.numeric.result.ranked_all.filter(x=>!q || (x.symbol+' '+x.company_name).toUpperCase().includes(q));
}
