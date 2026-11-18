import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {Dashboard} from '../App.jsx';
import {AppErrorBoundary} from '../components/AppErrorBoundary.jsx';
import {STATUS_COPY} from '../features/qualitative/briefing-model.js';
import {cohortReview} from './cohort-preview-model.js';
import {ReviewClock} from './ReviewClock.jsx';
import '../fonts.css';
import '../styles.css';
import '../styles/terminal-v2.css';
import '../styles/refinement.css';
import './cohort-preview.css';

function CohortContext({value}){
  const c=value.cohort;
  return <section className="cohort-review-context" aria-label="개발 코호트 검증">
    <div className="cohort-review-heading"><strong>개발 브랜치 · {c.strategy} 정성 검토</strong><span>{c.evaluatedCount}/{c.expectedCount} 완료{c.unevaluatedCount?` · ${c.unevaluatedCount} 미평가`:''} · 운영 미반영</span></div>
    {c.executionStatus==='not_run'&&<p className="cohort-review-warning" role="note" aria-label="정성 분석 미실행"><strong>정성 분석 미실행</strong> · GitHub 결제·지출 한도로 작업이 시작되지 않았습니다. 뉴스 수집과 GPT 평가는 수행되지 않았습니다.</p>}
    <p>{c.numericAsOf?'수치 자료 기준':'자료 기준'} <ReviewClock value={c.numericAsOf||c.cutoffAt}/> · 순위는 {c.rankingBasis==='adjusted_score'?'보정 점수 T':'원점수 S'} 기준입니다.</p>
    {c.numericAsOf&&c.executionStatus!=='not_run'&&<p>뉴스 판단 기준 <ReviewClock value={c.cutoffAt}/></p>}
    <a className="cohort-review-open" href={`#/selection/${c.strategy}`}>{c.strategy} 스크리너 보기 →</a>
    <details><summary>전체 후보 검토 {c.expectedCount}개</summary>
      <p>화면에는 실행에서 선정한 추천을 표시합니다. 아래 목록은 평가 대상 전체의 처리 상태입니다.</p>
      <div className="cohort-review-table"><table><thead><tr><th>순위</th><th>종목</th><th>정성 처리</th>{c.strategy==='TENX'&&<th>Q</th>}</tr></thead><tbody>{c.candidates.map(row=><tr key={row.symbol}><td>{row.rank}</td><td>{row.symbol}</td><td>{STATUS_COPY[row.status]}</td>{c.strategy==='TENX'&&<td>{row.q===null?'미평가':`${row.q>0?'+':''}${row.q}`}</td>}</tr>)}</tbody></table></div>
      <p>{c.executionStatus==='not_run'?'수치 실행':'실행'} {c.runId} · 기준 커밋 <code>{c.sourceSha}</code></p>
      {c.blockedRunId&&<p>정성 실행 시도 {c.blockedRunId} · 작업 시작 전 중단</p>}
    </details>
  </section>;
}

function CohortPreview(){
  const [value,setValue]=useState(null),[state,setState]=useState('loading'),[attempt,setAttempt]=useState(0);
  const controller=useRef(null);
  useEffect(()=>{
    const current=new AbortController();controller.current=current;
    setValue(null);setState('loading');
    const timer=setTimeout(()=>current.abort(),15000);
    async function load(){
      try{
        const response=await fetch('/__development/cohort-review',{cache:'no-store',signal:current.signal});
        if(!response.ok)throw Error();
        const raw=await response.text();if(raw.length>5_000_000)throw Error();
        const data=cohortReview(JSON.parse(raw));
        if(!current.signal.aborted){setValue(data);setState('ready');}
      }catch{if(controller.current===current)setState('unavailable');}
      finally{clearTimeout(timer);}
    }
    load();return()=>{controller.current=null;current.abort();clearTimeout(timer);};
  },[attempt]);
  function close(){controller.current?.abort();controller.current=null;setValue(null);setState('closed');}
  return <Theme theme={neutralTheme} mode="dark">{value?<AppErrorBoundary key={attempt} onRetry={()=>setAttempt(x=>x+1)} onLock={close}>
    <Dashboard payload={value.payload} radar={null} radarStatus={null} radarNews={null} seasonality={null} onLock={close} reviewContext={<CohortContext value={value}/>}/>
  </AppErrorBoundary>:<main className="cohort-review-empty"><span className="brand-wordmark">GENERAL SCREENER</span><h1>{state==='loading'?'실행 결과를 불러오는 중입니다.':state==='closed'?'검토 자료를 닫았습니다.':'검토 실행 자료를 불러오지 못했습니다.'}</h1>
    <p role={state==='unavailable'?'alert':'status'}>{state==='loading'?'개발 브랜치의 실제 검증 결과를 준비합니다.':state==='closed'?'화면에 불러온 자료를 메모리에서 지웠습니다.':'검토 자료의 준비 상태를 확인한 뒤 다시 불러와 주세요.'}</p>
    {state!=='loading'&&<button type="button" onClick={()=>setAttempt(x=>x+1)}>자료 다시 불러오기</button>}
  </main>}</Theme>;
}

if(import.meta.env.DEV)createRoot(document.getElementById('root')).render(<CohortPreview/>);
