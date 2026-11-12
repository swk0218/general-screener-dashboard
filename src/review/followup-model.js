import {safeSourceUrl} from '../features/qualitative/briefing-model.js';
import {newsPresentation} from '../features/qualitative/news-presentation.js';
const stamp=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const text=(x,n)=>typeof x==='string'&&x.trim()&&x.length<=n;
const bad=()=>{throw Error('REVIEW_FOLLOWUP_INVALID');};
const matches=(event,binding)=>['published_at','occurred_at','quote'].every(k=>event[k]===binding?.[k]);
function source(s,reviewedAt) {
  if(!s||!safeSourceUrl(s.url)||!text(s.label,160)||!text(s.evidence_class,160)
    ||!text(s.note,1800)||(s.verified_published_at!==undefined&&(!stamp(s.verified_published_at)
      ||Date.parse(s.verified_published_at)>Date.parse(reviewedAt))))bad();
}
export function reviewFollowup(bundle) {
  const f=bundle.review_followup;
  if(f===undefined)return null;
  if(f?.schema!=='private_review_followup_v1'||f.kind!=='retrospective_manual_review'
    ||!stamp(f.reviewed_at)||f.model_calls!==0||f.production_adopted!==false
    ||!/^[a-f0-9]{64}$/.test(f.source_html_sha256)||!/^[a-f0-9]{64}$/.test(f.source_ciphertext_sha256)
    ||!Array.isArray(f.company)||f.company.length>100||!Array.isArray(f.news)||f.news.length>3)bad();
  const seen=new Set();
  for(const note of f.company) {
    const row=bundle.observed_review?.cases.find(x=>x.strategy===note.strategy&&x.symbol===note.symbol);
    if(!row||row.events.filter(e=>matches(e,note.event_binding)).length!==1||!text(note.note,2400)
      ||!Array.isArray(note.sources)||!note.sources.length||note.sources.length>6)bad();
    const key=JSON.stringify([note.strategy,note.symbol,note.event_binding.published_at,
      note.event_binding.occurred_at,note.event_binding.quote]);
    if(seen.has(key))bad();seen.add(key);note.sources.forEach(s=>source(s,f.reviewed_at));
  }
  for(const note of f.news) {
    const event=bundle.actual_radar_news?.events.find(x=>x.event_id===note.event_id);
    if(!event||event.published_at!==note.original_published_at
      ||!event.sources.some(s=>s.url===note.original_source_url)||!text(note.note,2400)
      ||!Array.isArray(note.sources)||!note.sources.length||note.sources.length>6
      ||!newsPresentation(note))bad();
    const key='news:'+note.event_id;if(seen.has(key))bad();seen.add(key);note.sources.forEach(s=>source(s,f.reviewed_at));
  }
  return f;
}
export function companyFollowups(bundle,row,event) {
  return reviewFollowup(bundle)?.company.filter(n=>n.strategy===row.strategy&&n.symbol===row.symbol&&matches(event,n.event_binding))||[];
}
export function newsFollowup(bundle,eventId) {
  return reviewFollowup(bundle)?.news.find(n=>n.event_id===eventId)||null;
}
