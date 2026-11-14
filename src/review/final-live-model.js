import {safeSourceUrl, radarBriefing} from '../features/qualitative/briefing-model.js';

export const FINAL_LIVE_PROFILES = Object.freeze({
  legacy_six_request: Object.freeze({expected_requests:6,actual_companies:2,fictional_controls:3,radar_requests:1}),
  q3_one_real_company: Object.freeze({expected_requests:1,actual_companies:1,fictional_controls:0,radar_requests:0}),
});
const ids={legacy_six_request:['saved-1','saved-2','control-a','control-b','control-c','radar-1'],q3_one_real_company:['saved-1']};
const fail=()=>{throw Error('FINAL_LIVE_REVIEW_INVALID');};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const head=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const identifier=x=>typeof x==='string'&&/^[0-9]+$/.test(x);
const stamp=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const clock=x=>x==null?null:stamp(x)?x:fail();
const nullableNumber=x=>x==null?null:finite(x)?x:fail();
const nullableBoolean=x=>x==null?null:typeof x==='boolean'?x:fail();
function text(x,n=2400,optional=true){
  if(x==null&&optional)return null;
  if(typeof x!=='string'||!x.trim()||x.length>n||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)
    ||/\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+\S{12,}|(?:api[_-]?key|authorization|password|secret)\s*[:=]\s*\S{6,})/i.test(x))fail();
  return x;
}
const integer=x=>Number.isSafeInteger(x)&&x>=0?x:fail();
const qValue=x=>x==null?null:Number.isInteger(x)&&Math.abs(x)<=3?x:fail();
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(x,k)).map(k=>[k,x[k]]));
function keys(x,allowed,strict){
  if(!object(x)||strict&&Object.keys(x).some(k=>!allowed.includes(k)))fail();
}
function binding(x,strict){
  const allowed=['artifact_id','run_id','source_head','archive_sha256','receipt_sha256'];
  keys(x,allowed,strict);
  if(!identifier(x.artifact_id)||!identifier(x.run_id)||!head(x.source_head)
    ||!hash(x.archive_sha256)||!hash(x.receipt_sha256))fail();
  return pick(x,allowed);
}
const eventKeys=['id','reason','source_url','published_at','occurred_at','q','model_q','mlg_state',
  'model_mlg_state','stage','scoring_basis','scoring_excluded','scoring_exclusion_reason',
  'quantitative_duplicate','new_state','confirmed'];
function eventDto(x,strict){
  keys(x,eventKeys,strict);const out={};
  for(const k of ['id','reason','occurred_at','stage','scoring_exclusion_reason'])
    if(x[k]!=null)out[k]=text(x[k],k==='reason'?2400:240,false);
  if(x.source_url!=null){if(!safeSourceUrl(x.source_url))fail();out.source_url=x.source_url;}
  // Naive producer publication clocks stay naive; they are never assigned a timezone.
  if(x.published_at!=null)out.published_at=text(x.published_at,100,false);
  for(const k of ['q','model_q'])if(x[k]!=null)out[k]=qValue(x[k]);
  for(const k of ['mlg_state','model_mlg_state'])if(x[k]!=null){
    if(!['positive','clean','neutral','routine','unknown','watch','severe'].includes(x[k]))fail();out[k]=x[k];
  }
  if(x.scoring_basis!=null){
    if(!['business_event','analyst_view','donation','non_business'].includes(x.scoring_basis))fail();
    out.scoring_basis=x.scoring_basis;
  }
  for(const k of ['scoring_excluded','quantitative_duplicate','new_state','confirmed'])
    if(x[k]!=null)out[k]=nullableBoolean(x[k]);
  return out;
}
function sourceDto(x,strict){
  keys(x,['url','label','published_at','timezone_unknown'],strict);
  if(!safeSourceUrl(x.url))fail();
  return {url:x.url,label:text(x.label,180),published_at:text(x.published_at,100),
    timezone_unknown:nullableBoolean(x.timezone_unknown)};
}
const adoptionKeys=['status','reason','q','quantitative_score','adjusted_score','baseline_e','baseline_a',
  'proposed_e','proposed_a','adopted_e','adopted_a','score_delta'];
