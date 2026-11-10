import {useEffect,useRef,useState} from 'react';
import {safeSourceUrl} from '../features/qualitative/briefing-model.js';
const number=x=>typeof x==='number'?x.toLocaleString('ko-KR',{maximumFractionDigits:3}):'미확인';
const accepted=x=>['evaluated','cached'].includes(x.semantic_rule_status);
export function CompanyReview({bundle,strategy}) {
 const [query,setQuery]=useState(''),[selected,setSelected]=useState(null),review=bundle.observed_review;
 const detailRef=useRef(null),triggerRef=useRef(null);
 useEffect(()=>{
  if(selected){detailRef.current?.scrollIntoView({block:'start'});detailRef.current?.focus({preventScroll:true});}
 },[selected]);
 function closeDetail(){setSelected(null);triggerRef.current?.focus();}
 if(!review)return null;
 const all=review.cases.filter(x=>x.strategy===strategy),q=query.trim().toUpperCase();
 const rows=all.filter(x=>(x.symbol+' '+x.company_name).toUpperCase().includes(q));
 const item=all.find(x=>x.symbol===selected);
 return <section className="review-card" aria-label={strategy.toUpperCase()+' 실제 회사 후보 검토'}>
  <span className="review-eyebrow">실제 수신 뉴스 · 저장된 전체 후보 평가</span>
  <h2>{strategy.toUpperCase()} 회사별 판단 {all.length}개</h2>
  <p>자료 기준 {review.data_as_of} · 근거 규칙 확인 {all.filter(accepted).length}개 · 운영 미반영</p>
  <p className="briefing-note">확인한 FMP 첫 페이지 후보에 대한 격리 검토입니다. 규칙 통과는 회사 전체의 무위험이나 판단 정확성 보증이 아닙니다.</p>
  <label className="review-search">회사 검토 찾기<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="종목 코드 또는 회사명"/></label>
  <div className="review-table-scroll"><table className="review-company-table"><thead><tr><th>종목</th><th>{strategy==='tenx'?'사건 평가':'공급 판정'}</th><th>상세</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.symbol}><td><strong>{r.symbol}</strong><small>{r.company_name}</small></td><td><small>{accepted(r)?'근거 규칙 확인':'판정 보류'}</small>{strategy==='tenx'?(accepted(r)?number(r.q):'미평가'):(accepted(r)?({eligible:'공급 확인',ineligible:'비해당 근거',unknown:'미확인'}[r.ai_supply]||'미확인'):'미채택')}</td><td><button type="button" aria-label={r.symbol+' 검토 상세'} aria-expanded={selected===r.symbol} onClick={e=>{triggerRef.current=e.currentTarget;setSelected(r.symbol);}}>검토 보기</button></td></tr>)}</tbody></table></div>
  {!rows.length&&<p role="status">검색 결과가 없습니다.</p>}
  {item&&<section className="review-detail" ref={detailRef} tabIndex={-1} aria-label={item.symbol+' 회사 검토 상세'}><header><h3>{item.symbol} · 회사 판단</h3><button type="button" onClick={closeDetail}>검토 닫기</button></header>
   {item.explanation_language_needs_review&&<p className="review-hold">설명 문구의 한국어 검토가 남아 있습니다.</p>}<p>{accepted(item)?'검증된 근거에 연결된 격리 제안입니다.':'근거 검증을 마치지 못해 점수 채택을 보류했습니다.'} {item.semantic_reason&&<code>{item.semantic_reason}</code>}</p>
   {item.reviewer_note&&<p className="briefing-note" aria-label="코덱스 추가 검토">{item.reviewer_note}</p>}
   {strategy==='tenx'&&!accepted(item)&&item.ai_reason&&<p aria-label="모델이 남긴 보류 사유">{item.ai_reason}</p>}
   {item.explanation_provenance&&<p className="briefing-note">{item.explanation_provenance}</p>}
   {strategy==='mlg'?<><p>{item.ai_reason}</p><dl className="briefing-scores">{[['기존 E',item.baseline_e],['제안 E',accepted(item)?item.proposed_e:null],['기존 A',item.baseline_a],['제안 A',accepted(item)?item.proposed_a:null]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{number(v)}</dd></div>)}</dl></>:<dl className="briefing-scores">{[['원점수 S',item.quantitative_score],['검토 Q',accepted(item)?item.q:null],['참고 T',accepted(item)?item.adjusted_score:null]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{number(v)}</dd></div>)}</dl>}
   {strategy==='tenx'&&<p>전체 TENX 판정이 끝나기 전에는 원점수 S 순서를 유지합니다. 미평가를 Q=0으로 채우지 않습니다.</p>}
   {item.events.map((e,i)=><article key={i}><h4>{accepted(item)?'근거 연결 사건':'미채택 모델 제안'} · {e.mlg_state||'사건'}</h4><p>{e.reason}</p><p className="briefing-note">원문 발표 표기 {e.published_at} · 사건 날짜 {e.occurred_at}</p><blockquote>{e.quote}</blockquote></article>)}
   {item.sources.map((source,i)=><details className="review-source" key={i}><summary>실제 전달 원문 발췌 {i+1}</summary><p>발표 원문 표기 {source.published_at}{source.timezone_unknown?' · 시간대 미확인':''}</p>{source.observed_at&&<p>성공 응답 수신 확인 {source.observed_at}</p>}<blockquote>{source.quote}</blockquote>{safeSourceUrl(source.url)&&<a href={source.url} target="_blank" rel="noopener noreferrer">원문 열기</a>}</details>)}
  </section>}
 </section>;
}
