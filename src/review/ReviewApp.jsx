import {useRef,useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {decryptEnvelope} from '../crypto/envelope.js';
import {StockBriefing,RadarNews} from '../features/qualitative/Briefing.jsx';
import {reviewBundle,findSample,numericRows} from './review-model.js';

const fmt=x=>typeof x==='number'?x.toLocaleString('ko-KR',{maximumFractionDigits:3}):'미확인';
const clock=x=>new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
const tabs=[['overview','OVERVIEW'],['mlg','MLG'],['tenx','TENX'],['radar','RADAR']];
function Source({source}) {
  return <details className="review-source"><summary>SEC 원문·실제 전달 발췌</summary><p>SEC 접수 시각 {clock(source.published_at)}</p><p className="briefing-note">접수 시각은 사건 발생 시각과 별개입니다.</p><a href={source.url} target="_blank" rel="noopener noreferrer">SEC 원문 열기</a><blockquote>{source.quote}</blockquote></details>;
}
function Sample({sample}) {
  if(!sample)return <p>검토 가능한 저장 표본이 없습니다.</p>;
  const p=sample.packet,r=sample.report,d=r.model_decision;
  return <article className="review-card" aria-label={p.symbol+' 저장 표본'}>
    <header><div><span className="review-eyebrow">{p.task.toUpperCase()} · SEC 제한 표본</span><h2>{p.symbol} <small>{p.company_name}</small></h2></div><span className="review-tag">저장된 실제 모델 판정</span></header>
    <p className="briefing-note">자료 기준 {clock(p.as_of)} · 전체 FMP 뉴스 수집 미확인 · 운영 미반영</p>
    {p.task==='mlg'?<><h3>AI 공급 역할 · {d.ai_supply==='eligible'?'모델·클라우드 공급 확인':'미확정'}</h3><p>{d.ai_reason}</p><dl className="briefing-scores"><div><dt>확인된 공급 가점 규칙</dt><dd>{d.ai_supply==='eligible'?'A = 3':'가점 보류'}</dd></div><div><dt>이전 A·사건 E·총점</dt><dd>기준 실행 없음</dd></div></dl><p>이 표본에는 기존 점수 입력이 없어 실제 총점 변화와 순위를 계산하지 않습니다.</p></>:r.sample_events.map(e=><section key={e.id}><h3>대표 사건의 표본 Q {e.q>0?'+':''}{e.q}</h3><p>{e.reason}</p><dl className="briefing-scores"><div><dt>사건 공개일</dt><dd>{e.occurred_at}</dd></div><div><dt>확정 단계</dt><dd>계약 확정 · 종결·통합 미완료</dd></div><div><dt>이 표본의 S·T·순위</dt><dd>기준 실행 없음</dd></div></dl></section>)}
    <p className="review-hold">이 자료는 선택한 SEC 발췌에 대한 판정입니다. 아래의 별도 TENX 실행 점수에 더하지 않습니다.</p>
    {p.evidence.map((source,i)=><Source key={i} source={source}/>)}
    <details className="review-source"><summary>실행 근거</summary><p>요청 식별자 <code>{r.request_hash}</code></p><p>기록된 provider 상태 {r.provider_status} · 입력 {r.usage?.input_tokens} / 출력 {r.usage?.output_tokens} tokens</p><p className="briefing-note">새 API 요청은 수행하지 않습니다. 토큰 수는 비용 청구액이 아닙니다.</p></details>
  </article>;
}
function LegacyObservations({bundle}){
 const legacy=bundle.legacy_review;if(!legacy)return null;
 return <section className="review-card" aria-label="MLG 과거 위험 관찰">
  <span className="review-eyebrow">복구된 과거 실행 · {legacy.source_run_id}</span>
  <h2>과거 위험 관찰 {legacy.companies.length}개 회사</h2>
  <p>발표 시각이 없는 관찰도 원래 날짜와 상태로 보존합니다. 기존 위험을 지키는 보호용 이력이며, 신규 GPT 평가가 허용된 회사는 {legacy.evaluation_coverage}개입니다. 회사 전체의 새 평가가 완료됐다는 뜻은 아닙니다.</p>
  <p className="briefing-note">원본 실행 완료 기록 {clock(legacy.observed_by)} · 기사 발표 시각과 별개</p>
  <div className="review-table-scroll"><table><thead><tr><th>종목</th><th>과거 분류</th><th>관찰 근거</th><th>발표 시각 없음</th><th>원래 행동 날짜</th></tr></thead>
   <tbody>{legacy.companies.map(item=><tr key={item.symbol}><td>{item.symbol}</td><td>{item.level}</td><td>{item.observations}건</td><td>{item.missing_publication}건</td><td>{item.action_dates.join(', ')||'미수록'}{item.reviewed&&<details><summary>초기 기록 검토 · 보호 유지</summary><p>{item.review_reason}</p></details>}</td></tr>)}</tbody></table></div>
  <p className="review-hold">현재 위험 해소·회사 전체 무위험·새 모델 평가 완료로 해석하지 않습니다.</p>
 </section>;
}
function Numeric({bundle}) {
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(null);
  const result=bundle.numeric.result,rows=numericRows(bundle,query);
  const row=selected?result.ranked_all.find(r=>r.symbol===selected):null;
  return <section className="review-card" aria-label="실제 TENX 숫자 실행">
    <header><div><span className="review-eyebrow">실제 전체 수치 실행 · {bundle.numeric.run_id}</span><h2>TENX 순위</h2></div><span className="review-tag">GPT OFF</span></header>
    <p>수집 {result.counts.universe_raw.toLocaleString()}개 → 순위 대상 {result.counts.rankable}개 → Top {result.top5.length}</p>
    <p className="briefing-note">실행 {clock(result.created_at)} · 당시 산출된 순서와 점수를 그대로 표시합니다.</p>
    <p className="review-formula">S = 42GV + 33GY + 25GCV<br/>Q: 미평가 · T: 미산출 · 현재 순위: S 기준</p>
    <label className="review-search">종목 찾기<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="종목 코드 또는 회사명"/></label>
    <div className="review-table-scroll"><table><thead><tr><th>순위</th><th>종목</th><th>원점수 S</th><th>Q</th><th>T</th><th>상세</th></tr></thead><tbody>{rows.map(r=><tr key={r.symbol}><td>{r.rank}</td><td><strong>{r.symbol}</strong><small>{r.company_name}</small></td><td>{fmt(r.tenx_score)}</td><td>미평가</td><td>—</td><td><button type="button" aria-label={r.symbol+' 상세'} onClick={()=>setSelected(r.symbol)}>보기</button></td></tr>)}</tbody></table></div>
    {!rows.length&&<p role="status">검색 결과가 없습니다.</p>}
    {row&&<section className="review-detail" aria-label={row.symbol+' 수치 상세'}><header><h3>{row.symbol} · 수치 상세</h3><button type="button" onClick={()=>setSelected(null)}>상세 닫기</button></header><dl className="briefing-scores">{[['원점수 S',row.tenx_score],['G',row.growth_score],['Y',row.value_score],['C',row.cash_score],['V',row.price_exposure]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{fmt(v)}</dd></div>)}</dl><StockBriefing recommendation={{symbol:row.symbol,strategy:'TENX',quantitative_score:row.tenx_score,ranking_basis:'quantitative_score',qualitative:{status:'unevaluated',reason:'not_evaluated',data_as_of:result.created_at,analyzed_at:result.created_at}}}/></section>}
  </section>;
}
function Overview({bundle}) {
  const result=bundle.numeric.result;
  return <><div className="review-stat-grid">{[['수치 검증',result.counts.rankable+'개 순위'],['저장된 SEC 판정',bundle.samples.length+'개 제한 표본'],['GPT 운영 한도','$50 / 월'],['현재 운영','기본 OFF']].map(([k,v])=><section className="review-stat" key={k}><span>{k}</span><strong>{v}</strong></section>)}</div>
    <section className="review-card"><span className="review-eyebrow">AI BRIEFING</span><h2>사건·사업 판단</h2><div className="review-summary-grid">{bundle.samples.map(s=><article key={s.case_id}><h3>{s.packet.symbol} · {s.packet.task.toUpperCase()}</h3><p>{s.packet.task==='mlg'?s.report.model_decision.ai_reason:s.report.sample_events[0]?.reason}</p><span className="review-tag">SEC 표본 · 운영 미반영</span></article>)}</div></section>
    <section className="review-card"><h2>확인 가능한 범위</h2><p>실제 TENX 숫자 결과와 실제 SEC 표본 판정을 탐색할 수 있습니다. 실행과 자료 범위가 달라 표본 Q·AI 가점을 기존 총점에 합산하지 않습니다.</p><ul><li>최신 뉴스 시각이 분석 경계와 겹치면 정성 점수를 보류합니다.</li><li>MLG 과거 관찰 이력은 복구됐고, 초기 기록 검토 {bundle.legacy_review?.evaluation_coverage||0}개 회사의 보호를 유지합니다. 새 전체 후보 평가는 미완료입니다.</li><li>월 $50는 운영 상한입니다. 실제 자금·별도 운영 원장 설정은 미확인입니다.</li><li>Radar 실제 검색·뉴스 실행 자료는 아직 없습니다.</li></ul></section>
    <section className="review-card"><h2>자료 기록</h2><p className="briefing-note">이 파일의 생성 시각 {clock(bundle.created_at)}은 원문 시각이나 분석 시각을 갱신하지 않습니다.</p>{bundle.source_files.map(f=><details className="review-source" key={f.name}><summary>{f.name}</summary><code>SHA-256 {f.sha256}</code></details>)}</section></>;
}
export function ReviewApp() {
  const [bundle,setBundle]=useState(null),[tab,setTab]=useState('overview'),[password,setPassword]=useState(''),[input,setInput]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const epoch=useRef(0);
  const embedded=()=>{const el=document.getElementById('review-bundle');return el?JSON.parse(el.textContent):null;};
  const lock=()=>{epoch.current++;setBundle(null);setInput(null);setPassword('');setError('');setBusy(false);setTab('overview');};
  async function unlock(e) {
    e.preventDefault();const attempt=++epoch.current;setBusy(true);setError('');
    try{
      const envelope=input||embedded();if(!envelope)throw Error();
      const data=reviewBundle(await decryptEnvelope(envelope,password));
      if(epoch.current===attempt){setBundle(data);setPassword('');}
    }catch{if(epoch.current===attempt)setError('체험 암호 또는 자료 파일을 확인해 주세요.');}
    finally{if(epoch.current===attempt)setBusy(false);}
  }
  async function choose(e) {
    epoch.current++;setBusy(false);setInput(null);setError('');setPassword('');
    const file=e.target.files?.[0];if(!file)return;const attempt=epoch.current;
    try {if(file.size>20_000_000)throw Error();const data=JSON.parse(await file.text());if(epoch.current===attempt)setInput(data);}
    catch{if(epoch.current===attempt)setError('암호화된 검토 JSON 파일을 선택해 주세요.');}
    e.target.value='';
  }
  return <Theme theme={neutralTheme} colorScheme="dark"><div className="review-shell"><header className="review-top"><div className="brand-wordmark">GENERAL SCREENER</div><span className="review-tag">GPT 격리 체험</span>{bundle&&<button type="button" onClick={lock}>체험 잠금</button>}</header>
    {!bundle?<main className="review-unlock"><span className="review-eyebrow">PRIVATE REVIEW</span><h1>저장된 실제 결과를<br/>직접 확인하세요</h1><p>별도 체험 암호로 열리는 비공개 검토본입니다.<br/>운영 비밀번호와 API 연결은 사용하지 않습니다.</p><form onSubmit={unlock}><label>체험 암호<input autoComplete="off" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button type="submit" disabled={busy}>{busy?'여는 중…':'체험 열기'}</button></form><label className="review-import">다른 검토 자료 불러오기<input type="file" accept=".json,application/json" onChange={choose}/></label>{input&&<p role="status">선택한 검토 자료를 사용합니다.</p>}{error&&<p role="alert">{error}</p>}<p className="briefing-note">자료는 이 창의 메모리에서 처리하며 저장하지 않습니다.</p></main>:<>
    <aside className="review-notice">검토 전용 · 운영 미반영 · 저장된 자료 · 새 유료 호출 없음</aside>
    <nav className="review-nav" aria-label="체험 화면">{tabs.map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <main className="review-content"><header className="review-heading"><span className="review-eyebrow">{tab==='overview'?'GENERAL SCREENER · GPT REVIEW':tab.toUpperCase()+' · GPT REVIEW'}</span><h1>{({overview:'수치 결과와 정성 판단',mlg:'AI 공급 역할과 위험 판단',tenx:'원점수와 사건 보정',radar:'시장 신호와 주요 뉴스'})[tab]}</h1></header>
      {tab==='overview'&&<Overview bundle={bundle}/>}
      {tab==='mlg'&&<><Sample sample={findSample(bundle,'mlg')}/><LegacyObservations bundle={bundle}/><section className="review-card"><h2>MLG 반영 규칙</h2><p>기존 AI 가점 A와 사건 E를 검증된 판단으로 교체합니다.</p><p className="review-formula">총점 변화 = 6 × (새 E − 기존 E) + 새 A − 기존 A</p><p>이전 위험의 해소 근거가 확인되지 않으면 기존 위험을 유지합니다. 과거 관찰 이력은 보호용으로 연결되며, 회사별 근거 검토가 끝나기 전 새 의미 점수를 채택하지 않습니다.</p></section></>}
      {tab==='tenx'&&<><Sample sample={findSample(bundle,'tenx')}/><Numeric bundle={bundle}/></>}
      {tab==='radar'&&<section className="review-card"><h2>시장 주요 뉴스</h2>{bundle.radar_validation&&<aside className="review-hold"><p>실제 API 요청 1회가 공급자 HTTP 오류로 종료됐습니다. 검색 완료는 확인되지 않았고 재시도하지 않았습니다.</p><p>실제 청구액은 미확정이며 비용 유보는 유지합니다. <a href={'https://github.com/swk0218/Screening-agent-by-FMP-API/actions/runs/'+bundle.radar_validation.run_id} target="_blank" rel="noopener noreferrer">개발 실행 기록</a></p></aside>}<RadarNews value={{schema_version:'radar_news_v1',affects_beta:false,status:'unavailable',events:[]}}/><p>실제 검색·원문 검증을 마친 Radar 뉴스 자료가 없어 분석 불가로 표시합니다.</p><p>검증된 뉴스를 최대 3개까지 별도로 제시하며, 기존 Beta 점수·경보·저널에는 반영하지 않습니다.</p><p>세 제품의 합산 월 한도는 $50입니다. 실제 운영 자금과 권한이 준비되기 전 새 검색을 실행하지 않습니다.</p></section>}
    </main><footer className="review-footer">원래 개발 브랜치의 검토본 · 운영 반영은 자체 검토와 사용자 체험·명시 승인 후 진행</footer></>}
  </div></Theme>;
}