function adoptionDto(x,strategy,strict){
  keys(x,adoptionKeys,strict);
  if(!['evaluated','cached','held','missing','unevaluated'].includes(x.status))fail();
  const out={status:x.status,reason:text(x.reason),q:qValue(x.q)};
  for(const k of adoptionKeys.filter(k=>!['status','reason','q'].includes(k)))out[k]=nullableNumber(x[k]);
  const accepted=['evaluated','cached'].includes(out.status);
  if(!accepted&&['q','adjusted_score','proposed_e','proposed_a','adopted_e','adopted_a','score_delta'].some(k=>out[k]!==null))fail();
  if(strategy!=='tenx'&&out.q!==null)fail();
  if(strategy==='tenx'&&accepted&&out.q===null)fail();
  if(out.quantitative_score!==null&&(out.quantitative_score<0||out.quantitative_score>100))fail();
  if(out.adjusted_score!==null&&(out.quantitative_score===null||out.q===null
    ||Math.abs(out.adjusted_score-Math.max(0,Math.min(100,out.quantitative_score+out.q)))>1e-9))fail();
  for(const k of ['baseline_e','proposed_e','adopted_e'])if(out[k]!==null&&(out[k]<0||out[k]>1))fail();
  for(const k of ['baseline_a','proposed_a','adopted_a'])if(out[k]!==null&&![0,3].includes(out[k]))fail();
  return out;
}
const caseKeys=['case_id','kind','strategy','symbol','company_name','source_cutoff','api_analyzed_at',
  'api_status','api_reason','collection_complete','adoption','ai_supply','ai_reason','events','sources'];
function caseDto(x,strict){
  keys(x,caseKeys,strict);
  if(!['actual_saved_company','fictional_control','radar'].includes(x.kind)
    ||!['mlg','tenx','radar'].includes(x.strategy)||(x.kind==='radar')!==(x.strategy==='radar')
    ||!['completed','failed','missing'].includes(x.api_status)
    ||!Array.isArray(x.events)||x.events.length>100||!Array.isArray(x.sources)||x.sources.length>50)fail();
  if(x.strategy!=='radar'&&(typeof x.symbol!=='string'||!/^[A-Z0-9._^-]{1,40}$/.test(x.symbol)))fail();
  if(x.ai_supply!=null&&!['eligible','ineligible','unknown'].includes(x.ai_supply))fail();
  const out={case_id:text(x.case_id,100,false),kind:x.kind,strategy:x.strategy,
    symbol:x.strategy==='radar'?null:x.symbol,company_name:text(x.company_name,500),
    source_cutoff:clock(x.source_cutoff),api_analyzed_at:clock(x.api_analyzed_at),
    api_status:x.api_status,api_reason:text(x.api_reason),collection_complete:nullableBoolean(x.collection_complete),
    adoption:adoptionDto(x.adoption,x.strategy,strict),ai_supply:x.ai_supply??null,
    ai_reason:text(x.ai_reason),events:x.events.map(e=>eventDto(e,strict)),sources:x.sources.map(s=>sourceDto(s,strict))};
  if(out.api_status!=='completed'&&['evaluated','cached'].includes(out.adoption.status))fail();
  return out;
}
const reportKeys=['api_status','recorded_status','expected_requests','actual_companies','fictional_controls',
  'radar_requests','recorded_provider_calls','estimated_cost_microusd','invoice_confirmed'];
