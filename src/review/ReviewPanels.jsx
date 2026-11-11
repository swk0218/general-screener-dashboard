import {useEffect,useId,useState} from 'react';
import {ChevronDown,ChevronRight,ArrowUpRight} from 'lucide-react';
import {radarBriefing} from '../features/qualitative/briefing-model.js';
import {radarReviewProvenance} from './review-model.js';

const accepted = row => ['evaluated','cached'].includes(row.semantic_rule_status);
const time = value => value ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+' KST' : '미확인';

export function ReviewText({children,label='전체 설명'}) {
  const [open,setOpen]=useState(false),id=useId();
  if(!children)return null;
  const lengthy=children.length>170;
  return <div className="review-reading"><p id={id} className={lengthy&&!open?'review-clamped':''}>{children}</p>{lengthy&&<button type="button" className="review-text-toggle" aria-controls={id} aria-expanded={open} onClick={()=>setOpen(x=>!x)}>{open?'간단히 보기':label}<ChevronDown size={14} aria-hidden="true"/></button>}</div>;
}

export function ReviewGuide({bundle}) {
  return <details className="review-guide"><summary>검토 안내<ChevronDown size={14} aria-hidden="true"/></summary><div>
    <p>저장된 분석을 살펴보는 검토본입니다. 새 유료 호출과 운영 점수 반영은 없습니다.</p>
    <p>회사별 판단은 확인한 FMP 첫 페이지 후보 범위에 대한 제안입니다. 근거 규칙 통과가 회사 전체의 무위험이나 판단 정확성을 보증하지 않습니다. 미평가가 남아 있는 TENX 순위는 원점수 S를 유지합니다.</p>
    <p>새 하네스는 애널리스트 의견·기부 자체·수치 중복을 사건 가감점에서 제외합니다. 이전 저장 결과는 재분류하지 않고 당시 판정을 보존합니다.</p>
    <p>월 합산 GPT 운영 상한은 $50입니다. 검토 자료 작성 {time(bundle.created_at)}은 원문·분석 시각을 갱신하지 않습니다.</p>
  </div></details>;
}

export function ReviewOverview({bundle,onNavigate}) {
  const cases=bundle.observed_review?.cases||[],pass=cases.filter(accepted).length;
  const news=bundle.actual_radar_news;
  return <>
    <section className="review-overview-stats" aria-label="검토 현황">
      <div><span>회사 판단</span><strong>{cases.length||'—'}<small>건</small></strong></div>
      <div><span>근거 규칙 확인</span><strong>{cases.length?pass:'—'}<small>건</small></strong></div>
      <div><span>판정 보류</span><strong className={cases.length-pass?'review-warning':''}>{cases.length?cases.length-pass:'—'}<small>건</small></strong></div>
    </section>
    <section className="review-section" aria-label="검토 시작"><header className="review-section-heading"><h2>무엇을 검토할까요</h2><span>원점수와 AI 제안을 나란히</span></header>
      <div className="review-entry-grid">{[
        ['mlg','MLG','AI 공급 역할과 위험',cases.filter(x=>x.strategy==='mlg').length],
        ['tenx','TENX','원점수와 사건 보정',cases.filter(x=>x.strategy==='tenx').length],
        ['radar','RADAR','주요 뉴스와 시장 해석',news?.events.length||0]
      ].map(([key,title,description,count])=><button key={key} type="button" className="review-entry" onClick={()=>onNavigate(key)}><span className="review-entry-top"><span className="review-eyebrow">{key==='radar'?'저장 뉴스':'회사별 판단'}</span><ChevronRight size={18} aria-hidden="true"/></span><strong>{title}</strong><span>{description}</span><small>{count?count+'건 확인하기':'저장 자료 확인하기'}</small></button>)}</div>
    </section>
    <section className="review-section"><header className="review-section-heading"><h2>검토 기준</h2><span className="review-ai-label">AI 분석 참고</span></header><div className="review-principles"><p><strong>판단과 근거</strong><span>회사별 결론, 보류 사유와 연결된 원문을 확인합니다.</span></p><p><strong>수치와 제안</strong><span>S는 원점수, Q는 사건 제안, T는 참고 보정 점수입니다.</span></p><p><strong>저장 결과</strong><span>실제 실행과 이후 재검증을 구분합니다. 운영에는 반영하지 않습니다.</span></p></div></section>
    <details className="review-archive"><summary>자료 범위·기록<ChevronDown size={16} aria-hidden="true"/></summary><div>
      {bundle.observed_review&&<p>회사 자료 기준 {time(bundle.observed_review.data_as_of)} · FMP 첫 페이지 후보에 대한 저장 검토입니다.</p>}
      <p>원본 TENX 수치 {bundle.numeric.result.counts.rankable}개, SEC 제한 표본 {bundle.samples.length}개를 각 탭에 보존했습니다. 표본의 Q·AI 가점은 원본 수치 실행에 더하지 않습니다.</p>
      {bundle.source_files.map(f=><details className="review-source" key={f.name}><summary>{f.name}</summary><code>SHA-256 {f.sha256}</code></details>)}
    </div></details>
  </>;
}

