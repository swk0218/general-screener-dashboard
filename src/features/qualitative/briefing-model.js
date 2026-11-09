// Optional enrichment is isolated from the score/encryption contracts.
const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0,1200) : null;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
export function safeSourceUrl(value) {
  if(typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export const STATUS_COPY = Object.freeze({
  disabled:'분석 꺼짐', ready:'분석 완료', evaluated:'분석 완료', cached:'저장된 분석',
  fallback:'기존 판정 사용', unevaluated:'미평가', unavailable:'분석 불가', uncertain:'판정 보류',
  stale:'이전 자료', invalid:'분석 자료 확인 필요',
});
const COLLECTION_SCOPE_COPY = Object.freeze({
  fmp_stock_news_first_page:'FMP 뉴스 첫 페이지 중 시점 조건을 충족한 후보 범위',
  unverified_candidate_set:'선택 근거 범위 · 전체 사건 수집 미확인',
});
const unavailable = () => ({status:'invalid',label:STATUS_COPY.invalid,events:[],scores:[]});
export function publicationDisplay(source, cutoff) {
  if(!source || !timestamp(cutoff))return null;
  const raw=source.published_at, meta=source.publication_time;
  if(meta == null)return timestamp(raw)&&Date.parse(raw)<=Date.parse(cutoff)?{publishedAt:raw}:null;
  if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(raw)
    ||meta.basis!=='fmp_publishedDate_timezone_unspecified'||meta.precision!=='local_datetime_timezone_unknown'
    ||meta.timezone!==null||meta.offset_enclosure_hours!==24
    ||!timestamp(meta.earliest_utc)||!timestamp(meta.latest_utc))return null;
  // UTC-shaped anchor is arithmetic only, never an inferred publication timezone.
  const normalized=raw.replace(' ','T'),anchor=Date.parse(normalized+'Z');
  if(!Number.isFinite(anchor)||new Date(anchor).toISOString().slice(0,19)!==normalized.slice(0,19)
    ||Date.parse(meta.earliest_utc)!==anchor-86400000||Date.parse(meta.latest_utc)!==anchor+86400000
    ||Date.parse(meta.latest_utc)>Date.parse(cutoff))return null;
  return {publishedAt:raw,publicationTimeUnknown:true};
}
function collectionCopy(summary) {
  if(!summary||!['raw_count','admitted_count','excluded_count'].every(k=>Number.isSafeInteger(summary[k])&&summary[k]>=0)
    ||summary.admitted_count+summary.excluded_count>summary.raw_count||typeof summary.pagination_may_continue!=='boolean')return null;
  const uncertain=summary.uncertain_time_count;
  if(uncertain!==undefined&&(!Number.isSafeInteger(uncertain)||uncertain<0||uncertain>summary.excluded_count))return null;
  return `수집 ${summary.raw_count}건 · 시점 조건 채택 ${summary.admitted_count}건 · 제외 ${summary.excluded_count}건${uncertain>0?` · 발행 시각 경계 미확정 ${uncertain}건`:''}${summary.pagination_may_continue?' · 다음 페이지 후보가 더 있을 수 있음':''}`;
}
function stockEvent(event, cutoff, symbol) {
  const publication=publicationDisplay(event,cutoff);
  if(!event || !text(event.id) || event.symbol !== symbol || !publication || !safeSourceUrl(event.source_url)
    || !text(event.reason)) return null;
  return {id:event.id,summary:text(event.reason),...publication,sources:[{url:safeSourceUrl(event.source_url),label:'원문',quote:text(event.quote)}]};
}
export function stockBriefing(recommendation) {
  const q = recommendation?.qualitative;
  if(q == null) return null;
  if(!q || typeof q !== 'object' || !Object.hasOwn(STATUS_COPY,q.status)) return unavailable();
  const reasons={not_evaluated:'정성 평가를 수행하지 않았습니다.',incomplete_collection:'뉴스 수집 범위가 불완전해 정성 점수 반영을 보류했습니다.',configuration_missing:'정성 분석 설정을 확인할 수 없습니다.',readiness_or_evidence_blocked:'자금·근거 확인이 끝나지 않아 정성 점수 반영을 보류했습니다.',provider_or_contract_failure:'정성 분석 결과를 확인할 수 없어 기존 점수를 유지합니다.'};
  const base={status:q.status,label:STATUS_COPY[q.status],reason:Object.hasOwn(reasons,q.reason)?reasons[q.reason]:text(q.reason),events:[],scores:[],dataAsOf:timestamp(q.data_as_of)?q.data_as_of:null,analyzedAt:timestamp(q.analyzed_at)?q.analyzed_at:null};
  if(q.legacy_risk_retained===true&&Number.isSafeInteger(q.legacy_observation_count)&&q.legacy_observation_count>0&&q.legacy_observation_count<=2000)base.legacyCopy=`과거 위험 관찰 ${q.legacy_observation_count}건 유지 · 해소 검토 필요`;
  if(['evaluated','cached','unevaluated'].includes(q.status)&&Object.hasOwn(COLLECTION_SCOPE_COPY,q.collection_scope))base.scopeCopy=COLLECTION_SCOPE_COPY[q.collection_scope];
  if(['evaluated','cached','unevaluated'].includes(q.status)&&q.collection_scope==='fmp_stock_news_first_page')base.collectionCopy=collectionCopy(q.collection_summary);
  if(q.status==='unevaluated'&&recommendation.strategy==='TENX'&&finite(recommendation.quantitative_score)&&recommendation.ranking_basis==='quantitative_score'){
    base.scores=[['원점수 S',recommendation.quantitative_score],['사건 보정 Q','미평가'],['보정 점수 T','미산출']];
    base.rankingCopy='이번 전체 순위는 원점수 기준 · 정성 평가는 보류';
  }
  if(['disabled','fallback','unevaluated','unavailable','uncertain','stale'].includes(q.status))return base;
  if(!base.dataAsOf || !base.analyzedAt || Date.parse(base.analyzedAt)<Date.parse(base.dataAsOf)) return unavailable();
  if(recommendation.strategy === 'TENX') {
    const s=recommendation.quantitative_score,t=recommendation.adjusted_score,adjustment=recommendation.qualitative_adjustment;
    if(!finite(s)||!Number.isInteger(adjustment)||Math.abs(adjustment)>3||q.q!==adjustment
      ||!finite(t)||Math.abs(t-Math.max(0,Math.min(100,s+adjustment)))>1e-8
      ||!['adjusted_score','quantitative_score'].includes(recommendation.ranking_basis))return unavailable();
    const event=q.event?stockEvent(q.event,base.dataAsOf,recommendation.symbol):null;
    if((q.event&&!event)||(adjustment!==0&&!event))return unavailable();
    base.scores=[['원점수 S',s],['사건 보정 Q',adjustment],['보정 점수 T',t]];
    base.rankingCopy=recommendation.ranking_basis==='adjusted_score'?'이번 순위는 보정 점수 기준':'이번 순위는 원점수 기준 · 보정은 참고값';
    base.events=event?[event]:[];
    base.summary=event?.summary||base.reason||'평가된 후보에서 반영할 사건 없음';
    if(q.assessment_method==='verified_empty_candidate_set') {
      if(adjustment!==0||event||q.model!=='not_used'
        ||q.coverage?.scope!=='fmp_stock_news_first_page'
        ||q.coverage?.claim!=='retrieved_candidate_set_only')return unavailable();
      base.label='후보 확인 · 모델 미사용';
      base.summary='확인한 FMP 뉴스 후보 없음';
      base.coverageCopy='FMP 뉴스 첫 페이지에서 수집된 후보 범위에 한정합니다.';
      base.summary+=` · ${base.coverageCopy}`;
    }
  } else if(recommendation.strategy === 'MLG') {
    const validE=[0,.15,.35,.45,.55,.65,.82,.9];
    if(![q.legacy_a,q.adopted_a].every(v=>[0,3].includes(v))||![q.legacy_e,q.adopted_e].every(v=>validE.includes(v))||!Array.isArray(q.events)||q.events.length>3)return unavailable();
    const events=q.events.map(e=>stockEvent(e,base.dataAsOf,recommendation.symbol));
    if(events.some(e=>!e)||new Set(events.map(e=>e.id)).size!==events.length)return unavailable();
    if(!finite(q.score_delta)||Math.abs(q.score_delta-(6*(q.adopted_e-q.legacy_e)+(q.adopted_a-q.legacy_a)))>1e-8)return unavailable();
    base.scores=[['AI 공급',`${q.legacy_a} → ${q.adopted_a}`],['사건 E',`${q.legacy_e} → ${q.adopted_e}`],['총점 변화',q.score_delta]];
    base.events=events.slice(0,3);
    if(q.ai_evidence != null) {
      const evidence=q.ai_evidence;
      const publication=publicationDisplay(evidence,base.dataAsOf);
      const roles={semiconductor:'반도체 공급',compute_memory:'컴퓨팅·메모리 공급',connectivity:'연결 인프라 공급',datacenter_hardware:'데이터센터 장비 공급',model_cloud:'모델·클라우드 공급'};
      if(!['eligible','ineligible'].includes(q.ai_supply)||!evidence||evidence.symbol!==recommendation.symbol
        ||!safeSourceUrl(evidence.source_url)||!publication
        ||(q.ai_supply==='eligible'&&(!Object.hasOwn(roles,evidence.role)||q.adopted_a!==3))
        ||(q.ai_supply==='ineligible'&&q.adopted_a!==0))return unavailable();
      const summary=q.ai_supply==='eligible'?`AI 사업 판단 · ${roles[evidence.role]}`:'AI 사업 판단 · 공급 가점 제외 근거 확인';
      base.aiEvidence={id:'ai-supply',summary,...publication,sources:[{url:safeSourceUrl(evidence.source_url),label:'사업 근거 원문'}]};
    }
    base.summary=events[0]?.summary||base.aiEvidence?.summary||base.reason||'기존 산식으로 정성 판단 반영';
  } else return unavailable();
  return base;
}
export function radarBriefing(value, now=Date.now()) {
  if(value == null)return null;
  if(value.schema_version!=='radar_news_v1'||value.affects_beta!==false||!['disabled','ready','cached','unavailable'].includes(value.status)||!Array.isArray(value.events)||value.events.length>3)return unavailable();
  const base={status:value.status,label:STATUS_COPY[value.status],events:[],scores:[],dataAsOf:timestamp(value.cutoff_at)?value.cutoff_at:null,analyzedAt:timestamp(value.analyzed_at)?value.analyzed_at:null};
  if(['disabled','unavailable'].includes(value.status))return value.events.length?unavailable():base;
  if(!base.dataAsOf||!base.analyzedAt||Date.parse(base.analyzedAt)<Date.parse(base.dataAsOf)||!text(value.run_id)||!text(value.policy_version))return unavailable();
  if(!Number.isFinite(now)||Date.parse(base.dataAsOf)>now+300000||Date.parse(base.analyzedAt)>now+300000)return unavailable();
  const seen=new Set();
  for(const event of value.events) {
    if(!event||typeof event!=='object'||!text(event.event_id)||seen.has(event.event_id)||!text(event.headline)||!text(event.summary)||!text(event.why_it_matters)||!timestamp(event.published_at)||Date.parse(event.published_at)>Date.parse(base.dataAsOf)||!Array.isArray(event.sources)||!event.sources.length||event.sources.length>10||event.sources.some(s=>!s||typeof s!=='object'))return unavailable();
    seen.add(event.event_id);
    const sources=event.sources.map(source=>({url:safeSourceUrl(source.url),label:text(source.publisher)||'원문',quote:text(source.excerpt),publishedAt:source.published_at}));
    if(sources.some(s=>!s.url||!timestamp(s.publishedAt)||Date.parse(s.publishedAt)>Date.parse(base.dataAsOf)))return unavailable();
    base.events.push({id:event.event_id,headline:text(event.headline),summary:text(event.summary),why:text(event.why_it_matters),publishedAt:event.published_at,sources});
  }
  const sourceCutoff=value.status==='cached'?value.cached_cutoff_at:base.dataAsOf;
  if(value.status==='cached'&&(!timestamp(sourceCutoff)||Date.parse(sourceCutoff)>Date.parse(base.dataAsOf)))return unavailable();
  if(Number.isFinite(now)&&now-Date.parse(sourceCutoff)>24*60*60*1000){base.status='stale';base.label=STATUS_COPY.stale;}
  if(value.status==='cached'){
    if(!timestamp(value.cached_analyzed_at)||Date.parse(value.cached_analyzed_at)<Date.parse(sourceCutoff)||Date.parse(value.cached_analyzed_at)>Date.parse(base.analyzedAt))return unavailable();
    base.cacheDataAsOf=sourceCutoff;
    base.analyzedAt=value.cached_analyzed_at;
  }
  return base;
}

