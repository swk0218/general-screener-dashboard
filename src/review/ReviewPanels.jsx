import {useEffect,useState} from 'react';
import {ChevronDown,ChevronRight,ArrowUpRight} from 'lucide-react';
import {radarBriefing} from '../features/qualitative/briefing-model.js';
import {radarReviewProvenance} from './review-model.js';
import {newsFollowup} from './followup-model.js';
import {newsPresentation} from '../features/qualitative/news-presentation.js';
import {NewsImpact} from '../features/qualitative/NewsImpact.jsx';
import {RadarNews} from '../features/qualitative/Briefing.jsx';
import {NewsCoverage,NewsEvidenceSummary,NewsSourceEvidence,newsEmptyCopy} from '../features/qualitative/NewsEvidence.jsx';
import {SourceFollowup} from './SourceFollowup.jsx';

import {ReviewClock,reviewTime as time} from './ReviewClock.jsx';
import {ReviewText} from './ReviewText.jsx';
export {ReviewText} from './ReviewText.jsx';
const accepted = row => ['evaluated','cached'].includes(row.semantic_rule_status);

export function ReviewGuide({bundle}) {
  return <details className="review-guide"><summary>검토 안내<ChevronDown size={14} aria-hidden="true"/></summary><div>
    <p>{bundle.final_live_review?'저장된 분석과 별도 API 검토 부록을 살펴봅니다. 이 페이지에서 새 요청을 실행하거나 운영 점수를 반영하지 않습니다.':bundle.radar_snapshot_review?'저장된 분석과 수신 원문의 사후 검토를 살펴봅니다. 이 페이지에서 새 검색이나 평가를 실행하지 않습니다.':'저장된 분석을 살펴보는 검토본입니다. 새 유료 호출과 운영 점수 반영은 없습니다.'}</p>
    <p>회사별 판단은 확인한 FMP 첫 페이지 후보 범위에 대한 제안입니다. 근거 규칙 통과가 회사 전체의 무위험이나 판단 정확성을 보증하지 않습니다. 미평가가 남아 있는 TENX 순위는 원점수 S를 유지합니다.</p>
    <p>새 하네스는 애널리스트 의견·기부 자체·수치 중복을 사건 가감점에서 제외합니다. 이전 저장 결과는 재분류하지 않고 당시 판정을 보존합니다.</p>
    <p>통상 고객 협력과 단순 실적 상회는 자동 가점하지 않습니다. 수치 중복은 실제 입력 기간·필드가 겹칠 때만 판단하며, 실제 신규 발행의 소유 비중 감소는 기존 희석 반영 기간과 구분합니다.</p>
    {bundle.review_followup&&<p>추가 사실 확인은 사후 수동 검토입니다. 원래 응답·점수·검색 기준과 별도로 표시합니다.</p>}
    <p>검토 자료 작성 <ReviewClock value={bundle.created_at}/> · 원문·분석 시각은 각 근거를 따릅니다.</p>
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

const snapshotClocks = [
  ['자료 기준', 'data_as_of'], ['실제 모델 분석', 'model_analysis_at'],
  ['원문 수신', 'source_received_at'], ['원문 발표', 'source_published_at'],
  ['저장 응답 재생 검토', 'stored_replay_reviewed_at'], ['내용 검토', 'content_reviewed_at'],
];
function snapshotAnalysisLabel(value) {
  const stamp = Date.parse(value.news.analyzed_at);
  const model = stamp === Date.parse(value.clocks.model_analysis_at);
  const replay = stamp === Date.parse(value.clocks.stored_replay_reviewed_at);
  return model && !replay ? '실제 모델 분석' : replay && !model ? '저장 응답 후처리' : '뉴스 기록 시각';
}
export function RadarSnapshotReview({value}) {
  if (!value) return null;
  return <section className="review-card" aria-label="수신 원문 한정 검토">
    <header className="review-section-heading"><h3>{value.label}</h3><span className="review-tag">저장 응답의 원문 검토</span></header>
    <p className="review-note">{value.scope_copy}</p>
    <p className="review-note">{value.freshness_copy}</p>
    <p className="review-note">{value.evidence_scope_copy}</p>
    <p className="review-note">수신 원문 확인분 {value.news.events.length}건 · 원문 미확인으로 이번 표시에서 제외 {value.excluded_event_count}건 · 원래 저장 {value.original_canonical_event_count}건 보존</p>
    <p className="review-note">이번 파생 검토의 새 API 요청 0회 · 새 모델 출력으로 표시하지 않습니다.</p>
    <p className="review-note">실제 모델 분석 <ReviewClock value={value.clocks.model_analysis_at}/> · 저장 응답 재생 검토 <ReviewClock value={value.clocks.stored_replay_reviewed_at}/> · 내용 검토 <ReviewClock value={value.clocks.content_reviewed_at}/></p>
    <RadarNews value={value.news} analysisLabel={snapshotAnalysisLabel(value)}/>
    <details className="review-source"><summary>자료·분석·검토 시각<ChevronDown size={14} aria-hidden="true"/></summary>
      {snapshotClocks.map(([name, key]) => <p className="review-note" key={key}>{name} <ReviewClock value={value.clocks[key]}/></p>)}
      {value.binding?.archive_sha256 && <p className="review-note">원래 artifact SHA-256 {value.binding.archive_sha256}</p>}
      <p className="review-note">원문 수신 시각과 자료 기준 시각을 각각 보존합니다. 확인 시각을 과거 검색 시각으로 바꾸지 않습니다.</p>
    </details>
  </section>;
}

export function ReviewRadar({bundle}) {
  const proof=radarReviewProvenance(bundle),value=bundle.actual_radar_news;
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const refresh=()=>setNow(Date.now());const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  const news=radarBriefing(value,now);
  return <section className="review-card review-radar" aria-label="Radar 저장 뉴스 검토">
    <header className="review-section-heading"><div><span className="review-ai-label">AI 뉴스 검토</span><h2>시장 주요 뉴스</h2></div><span className="review-tag">점수·경보 별도</span></header>
    {proof&&<div className="review-run-proof" aria-label="Radar 실행 구분"><div><span>최초 실제 실행</span><strong aria-label="최초 실제 실행 채택">{proof.originalCount}건</strong></div><div><span>저장 응답 재검증</span><strong aria-label="저장 응답 재검증 채택">{proof.replayCount}건</strong></div><p>저장 응답을 다시 검증한 {proof.replayCount}건입니다. 새 실검색 결과가 아닙니다.</p><details><summary>실행 기록<ChevronDown size={14} aria-hidden="true"/></summary><p>최초 실제 실행 {proof.originalRun} · 당시 채택 {proof.originalCount}건.</p><p>원래 검색 기준 {time(proof.originalCutoff)} · 원문·발행 시각의 확인 수준은 각 뉴스의 근거 표시를 따릅니다.</p></details></div>}
    <RadarSnapshotReview value={bundle.radar_snapshot_review}/>
    <section className="qualitative-briefing radar-news review-news-list" aria-label="기존 저장 시장 뉴스">
      {bundle.radar_snapshot_review&&<h3>기존 저장 뉴스 기록</h3>}
      <p className="review-news-status">{news?.status==='stale'?'이전 저장 뉴스':news?.label||'분석 불가'}</p><NewsCoverage news={news}/>
      {news?.events.map((item,index)=><NewsCard item={item} index={index} followup={newsFollowup(bundle,item.id)} reviewedAt={bundle.review_followup?.reviewed_at} key={item.id}/>)}
      {!news?.events.length&&<p className="review-empty" role="status">{newsEmptyCopy(news)}</p>}
      {value&&<p className="review-note">검색 기준 <ReviewClock value={value.cached_cutoff_at||value.cutoff_at}/> · 분석 <ReviewClock value={value.cached_analyzed_at||value.analyzed_at}/></p>}
    </section>
    <p className="review-note">정치·거시·시장 보도를 확인한 범위입니다. 세계 뉴스 전체를 조사했다는 뜻은 아닙니다.</p>
  </section>;
}

function NewsCard({item,index,followup,reviewedAt}) {
  return <article className="review-news-card"><div className="review-news-meta"><span>NEWS {String(index+1).padStart(2,'0')}</span><span>저장된 발표 표기 <ReviewClock value={item.publishedAt}/></span></div><h3>{item.headline}</h3>
    <NewsImpact presentation={followup?newsPresentation(followup):item.presentation} reviewer={!!followup}/>
    <NewsEvidenceSummary item={item}/>
    <details className="review-source review-news-detail"><summary>보도 내용·기존 시장 해석<ChevronDown size={14} aria-hidden="true"/></summary><h4>저장된 보도 내용</h4><ReviewText label="보도 내용 전체">{item.summary}</ReviewText><h4>기존 시장 해석</h4><ReviewText label="기존 해석 전체">{item.why}</ReviewText></details>
    {followup&&<SourceFollowup note={followup} reviewedAt={reviewedAt}/>}
    <details className="briefing-evidence review-source"><summary>근거·출처<ChevronDown size={15} aria-hidden="true"/></summary><ul>{item.sources.map((source,i)=><li key={i}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ArrowUpRight size={14} aria-hidden="true"/></a><NewsSourceEvidence source={source}/>{source.quote&&<blockquote>{source.quote}</blockquote>}</li>)}</ul></details>
  </article>;
}
