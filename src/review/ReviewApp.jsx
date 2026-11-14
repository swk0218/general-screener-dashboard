import {CompanyReview} from './CompanyReview.jsx';
import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {decryptEnvelope} from '../crypto/envelope.js';
import {StockBriefing} from '../features/qualitative/Briefing.jsx';
import {reviewBundle,findSample,numericRows} from './review-model.js';

import {ReviewGuide,ReviewOverview,ReviewRadar} from './ReviewPanels.jsx';
import {LockKeyhole,ChevronDown} from 'lucide-react';
import {FinalLiveReview} from './FinalLiveReview.jsx';
import {finalLiveReview} from './final-live-model.js';

const fmt=x=>typeof x==='number'?x.toLocaleString('ko-KR',{maximumFractionDigits:3}):'미확인';
const clock=x=>new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST';
const tabs=[['overview','개요'],['mlg','MLG'],['tenx','TENX'],['radar','RADAR']];
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
    <header><div><span className="review-eyebrow">실제 전체 수치 실행 · {bundle.numeric.run_id}</span><h2>원본 TENX 수치 순위</h2></div><span className="review-tag">GPT OFF</span></header>
    <p>수집 {result.counts.universe_raw.toLocaleString()}개 → 순위 대상 {result.counts.rankable}개 → Top {result.top5.length}</p>
    <p className="briefing-note">실행 {clock(result.created_at)} · 당시 산출된 순서와 점수를 그대로 표시합니다.</p>
    <p className="review-formula">S = 42GV + 33GY + 25GCV<br/>Q: 미평가 · T: 미산출 · 현재 순위: S 기준</p>
    <label className="review-search">종목 찾기<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="종목 코드 또는 회사명"/></label>
    <div className="review-table-scroll"><table><thead><tr><th>순위</th><th>종목</th><th>원점수 S</th><th>Q</th><th>T</th><th>상세</th></tr></thead><tbody>{rows.map(r=><tr key={r.symbol}><td>{r.rank}</td><td><strong>{r.symbol}</strong><small>{r.company_name}</small></td><td>{fmt(r.tenx_score)}</td><td>미평가</td><td>—</td><td><button type="button" aria-label={r.symbol+' 상세'} onClick={()=>setSelected(r.symbol)}>보기</button></td></tr>)}</tbody></table></div>
    {!rows.length&&<p role="status">검색 결과가 없습니다.</p>}
    {row&&<section className="review-detail" aria-label={row.symbol+' 수치 상세'}><header><h3>{row.symbol} · 수치 상세</h3><button type="button" onClick={()=>setSelected(null)}>상세 닫기</button></header><dl className="briefing-scores">{[['원점수 S',row.tenx_score],['G',row.growth_score],['Y',row.value_score],['C',row.cash_score],['V',row.price_exposure]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{fmt(v)}</dd></div>)}</dl><StockBriefing recommendation={{symbol:row.symbol,strategy:'TENX',quantitative_score:row.tenx_score,ranking_basis:'quantitative_score',qualitative:{status:'unevaluated',reason:'not_evaluated',data_as_of:result.created_at,analyzed_at:result.created_at}}}/></section>}
  </section>;
}
export function ReviewApp() {
  const [bundle,setBundle]=useState(null),[tab,setTab]=useState('overview'),[password,setPassword]=useState(''),[input,setInput]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const liveReview=useMemo(()=>bundle?finalLiveReview(bundle):null,[bundle]);
  const epoch=useRef(0);
  // Each review tab is a new reading context; reveal its heading before paint.
  useLayoutEffect(()=>{if(bundle)window.scrollTo({top:0,left:0,behavior:'instant'});},[tab,bundle]);
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
  return <Theme theme={neutralTheme} colorScheme="dark"><div className="review-shell"><a className="skip-link" href="#review-main">본문으로 이동</a>
    <header className="review-top"><div className="brand-wordmark">GENERAL SCREENER</div><span className="review-ai-label">AI 검토</span>{bundle&&<button type="button" className="review-lock" onClick={lock}><LockKeyhole size={15} aria-hidden="true"/><span>체험 잠금</span></button>}</header>
    {!bundle?<main className="review-unlock" id="review-main" tabIndex={-1}><span className="review-lock-mark"><LockKeyhole size={23} aria-hidden="true"/></span><span className="review-eyebrow">PRIVATE REVIEW</span><h1>저장된 실제 결과를<br/>직접 확인하세요</h1><p>회사 판단과 뉴스 근거를 확인하는 비공개 검토본입니다.</p><form onSubmit={unlock}><label>체험 암호<input autoComplete="off" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button type="submit" disabled={busy}>{busy?'여는 중…':'체험 열기'}</button></form><details className="review-import"><summary>다른 검토 파일 불러오기<ChevronDown size={14} aria-hidden="true"/></summary><label>암호화된 검토 JSON<input type="file" accept=".json,application/json" onChange={choose}/></label></details>{input&&<p role="status">선택한 검토 자료를 사용합니다.</p>}{error&&<p className="review-error" role="alert">{error}</p>}<p className="review-note">새 API 호출 없이 저장된 결과를 살펴봅니다.</p></main>:<>
    <div className="review-context"><span><span className="review-status-dot"/>과거 저장 결과 <span className="review-note">{liveReview?'· 별도 저장 API 검토 부록 포함':'· 최신 기준 재평가 전'}</span></span><ReviewGuide bundle={bundle}/></div>
    <nav className="review-nav" aria-label="체험 화면">{tabs.map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <main className="review-content" id="review-main" tabIndex={-1}><header className="review-heading"><span className="review-eyebrow">{tab==='overview'?'GENERAL SCREENER':tab.toUpperCase()}</span><h1>{({overview:'수치 결과와 정성 판단',mlg:'AI 공급 역할과 위험 판단',tenx:'원점수와 사건 보정',radar:'시장 신호와 주요 뉴스'})[tab]}</h1><p>{({overview:'판단을 먼저 읽고, 근거를 펼쳐 확인하세요.',mlg:'공급 판정과 위험 제안을 기존 점수와 비교합니다.',tenx:'원점수 S를 유지하며 사건 제안 Q와 근거를 검토합니다.',radar:'보도된 사실과 조건부 시장 해석을 구분합니다.'})[tab]}</p></header>
      {tab==='overview'&&<><FinalLiveReview value={liveReview}/><ReviewOverview bundle={bundle} onNavigate={setTab}/></>}
      {tab==='mlg'&&<><CompanyReview bundle={bundle} strategy="mlg"/><details className="review-archive"><summary>이전 표본·과거 위험 기록 <ChevronDown size={16} aria-hidden="true"/></summary><div><Sample sample={findSample(bundle,'mlg')}/><LegacyObservations bundle={bundle}/><section className="review-card"><h2>MLG 반영 규칙</h2><p>기존 AI 가점 A와 사건 E를 검증된 판단으로 교체합니다.</p><p className="review-formula">총점 변화 = 6 × (새 E − 기존 E) + 새 A − 기존 A</p><p>이전 위험의 해소 근거가 확인되지 않으면 기존 위험을 유지합니다. 회사별 근거 검토와 사용자 승인 전까지 운영 점수는 바꾸지 않습니다.</p></section></div></details></>}
      {tab==='tenx'&&<><CompanyReview bundle={bundle} strategy="tenx"/><details className="review-archive"><summary>원본 수치 실행·이전 SEC 표본 <ChevronDown size={16} aria-hidden="true"/></summary><div><Numeric bundle={bundle}/><Sample sample={findSample(bundle,'tenx')}/></div></details></>}
      {tab==='radar'&&<ReviewRadar bundle={bundle}/>}
    </main><footer className="review-footer"><span>GENERAL SCREENER · PRIVATE REVIEW</span><span>사용자 검토·승인 후 운영 반영</span></footer></>}
  </div></Theme>;
}