function profileDto(x,strict){
  keys(x,['id','execution','report','cases','binding','quality'],strict);
  const config=FINAL_LIVE_PROFILES[x.id];if(!config)fail();
  keys(x.execution,['run_id','artifact_id','source_head','source_cutoff','analyzed_at','new_api_calls'],strict);
  const b=binding(x.binding,strict),e=x.execution;
  if(e.run_id!==b.run_id||e.artifact_id!==b.artifact_id||e.source_head!==b.source_head||e.new_api_calls!==0)fail();
  keys(x.report,reportKeys,strict);
  if(!['completed','partial','failed','missing'].includes(x.report.api_status)
    ||Object.entries(config).some(([k,v])=>x.report[k]!==v)||!Array.isArray(x.cases)
    ||x.cases.length>config.expected_requests)fail();
  const cases=x.cases.map(c=>caseDto(c,strict)),seen=new Set();
  for(const c of cases){
    if(!ids[x.id].includes(c.case_id)||seen.has(c.case_id))fail();seen.add(c.case_id);
    const kind=c.case_id==='radar-1'?'radar':c.case_id.startsWith('control-')?'fictional_control':'actual_saved_company';
    if(c.kind!==kind)fail();
  }
  const available=cases.filter(c=>c.api_status==='completed').length;
  const missing=config.expected_requests-cases.length+cases.filter(c=>c.api_status==='missing').length;
  const held=cases.filter(c=>['held','unevaluated','missing'].includes(c.adoption.status)).length;
  keys(x.quality,['scope','status','expected_requests','available_requests','missing','held','limitations','receipt_sha256'],strict);
  const quality=x.quality;
  if(quality.scope!==x.id||!['pending','reviewed_with_limitations','complete_within_scope','partial','held'].includes(quality.status)
    ||quality.expected_requests!==config.expected_requests||quality.available_requests!==available
    ||quality.missing!==missing||quality.held!==held||!Array.isArray(quality.limitations)
    ||!quality.limitations.length||quality.limitations.length>20
    ||(quality.receipt_sha256!==null&&!hash(quality.receipt_sha256))
    ||(quality.status!=='pending'&&quality.receipt_sha256===null)
    ||(quality.status==='complete_within_scope'&&(missing||held||available!==config.expected_requests)))fail();
  if(x.report.api_status==='completed'&&available!==config.expected_requests)fail();
  return {id:x.id,execution:{run_id:e.run_id,artifact_id:e.artifact_id,source_head:e.source_head,
    source_cutoff:clock(e.source_cutoff),analyzed_at:clock(e.analyzed_at),new_api_calls:0},
    report:{api_status:x.report.api_status,recorded_status:text(x.report.recorded_status,240),
      ...config,recorded_provider_calls:integer(x.report.recorded_provider_calls),
      estimated_cost_microusd:x.report.estimated_cost_microusd==null?null:integer(x.report.estimated_cost_microusd),
      invoice_confirmed:x.report.invoice_confirmed==null?null:x.report.invoice_confirmed===false?false:fail()},
    cases,binding:b,quality:{scope:x.id,status:quality.status,expected_requests:config.expected_requests,
      available_requests:available,missing,held,limitations:quality.limitations.map(v=>text(v,500,false)),
      receipt_sha256:quality.receipt_sha256}};
}
function finalDto(value,strict){
  keys(value,['schema','created_at','production_adopted','selected_profile','profiles'],strict);
  if(value.schema!=='final_live_company_review_v1'||!stamp(value.created_at)||value.production_adopted!==false
    ||!Array.isArray(value.profiles)||!value.profiles.length||value.profiles.length>2)fail();
  const profiles=value.profiles.map(p=>profileDto(p,strict));
  if(new Set(profiles.map(p=>p.id)).size!==profiles.length||!profiles.some(p=>p.id===value.selected_profile))fail();
  return {schema:value.schema,created_at:value.created_at,production_adopted:false,selected_profile:value.selected_profile,profiles};
}
export const validateFinalLiveReview=value=>finalDto(value,true);
export const finalLiveReview=bundle=>bundle.final_live_review==null?null:validateFinalLiveReview(bundle.final_live_review);
export const finalLiveProfiles=bundle=>finalLiveReview(bundle)?.profiles??[];
export function finalLiveRows(bundle,strategy,profileId){
  const value=finalLiveReview(bundle);
  return value?.profiles.find(p=>p.id===(profileId??value.selected_profile))?.cases.filter(c=>c.strategy===strategy)??[];
}

