import { useEffect, useState } from 'react';
import { stockBriefing, radarBriefing } from './briefing-model.js';
import './briefing.css';
const time = value => value ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' KST' : '미확인';
const number = value => typeof value==='number'?value.toLocaleString('ko-KR',{maximumFractionDigits:2}):value;
function Clock({label,value}) { return <span>{label} <time dateTime={value||undefined}>{time(value)}</time></span>; }
function Evidence({item}) {
  return <details className="briefing-evidence"><summary>근거·출처</summary><div className="briefing-clocks"><Clock label="발표" value={item.publishedAt}/></div>
    <ul>{item.sources.map((source,index)=><li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>{source.quote?<p>{source.quote}</p>:null}</li>)}</ul></details>;
}
export function StockBriefing({recommendation,compact=false}) {
  const value=stockBriefing(recommendation);
  if(!value)return null;
  return <section className="qualitative-briefing" aria-label={`${recommendation.symbol} 정성 분석`}>
    <header><h3>사건·사업 판단</h3><small>{value.label}</small></header>
    {value.summary?<p>{value.summary}</p>:value.reason?<p>{value.reason}</p>:null}
    {value.scopeCopy?<p className="briefing-note">{value.scopeCopy}</p>:null}
    {!compact&&<>
      {value.scores.length>0&&<dl className="briefing-scores">{value.scores.map(([label,score])=><div key={label}><dt>{label}</dt><dd>{number(score)}</dd></div>)}</dl>}
      {value.rankingCopy?<p className="briefing-note">{value.rankingCopy}</p>:null}
      <div className="briefing-clocks"><Clock label="자료 기준" value={value.dataAsOf}/><Clock label="분석" value={value.analyzedAt}/></div>
      {value.events.map((item,index)=><div key={item.id}>{index>0?<p>{item.summary}</p>:null}<Evidence item={item}/></div>)}
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
    {news.events.length?news.events.map(item=><article key={item.id}><h4>{item.headline}</h4><p>{item.summary}{!compact&&item.why!==item.summary?` ${item.why}`:''}</p>{!compact&&<Evidence item={item}/>}</article>):news.status==='ready'?<p>확인된 주요 사건 없음</p>:null}
    {!compact&&<div className="briefing-clocks"><Clock label="자료 기준" value={news.cacheDataAsOf||news.dataAsOf}/><Clock label="분석" value={news.analyzedAt}/></div>}
  </section>;
}
export function OverviewBriefing({runs}) {
  const entries=runs.flatMap(run=>run.picks.filter(pick=>pick.qualitative).slice(0,1));
  if(!entries.length)return null;
  return <div className="overview-briefing">{entries.map(item=><div key={`${item.strategy}-${item.symbol}`}><span className="briefing-note">{item.strategy} · {item.symbol}</span><StockBriefing recommendation={item} compact/></div>)}</div>;
}