export function ReviewRadar({bundle}) {
  const proof=radarReviewProvenance(bundle),value=bundle.actual_radar_news;
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const refresh=()=>setNow(Date.now());const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  const news=radarBriefing(value,now);
  return <section className="review-card review-radar" aria-label="Radar 저장 뉴스 검토">
    <header className="review-section-heading"><div><span className="review-ai-label">AI 뉴스 검토</span><h2>시장 주요 뉴스</h2></div><span className="review-tag">점수·경보 별도</span></header>
    {proof&&<div className="review-run-proof" aria-label="Radar 실행 구분"><div><span>최초 실제 실행</span><strong aria-label="최초 실제 실행 채택">{proof.originalCount}건</strong></div><div><span>저장 응답 재검증</span><strong aria-label="저장 응답 재검증 채택">{proof.replayCount}건</strong></div><p>현재 화면은 저장 응답 재검증 {proof.replayCount}건입니다. 새 실검색 결과가 아닙니다. 추가 호출 0회.</p><details><summary>실행 기록<ChevronDown size={14} aria-hidden="true"/></summary><p>최초 실제 실행 {proof.originalRun} · 당시 채택 {proof.originalCount}건.</p><p>원래 검색 기준 {time(proof.originalCutoff)} · 원문·발행 시각의 확인 수준은 각 뉴스의 근거 표시를 따릅니다.</p></details></div>}
    <section className="qualitative-briefing radar-news review-news-list" aria-label="시장 주요 뉴스">
      <p className="review-news-status">{news?.status==='stale'?'이전 저장 뉴스':news?.label||'분석 불가'}{news?.coverageCopy&&<span>{news.coverageCopy}</span>}</p>
      {news?.events.map((item,index)=><NewsCard item={item} index={index} key={item.id}/>)}
      {!news?.events.length&&<p className="review-empty">{news?.status==='ready'?'확인된 주요 사건 없음':'검토 가능한 뉴스 자료가 없습니다.'}</p>}
      {value&&<p className="review-note">검색 기준 {time(value.cached_cutoff_at||value.cutoff_at)} · 분석 {time(value.cached_analyzed_at||value.analyzed_at)}</p>}
    </section>
    <p className="review-note">정치·거시·시장 보도를 확인한 범위입니다. 세계 뉴스 전체를 조사했다는 뜻은 아닙니다.</p>
  </section>;
}

function NewsCard({item,index}) {
  const [analysisOpen,setAnalysisOpen]=useState(false),id=useId();
  return <article className="review-news-card"><div className="review-news-meta"><span>NEWS {String(index+1).padStart(2,'0')}</span><span>{item.publicationTimeUnverified?'보도 시각 미확인':time(item.publishedAt)}</span></div><h3>{item.headline}</h3>
    <ReviewText label="보도 내용 전체">{item.summary}</ReviewText>
    <button type="button" className="review-analysis-toggle" aria-expanded={analysisOpen} aria-controls={id} onClick={()=>setAnalysisOpen(x=>!x)}>시장 해석<ChevronDown size={14} aria-hidden="true"/></button>
    <div id={id} hidden={!analysisOpen} className="review-analysis"><p>{item.why}</p></div>
    <details className="briefing-evidence review-source"><summary>근거·출처<ChevronDown size={15} aria-hidden="true"/></summary><p className="review-note">{item.publicationTimeUnverified?'보도 표기 '+item.publishedAt+' · 원문 시각 미확인':time(item.publishedAt)}</p><ul>{item.sources.map((source,i)=><li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ArrowUpRight size={14} aria-hidden="true"/></a>{source.quote&&<blockquote>{source.quote}</blockquote>}</li>)}</ul></details>
  </article>;
}
