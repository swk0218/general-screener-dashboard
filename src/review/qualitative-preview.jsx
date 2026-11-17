import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {FileUp,X} from 'lucide-react';
import {StockBriefing} from '../features/qualitative/Briefing.jsx';
import {qualitativePreview} from './qualitative-preview-model.js';
import {ReviewClock} from './ReviewClock.jsx';
import '../fonts.css';
import '../styles.css';
import '../styles/terminal-v2.css';
import '../styles/refinement.css';
import './review.css';

function QualitativePreview() {
  const [value,setValue]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const epoch=useRef(0);
  function clear(){epoch.current++;setValue(null);setError('');setBusy(false);}
  async function choose(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const attempt=++epoch.current;setValue(null);setError('');setBusy(true);
    try{
      if(file.size>2_000_000)throw Error();
      const data=qualitativePreview(JSON.parse(await file.text()));
      if(epoch.current===attempt)setValue(data);
    }catch{if(epoch.current===attempt)setError('실제 API 검증에서 생성한 정성 검토 JSON 파일을 확인해 주세요.');}
    finally{if(epoch.current===attempt)setBusy(false);}
  }
  return <Theme theme={neutralTheme} mode="dark"><div className="review-shell">
    <a className="skip-link" href="#review-main">본문으로 이동</a>
    <header className="review-top"><div className="brand-wordmark">GENERAL SCREENER</div><span className="review-ai-label">AI 검토</span>{value&&<button className="review-lock" type="button" onClick={clear}><X size={16} aria-hidden="true"/>자료 닫기</button>}</header>
    <div className="review-context"><span><span className="review-status-dot"/>개발 브랜치 · 실제 API 검증 자료</span><span className="review-note">운영 미반영</span></div>
    <main className="review-content" id="review-main" tabIndex={-1}>
      <header className="review-heading"><span className="review-eyebrow">QUALITATIVE REVIEW</span><h1>사건 판단과 근거를 확인하세요</h1><p>기존 스크리너와 같은 정성 분석 화면에서 실제 검증 결과를 살펴봅니다.</p></header>
      <section className="review-card" aria-label="정성 검토 자료">
        <label className="qualitative-preview-import"><FileUp size={18} aria-hidden="true"/><span>{busy?'자료를 확인하는 중…':'정성 검토 JSON 불러오기'}</span><input type="file" accept=".json,application/json" aria-label="정성 검토 JSON" onChange={choose} disabled={busy}/></label>
        <p className="review-note">선택한 파일은 화면 메모리에서만 사용합니다. 자료 닫기·새로고침 시 지워집니다.</p>
        {error&&<p className="review-error" role="alert">{error}</p>}
      </section>
      {value?<section className="review-card qualitative-preview-result" aria-label={value.recommendation.symbol+' 실제 정성 검토'}>
        <header className="review-section-heading"><div><span className="review-ai-label">{value.recommendation.strategy} · 제한된 후보 검토</span><h2>{value.recommendation.symbol} 사건·사업 판단</h2></div><span className="review-tag">검증 실행 결과</span></header>
        <p className="review-hold">원점수는 과거 수치 실행의 기록입니다. 이번에 확인한 뉴스 후보의 판정을 함께 표시하며, 현재 투자 추천이나 전체 종목의 순위를 뜻하지 않습니다.</p>
        <StockBriefing recommendation={value.recommendation}/>
        <details className="review-source"><summary>검증 실행 기록</summary><p>검증 자료 생성 <ReviewClock value={value.createdAt}/></p><p>API 요청 {value.receipt.providerCalls}회 · 검증 실행 {value.receipt.runId}</p><p className="review-note">기준 커밋 <code>{value.receipt.sourceSha}</code></p></details>
      </section>:<p className="review-note" role="status">검토할 자료를 불러오면 판단·점수·근거를 표시합니다.</p>}
    </main><footer className="review-footer"><span>GENERAL SCREENER · DEVELOPMENT REVIEW</span><span>새 API 요청 없이 저장된 검증 결과 표시</span></footer>
  </div></Theme>;
}

// The separate entry is served by Vite only; the production entry never imports it.
if(import.meta.env.DEV)createRoot(document.getElementById('root')).render(<QualitativePreview/>);
