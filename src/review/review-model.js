import {eventAssessment} from '../features/qualitative/event-assessment.js';
import {reviewFollowup} from './followup-model.js';
import { safeSourceUrl, radarBriefing } from '../features/qualitative/briefing-model.js';

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
    if(!['carry_only','reviewed_retained'].includes(legacy.mode)||!Number.isSafeInteger(legacy.evaluation_coverage)||legacy.evaluation_coverage<0
      ||!Number.isSafeInteger(legacy.source_run_id)||legacy.source_run_id<=0
      ||!stamp(legacy.observed_by)||!/^[a-f0-9]{64}$/.test(legacy.state_sha256)
      ||!Array.isArray(legacy.companies)||!legacy.companies.length||legacy.companies.length>5000)fail();
    const reviewed=legacy.reviewed_symbols||[];
    if(!Array.isArray(reviewed)||new Set(reviewed).size!==reviewed.length
      ||reviewed.length!==legacy.evaluation_coverage
      ||(legacy.mode==='carry_only'&&reviewed.length!==0)
      ||(legacy.mode==='reviewed_retained'&&reviewed.length===0))fail();
    const symbols=new Set();
    for(const item of legacy.companies){
      if(!item||!/^[A-Z0-9.^-]{1,20}$/.test(item.symbol)||symbols.has(item.symbol)
        ||!['watch','severe'].includes(item.level)||!Number.isSafeInteger(item.observations)
        ||item.observations<=0||!Number.isSafeInteger(item.missing_publication)
        ||item.missing_publication<0||item.missing_publication>item.observations
        ||!Array.isArray(item.action_dates)||item.action_dates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)))fail();
      if(item.reviewed!==undefined&&item.reviewed!==reviewed.includes(item.symbol))fail();
      if(item.review_reason!=null&&(typeof item.review_reason!=='string'||item.review_reason.length>1200))fail();
      symbols.add(item.symbol);
    }
    if(reviewed.some(symbol=>!symbols.has(symbol)))fail();
  }
  if(value.radar_validation!=null){
    const r=value.radar_validation;
    if(r.status!=='incomplete'||!Number.isSafeInteger(r.run_id)||r.run_id<=0
      ||r.provider_requests!==1||r.search_completed!==false
      ||!['provider_http_error','search_evidence_incomplete'].includes(r.reason)
      ||r.retries!==0||r.actual_billing_confirmed!==false)fail();
    if(r.reason==='search_evidence_incomplete'&&(r.search_queries_completed!==1
      ||!/^[a-f0-9]{64}$/.test(r.artifact_sha256)||!stamp(r.cutoff)||!stamp(r.analyzed_at)
      ||Date.parse(r.analyzed_at)<Date.parse(r.cutoff)))fail();
  }
  if(value.observed_review!=null){
    const r=value.observed_review;
    if(r.schema!=='observed_company_preview_v1'||!stamp(r.data_as_of)
      ||r.production_adopted!==false||r.numeric_run_id!==value.numeric.run_id
      ||!Number.isSafeInteger(r.monthly_allocation_microusd)||r.monthly_allocation_microusd>50000000
      ||!Array.isArray(r.cases)||r.cases.length>300)fail();
    const ids=new Set();
    for(const c of r.cases){
      const key=c.strategy+':'+c.symbol;
      if(!['mlg','tenx'].includes(c.strategy)||!/^[A-Z0-9.^-]{1,20}$/.test(c.symbol)
        ||ids.has(key)||typeof c.company_name!=='string'||c.production_adopted!==false
        ||!['evaluated','cached','unevaluated'].includes(c.semantic_rule_status)
        ||!Array.isArray(c.events)||c.events.length>100||!Array.isArray(c.sources)||c.sources.length>50
        ||c.sources.some(x=>!safeSourceUrl(x.url)||typeof x.quote!=='string'||x.quote.length>6000
          ||typeof x.published_at!=='string')
        ||c.events.some(e=>!eventAssessment(e,c.strategy,c.semantic_rule_status==='unevaluated')||typeof e.quote!=='string'||typeof e.reason!=='string'
          ||(e.source_url!==undefined&&!safeSourceUrl(e.source_url))))fail();
      if(c.strategy==='tenx'){
        if(c.q!==null&&c.q!==0&&c.events.length&&c.events.every(e=>eventAssessment(e,c.strategy).excluded))fail();
        const original=value.numeric.result.ranked_all.find(x=>x.symbol===c.symbol);
        if(!original||c.quantitative_score!==original.tenx_score)fail();
        if(['evaluated','cached'].includes(c.semantic_rule_status)
          &&(!Number.isInteger(c.q)||Math.abs(c.q)>3||!finite(c.adjusted_score)
            ||Math.abs(c.adjusted_score-Math.max(0,Math.min(100,c.quantitative_score+c.q)))>1e-9))fail();
        if(c.semantic_rule_status==='unevaluated'&&(c.q!==null||c.adjusted_score!==null))fail();
      }
      ids.add(key);
    }
  }
  if(value.actual_radar_news!=null){
    const n=value.actual_radar_news;
    if(n.schema_version!=='radar_news_v1'||n.affects_beta!==false
      ||!['ready','cached','unavailable'].includes(n.status)||!Array.isArray(n.events)
      ||n.events.length>3||radarBriefing(n,Date.parse(value.created_at))?.status!==n.status)fail();
  }
  radarReviewProvenance(value);
  reviewFollowup(value);
  return value;
}
export function findSample(bundle, strategy) {
  return bundle.samples.find(x=>x.packet.task===strategy);
}
export function numericRows(bundle, query='') {
  const q=query.trim().toUpperCase();
  return bundle.numeric.result.ranked_all.filter(x=>!q || (x.symbol+' '+x.company_name).toUpperCase().includes(q));
}

// Keep the original paid result separate from later deterministic receiver work.
export function radarReviewProvenance(value) {
  const review=value.radar_completion_review;
  if(review==null)return null;
  const proof=review.final_receiver_revalidation,live=review.latest_actual_report,n=value.actual_radar_news;
  const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=3;
  if(!proof||proof.schema!=='completed_search_source_binding_replay_v1'
    ||!Number.isSafeInteger(proof.original_run)||proof.original_run<=0
    ||!count(proof.original_events)||!count(proof.replay_events)
    ||proof.original_status!=='ready'||proof.replay_status!=='cached'
    ||proof.model_calls!==0||proof.http_calls!==0||proof.financial_writes!==0
    ||proof.original_live_result_preserved!==true
    ||review.current_display_is_cached_revalidation_not_new_paid_search!==true
    ||live?.status!=='live_search_and_adoption_pass'||live.news_status!==proof.original_status
    ||live.events!==proof.original_events||live.provider_calls!==1
    ||!stamp(live.cutoff)||!stamp(proof.original_search_cutoff)
    ||Date.parse(live.cutoff)!==Date.parse(proof.original_search_cutoff)
    ||n?.status!=='cached'||n.events.length!==proof.replay_events
    ||String(n.run_id).split('-')[0]!==String(proof.original_run)
    ||!stamp(n.cached_cutoff_at)||Date.parse(n.cached_cutoff_at)!==Date.parse(proof.original_search_cutoff))fail();
  return {originalRun:proof.original_run,originalCount:proof.original_events,
    replayCount:proof.replay_events,originalCutoff:proof.original_search_cutoff};
}
