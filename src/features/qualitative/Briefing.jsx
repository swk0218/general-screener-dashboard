import { useEffect, useState } from 'react';
import { stockBriefing, radarBriefing } from './briefing-model.js';
import {NewsImpact} from './NewsImpact.jsx';
import './briefing.css';
const time = value => value ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' KST' : '미확인';
const number = value => typeof value==='number'?value.toLocaleString('ko-KR',{maximumFractionDigits:2}):value;
function Clock({label,value}) { return <span>{label} <time dateTime={value||undefined}>{time(value)}</time></span>; }
function Evidence({item}) {
  return <details className="briefing-evidence"><summary>근거·출처</summary><div className="briefing-clocks">{item.publicationTimeUnverified?<span>보도 표기 {item.publishedAt} · 원문 시각 미확인</span>:item.publicationTimeUnknown?<span>발표 {item.publishedAt} · 시간대 미확인</span>:<Clock label="발표" value={item.publishedAt}/>} {item.observedAt?<Clock label="수집 확인" value={item.observedAt}/>:null}</div>
    <ul>{item.sources.map((source,index)=><li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>{source.quote?<p>{source.quote}</p>:null}</li>)}</ul></details>;
}
function StockEvent({item}) {
  return <article className="briefing-stock-event"><div className="briefing-event-heading"><span className={'event-badge is-'+item.assessment.tone}>{item.assessment.label}</span>{item.assessment.note&&<small>{item.assessment.note}</small>}</div><p>{item.summary}</p><Evidence item={item}/></article>;
}
export function StockBriefing({recommendation,compact=false}) {
  const value=stockBriefing(recommendation);
  if(!value)return null;
  const eligible=value.events.filter(e=>!e.assessment.excluded),excluded=value.events.filter(e=>e.assessment.excluded);
  return <section className="qualitative-briefing" aria-label={`${recommendation.symbol} 정성 분석`}>
    <header><h3>사건·사업 판단</h3><small>{value.label}</small></header>
    {(compact||!value.events.length)&&(value.summary?<p>{value.summary}</p>:value.reason?<p>{value.reason}</p>:null)}
    {value.scopeCopy?<p className="briefing-note">{value.scopeCopy}</p>:null}
    {value.collectionCopy?<p className="briefing-note">{value.collectionCopy}</p>:null}
    {value.legacyCopy?<p className="briefing-note">{value.legacyCopy}</p>:null}
    {!compact&&<>
      {value.scores.length>0&&<dl className="briefing-scores">{value.scores.map(([label,score])=><div key={label}><dt>{label}</dt><dd>{number(score)}</dd></div>)}</dl>}
      {value.rankingCopy?<p className="briefing-note">{value.rankingCopy}</p>:null}
      <div className="briefing-clocks"><Clock label="자료 기준" value={value.dataAsOf}/><Clock label="분석" value={value.analyzedAt}/></div>
      {eligible.slice(0,3).map(item=><StockEvent key={item.id} item={item}/>)}
      {eligible.length>3&&<details className="briefing-evidence"><summary>다른 사업 사건 {eligible.length-3}건</summary>{eligible.slice(3).map(item=><StockEvent key={item.id} item={item}/>)}</details>}
      {excluded.length>0&&<details className="briefing-evidence briefing-excluded"><summary>점수 제외 {excluded.length}건 · 의견·기부·수치 중복</summary>{excluded.map(item=><StockEvent key={item.id} item={item}/>)}</details>}
      {value.aiEvidence?<div><p>{value.aiEvidence.summary}</p><Evidence item={value.aiEvidence}/></div>:null}
    </>}
  </section>;
}
export function RadarNews({value,compact=false}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const refresh=()=>setNow(Date.now());const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  const news=radarBriefing(value,now);
  if(!news)return null;
  return <section className="qualitative-briefing radar-news" aria-label="시장 주요 뉴스">
    <header><h3>시장 주요 뉴스</h3><small>{news.label} · 지수와 별도</small></header>
    {news.coverageCopy?<p className="briefing-note">{news.coverageCopy}</p>:null}
    {news.events.length?news.events.map(item=><article key={item.id}><h4>{item.headline}</h4><NewsImpact presentation={item.presentation}/>{!compact&&<details className="briefing-evidence"><summary>보도 내용·시장 해석</summary><p><strong>보도 내용</strong> {item.summary}</p>{item.why!==item.summary&&<p><strong>시장 해석</strong> {item.why}</p>}</details>}{!compact&&<Evidence item={item}/>}</article>):news.status==='ready'?<p>확인된 주요 사건 없음</p>:null}
    {!compact&&<div className="briefing-clocks"><Clock label="자료 기준" value={news.cacheDataAsOf||news.dataAsOf}/><Clock label="분석" value={news.analyzedAt}/></div>}
  </section>;
}
export function OverviewBriefing({runs}) {
  const entries=runs.flatMap(run=>run.picks.filter(pick=>pick.qualitative).slice(0,1));
  if(!entries.length)return null;
  return <div className="overview-briefing">{entries.map(item=><div key={`${item.strategy}-${item.symbol}`}><span className="briefing-note">{item.strategy} · {item.symbol}</span><StockBriefing recommendation={item} compact/></div>)}</div>;
}

