import {useEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronRight,ArrowUpRight,Search,X} from 'lucide-react';
import {safeSourceUrl} from '../features/qualitative/briefing-model.js';
import {ReviewText} from './ReviewPanels.jsx';
const number=(x,missing='미확인')=>typeof x==='number'?x.toLocaleString('ko-KR',{maximumFractionDigits:3}):missing;
const accepted=x=>['evaluated','cached'].includes(x.semantic_rule_status);
const supply=x=>({eligible:'공급 확인',ineligible:'비해당 근거',unknown:'미확인'}[x]||'미확인');

export function CompanyReview({bundle,strategy}) {
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(null),[filter,setFilter]=useState('all'),[limit,setLimit]=useState(12);
  const detailRef=useRef(null),triggerRef=useRef(null),returnFocus=useRef(false),review=bundle.observed_review;
  useEffect(()=>{
    if(selected){detailRef.current?.scrollIntoView({block:'start'});detailRef.current?.focus({preventScroll:true});}
    else if(returnFocus.current){triggerRef.current?.focus();returnFocus.current=false;}
  },[selected]);
  function closeDetail(){returnFocus.current=true;setSelected(null);}
  if(!review)return null;
  const all=review.cases.filter(x=>x.strategy===strategy),q=query.trim().toUpperCase();
  const rows=all.filter(x=>(x.symbol+' '+x.company_name).toUpperCase().includes(q)&&(filter==='all'||!accepted(x)));
  const item=all.find(x=>x.symbol===selected),pending=all.filter(x=>!accepted(x)).length;
  function search(value){setQuery(value);setLimit(12);}
  return <section className={'review-card review-company'+(item?' has-detail':'')} aria-label={strategy.toUpperCase()+' 실제 회사 후보 검토'}>
    <header className="review-section-heading"><div><span className="review-ai-label">AI 회사 검토</span><h2>{strategy.toUpperCase()} 회사별 판단 <small>{all.length}개</small></h2></div><span className="review-tag">{all.length-pending} 확인{pending?' · '+pending+' 보류':''}</span></header>
    <div className="review-company-workspace"><div className="review-company-list-pane">
      <div className="review-company-tools"><label className="review-search"><span className="sr-only">회사 검토 찾기</span><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={e=>search(e.target.value)} placeholder="종목 코드 또는 회사명"/></label>
      <div className="review-filters" aria-label="판정 상태 필터">{[['all','전체',all.length],['pending','보류',pending]].map(([key,title,count])=><button key={key} type="button" aria-pressed={filter===key} onClick={()=>{setFilter(key);setLimit(12);}}>{title}<span>{count}</span></button>)}</div></div>
      <div className="review-table-scroll"><ul className="review-company-list">{rows.slice(0,limit).map(r=><li key={r.symbol}><button type="button" className={selected===r.symbol?'is-selected':''} aria-label={r.symbol+' 검토 상세'} aria-expanded={selected===r.symbol} onClick={e=>{triggerRef.current=e.currentTarget;setSelected(r.symbol);}}><span className="review-company-identity"><strong>{r.symbol}</strong><small>{r.company_name}</small></span><span className="review-company-result"><span className={!accepted(r)?'review-status is-pending':'review-status'}>{accepted(r)?(strategy==='tenx'?'검토 Q':'공급 판정'):'판정 보류'}</span><strong>{strategy==='tenx'?(accepted(r)?(r.q>0?'+':'')+number(r.q):'미평가'):(accepted(r)?supply(r.ai_supply):'미채택')}</strong></span><ChevronRight size={16} aria-hidden="true"/></button></li>)}</ul></div>
      {!rows.length&&<p className="review-empty" role="status">검색 결과가 없습니다.</p>}
      {rows.length>limit&&<button type="button" className="review-load-more" onClick={()=>setLimit(x=>x+12)}>더 보기 <span>{Math.min(limit,rows.length)} / {rows.length}</span><ChevronDown size={15} aria-hidden="true"/></button>}
      <p className="review-note review-source-date">자료 기준 {new Date(review.data_as_of).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})} KST · 저장된 후보 범위</p>
    </div>
    {item?<section className="review-detail" ref={detailRef} tabIndex={-1} aria-label={item.symbol+' 회사 검토 상세'}>
      <header className="review-detail-header"><div><span className="review-eyebrow">{strategy.toUpperCase()} · 회사 판단</span><h3>{item.symbol}<small>{item.company_name}</small></h3></div><button type="button" className="review-close" aria-label="검토 닫기" onClick={closeDetail}><X size={18} aria-hidden="true"/><span>닫기</span></button></header>
      <div className="review-detail-content"><div className="review-decision-state"><span className={accepted(item)?'review-status':'review-status is-pending'}>{accepted(item)?'근거 규칙 확인':'판정 보류'}</span><span className="review-note">운영 미반영</span></div>
      {item.explanation_language_needs_review&&<p className="review-hold">설명 문구의 한국어 검토가 남아 있습니다.</p>}
      {!accepted(item)&&<p className="review-hold">근거 확인이 충분하지 않아 점수 채택을 보류했습니다.</p>}
      {strategy==='mlg'?<><h4 className="review-subheading">AI 공급 역할 · {supply(item.ai_supply)}</h4><ReviewText label="공급 판단 전체">{item.ai_reason}</ReviewText><dl className="review-score-strip is-mlg">{[['기존 E',item.baseline_e],['제안 E',accepted(item)?item.proposed_e:null],['기존 A',item.baseline_a],['제안 A',accepted(item)?item.proposed_a:null]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{number(v,k.startsWith('제안')?'미평가':'미확인')}</dd></div>)}</dl></>:<><dl className="review-score-strip">{[['원점수 S',item.quantitative_score],['검토 Q',accepted(item)?item.q:null],['참고 T',accepted(item)?item.adjusted_score:null]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{number(v,'미평가')}</dd></div>)}</dl><p className="review-note">전체 순위는 원점수 S 기준 · 미평가를 Q=0으로 채우지 않습니다.</p>{!accepted(item)&&item.ai_reason&&<div aria-label="모델이 남긴 보류 사유"><ReviewText label="보류 사유 전체">{item.ai_reason}</ReviewText></div>}</>}
      {item.events.map((e,i)=><article className="review-event" key={i}><h4 className="review-subheading">{accepted(item)?'근거 연결 사건':'미채택 모델 제안'}{e.mlg_state&&<span className="review-note">{e.mlg_state}</span>}</h4><ReviewText label="사건 판단 전체">{e.reason}</ReviewText><details className="review-source"><summary>사건 원문·시점<ChevronDown size={15} aria-hidden="true"/></summary><p className="review-note">원문 발표 표기 {e.published_at} · 사건 날짜 {e.occurred_at}</p><blockquote>{e.quote}</blockquote></details></article>)}
      {item.reviewer_note&&<details className="review-source"><summary>추가 검토 메모<ChevronDown size={15} aria-hidden="true"/></summary><p aria-label="코덱스 추가 검토">{item.reviewer_note}</p></details>}
      <div className="review-evidence-list">{item.sources.map((source,i)=><details className="review-source" key={i}><summary><span><span>실제 전달 원문 발췌 {i+1}</span>{source.timezone_unknown&&<small>시간대 미확인</small>}</span><ChevronDown size={15} aria-hidden="true"/></summary><p className="review-note">발표 원문 표기 {source.published_at}{source.timezone_unknown?' · 시간대 미확인':''}</p>{source.observed_at&&<p className="review-note">성공 응답 수신 확인 {source.observed_at}</p>}<blockquote>{source.quote}</blockquote>{safeSourceUrl(source.url)&&<a href={source.url} target="_blank" rel="noopener noreferrer">원문 열기<ArrowUpRight size={14} aria-hidden="true"/></a>}</details>)}</div>
      {(item.semantic_reason||item.explanation_provenance)&&<details className="review-source"><summary>판정 기록<ChevronDown size={15} aria-hidden="true"/></summary>{item.semantic_reason&&<p><code>{item.semantic_reason}</code></p>}{item.explanation_provenance&&<p>{item.explanation_provenance}</p>}</details>}
      </div></section>:<div className="review-detail-placeholder"><span className="review-ai-label">판단 · 수치 · 근거</span><h3>검토할 회사를 선택하세요</h3><p>원점수와 정성 제안, 보류 사유를 한곳에서 확인합니다.</p></div>}
    </div>
  </section>;
}