const canonical=x=>JSON.stringify(x,(_,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function actualDecision(provider){
  if(provider?.status!=='completed')return null;
  const messages=(provider.output??[]).filter(x=>x.type==='message'&&x.role==='assistant');
  const phased=messages.some(x=>x.phase!=null),chosen=phased?messages.filter(x=>x.phase==='final_answer'):messages;
  if(chosen.length!==1||(chosen[0].status!=null&&chosen[0].status!=='completed')
    ||(chosen[0].content??[]).some(x=>x.type==='refusal'))fail();
  const parts=(chosen[0].content??[]).filter(x=>x.type==='output_text').map(x=>x.text);
  if(!parts.length||parts.some(x=>typeof x!=='string'))fail();
  let decision;try{decision=JSON.parse(parts.join(''));}catch{fail();}
  if(!object(decision))fail();return decision;
}
function rawProfile(input){
  const config=FINAL_LIVE_PROFILES[input.id];if(!config)fail();
  const r=input.report,b=input.binding;
  if(!object(r)||r.production_adopted!==false||String(r.run_id)!==b?.run_id||r.code_sha!==b?.source_head
    ||r.saved_actual_cases!==config.actual_companies||r.fictional_controls!==config.fictional_controls
    ||r.radar_cases!==config.radar_requests||!Array.isArray(input.packets)||!Array.isArray(input.request_manifest))fail();
  const manifest=input.request_manifest.map(x=>x.case_id);
  if(new Set(manifest).size!==manifest.length||manifest.some(id=>!ids[input.id].includes(id)))fail();
  const cases=[];
  for(const id of ids[input.id]){
    const packet=input.packets.find(p=>p.case_id===id||(id==='radar-1'&&p.task==='radar_news'));
    if(!packet)continue; // Missing identities are counted, never fabricated.
    const a=input.assessments?.[id],provider=input.provider_responses?.[id],http=input.http_receipts?.[id];
    const runtimeResult=input.runtime_results?.[id],decision=actualDecision(provider);
    const responseId=provider?.id,requestHash=input.request_manifest.find(row=>row.case_id===id)?.request_hash;
    const complete=!!(decision&&typeof responseId==='string'&&responseId.trim()&&http?.http_status===200
      &&http.case_id===id&&http.provider_response_id===responseId&&manifest.includes(id));
    if(complete&&a&&(a.case_id!==id||a.production_adopted!==false
      ||canonical(a.raw_model_decision)!==canonical(decision)))fail();
    if(complete&&runtimeResult&&(canonical(runtimeResult.decision)!==canonical(decision)
      ||runtimeResult.request_hash!=null&&runtimeResult.request_hash!==requestHash))fail();
    if(complete&&a?.envelope?.request_hash!=null&&a.envelope.request_hash!==requestHash)fail();
    const adoptionBound=complete&&a&&runtimeResult&&hash(requestHash)
      &&runtimeResult.request_hash===requestHash&&a.envelope?.request_hash===requestHash;
    const adopted=a?.adoption??{},strategy=id==='radar-1'?'radar':packet.task;
    if(!['mlg','tenx','radar'].includes(strategy))fail();
    const status=complete?(strategy==='radar'?'held':!adoptionBound?'missing':
      ['evaluated','cached','unevaluated','held'].includes(adopted.status)?adopted.status:'held'):'missing';
    const accepted=['evaluated','cached'].includes(status);
    const adopt={status,reason:adopted.reason??(strategy==='radar'?'separate_snapshot_validation_required':null),
      q:accepted&&strategy==='tenx'?adopted.q??null:null,
      quantitative_score:adopted.quantitative_score??null,
      adjusted_score:accepted?adopted.adjusted_score??null:null,
      baseline_e:adopted.baseline_e??null,baseline_a:adopted.baseline_a??null};
    for(const k of ['proposed_e','proposed_a','adopted_e','adopted_a','score_delta'])adopt[k]=accepted?adopted[k]??null:null;
    const events=strategy==='radar'?[]:(decision?.events??[]);
    const links=new Set(events.map(e=>e.source_url).filter(Boolean));
    if(decision?.ai_evidence?.source_url)links.add(decision.ai_evidence.source_url);
    const evidence=packet.evidence??[];
    const sources=[...links].flatMap(url=>{
      const s=evidence.find(s=>s.url===url);
      return s?[{url,label:null,published_at:s.published_at??null,timezone_unknown:s.publication_time?true:null}]:[];
    });
    cases.push({case_id:id,kind:id==='radar-1'?'radar':id.startsWith('control-')?'fictional_control':'actual_saved_company',
      strategy,symbol:strategy==='radar'?null:packet.symbol,company_name:packet.company_name??null,
      source_cutoff:packet.as_of??null,api_analyzed_at:runtimeResult?.analysis_at??a?.envelope?.analysis_at??null,
      api_status:complete?'completed':provider?'failed':'missing',
      api_reason:a?.envelope?.reason??null,collection_complete:decision?.collection_complete??null,
      adoption:adopt,ai_supply:decision?.ai_supply??null,ai_reason:decision?.ai_reason??null,
      events:events.map(e=>eventDto(e,false)),sources});
  }
  const available=cases.filter(c=>c.api_status==='completed').length;
  const missing=config.expected_requests-cases.length+cases.filter(c=>c.api_status==='missing').length;
  const held=cases.filter(c=>['held','unevaluated','missing'].includes(c.adoption.status)).length;
  const quality=input.quality??{};
  return {id:input.id,execution:{run_id:b.run_id,artifact_id:b.artifact_id,source_head:b.source_head,
    source_cutoff:null,analyzed_at:null,new_api_calls:0},
    report:{...config,api_status:available===config.expected_requests?'completed':available?'partial':'missing',
      recorded_status:r.status,recorded_provider_calls:r.provider_calls,
      estimated_cost_microusd:r.configured_ceiling_rate_estimate_microusd??null,invoice_confirmed:false},
    cases,binding:b,quality:{scope:input.id,status:quality.status??'pending',expected_requests:config.expected_requests,
      available_requests:available,missing,held,receipt_sha256:quality.receipt_sha256??null,
      limitations:quality.limitations??['저장된 응답의 검토이며 새 모델 호출은 없습니다.',
        '기록된 입력 범위와 현재 회사 전체 수집은 별개입니다.','한정 품질 검토 영수증은 아직 연결되지 않았습니다.']}};
}
export function buildFinalLiveReview(input){
  if(input?.schema==='final_live_company_review_v1')return finalDto(input,false);
  if(!object(input)||!Array.isArray(input.profiles))fail();
  return finalDto({schema:'final_live_company_review_v1',created_at:input.created_at,
    production_adopted:false,selected_profile:input.selected_profile,profiles:input.profiles.map(rawProfile)},false);
}

function newsDto(value,strict){
  const allowed=['schema_version','status','affects_beta','run_id','policy_version','cutoff_at','analyzed_at',
    'cached_cutoff_at','cached_analyzed_at','coverage','events'];
  keys(value,allowed,strict);
  if(value.schema_version!=='radar_news_v1'||value.affects_beta!==false
    ||!['ready','cached'].includes(value.status)||!Array.isArray(value.events)
    ||!value.events.length||value.events.length>3)fail();
  keys(value.coverage,['search_complete','other_candidates_unverified','original_documents_not_all_verified','model_incomplete_reason'],strict);
  if(value.coverage.search_complete!==false||value.coverage.other_candidates_unverified!==true
    ||value.coverage.original_documents_not_all_verified!==true)fail();
  const coverage={search_complete:false,other_candidates_unverified:true,original_documents_not_all_verified:true};
  if(value.coverage.model_incomplete_reason!=null)coverage.model_incomplete_reason=text(value.coverage.model_incomplete_reason,160,false);
  const out={schema_version:value.schema_version,status:value.status,affects_beta:false,
    run_id:text(value.run_id,160,false),policy_version:text(value.policy_version,160,false),
    cutoff_at:clock(value.cutoff_at),analyzed_at:clock(value.analyzed_at),coverage,events:value.events.map(event=>{
      keys(event,['event_id','headline','summary','why_it_matters','published_at','sources','watch_point','market_impact'],strict);
      if(!Array.isArray(event.sources)||!event.sources.length||event.sources.length>10)fail();
      const projected={event_id:text(event.event_id,160,false),headline:text(event.headline,500,false),
        summary:text(event.summary,2400,false),why_it_matters:text(event.why_it_matters,2400,false),
        published_at:clock(event.published_at),sources:event.sources.map(source=>{
          keys(source,['url','publisher','excerpt','published_at','source_verification','publication_time_unverified','retrieved_at','received_at'],strict);
          if(!safeSourceUrl(source.url)||source.source_verification!=='independent_original'
            ||source.publication_time_unverified!==false)fail();
          const item={url:source.url,publisher:text(source.publisher,180,false),excerpt:text(source.excerpt,1200),
            published_at:clock(source.published_at),source_verification:'independent_original',publication_time_unverified:false};
          for(const key of ['retrieved_at','received_at'])if(source[key]!=null)item[key]=clock(source[key]);
          return item;
        })};
      if(event.watch_point!=null)projected.watch_point=text(event.watch_point,180,false);
      if(event.market_impact!=null){
        keys(event.market_impact,['direction','scope','condition'],strict);
        projected.market_impact={direction:text(event.market_impact.direction,30,false),
          scope:text(event.market_impact.scope,180,false),condition:text(event.market_impact.condition,240,false)};
      }
      return projected;
    })};
  for(const key of ['cached_cutoff_at','cached_analyzed_at'])if(value[key]!=null)out[key]=clock(value[key]);
  return out;
}

const snapshotKeys=['schema','status','prepared','review_kind','is_new_model_output','new_api_calls','news','binding',
  'label','clocks','canonical_source_sha256','source_snapshot_sha256','source_response_sha256',
  'excluded_event_count','original_canonical_event_count','excluded_events','scope_copy','freshness_copy','evidence_scope_copy'];
function snapshotDto(value,strict){
  keys(value,snapshotKeys,strict);
  if(value.schema!=='radar_verified_snapshot_review_v1'||value.status!=='prepared_verified_snapshot_partial_review'
    ||value.prepared!==true||value.review_kind!=='derived_verified_original_subset'
    ||value.is_new_model_output!==false||value.new_api_calls!==0
    ||!hash(value.canonical_source_sha256)||!hash(value.source_snapshot_sha256)||!hash(value.source_response_sha256)
    ||!Array.isArray(value.excluded_events)||value.excluded_events.length>3
    ||integer(value.excluded_event_count)!==value.excluded_events.length
    ||integer(value.original_canonical_event_count)!==value.excluded_event_count+value.news?.events?.length)fail();
  const clockKeys=['data_as_of','model_analysis_at','source_received_at','source_published_at','stored_replay_reviewed_at','content_reviewed_at'];
  keys(value.clocks,clockKeys,strict);
  const clocks=Object.fromEntries(clockKeys.map(k=>[k,clock(value.clocks[k])]));
  if(!clocks.content_reviewed_at||!clocks.data_as_of||!clocks.model_analysis_at)fail();
  const news=newsDto(value.news,strict),shown=radarBriefing(news,Date.parse(clocks.content_reviewed_at));
  if(!shown||!['ready','cached','stale'].includes(shown.status)||shown.events.length!==news.events.length
    ||Date.parse(news.cutoff_at)!==Date.parse(clocks.data_as_of))fail();
  const excluded=value.excluded_events.map(x=>{keys(x,['event_id','reason'],strict);
    return {event_id:text(x.event_id,160,false),reason:text(x.reason,500,false)};});
  const displayed=new Set(news.events.map(event=>event.event_id));
  if(new Set(excluded.map(event=>event.event_id)).size!==excluded.length
    ||excluded.some(event=>displayed.has(event.event_id)))fail();
  return {schema:value.schema,status:value.status,prepared:true,review_kind:value.review_kind,is_new_model_output:false,
    new_api_calls:0,news,binding:binding(value.binding,strict),label:text(value.label,240,false),clocks,
    canonical_source_sha256:value.canonical_source_sha256,source_snapshot_sha256:value.source_snapshot_sha256,
    source_response_sha256:value.source_response_sha256,excluded_event_count:value.excluded_event_count,
    original_canonical_event_count:value.original_canonical_event_count,
    excluded_events:excluded,
    scope_copy:text(value.scope_copy,1000,false),freshness_copy:text(value.freshness_copy,1000,false),
    evidence_scope_copy:text(value.evidence_scope_copy,1000,false)};
}
export const validateRadarSnapshotReview=value=>snapshotDto(value,true);
export const buildRadarSnapshotReview=value=>snapshotDto(value,false);

export function attachFinalLiveReview(base,review,radarSnapshot){
  if(!object(base)||Object.hasOwn(base,'final_live_review')||Object.hasOwn(base,'radar_snapshot_review'))fail();
  const out=structuredClone(base);
  out.final_live_review=validateFinalLiveReview(review);
  if(radarSnapshot!==undefined)out.radar_snapshot_review=validateRadarSnapshotReview(radarSnapshot);
  return out;
}
