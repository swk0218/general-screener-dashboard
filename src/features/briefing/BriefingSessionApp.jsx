import { useEffect, useRef, useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Dashboard, UnlockScreen } from '../../App.jsx';
import { AppErrorBoundary } from '../../components/AppErrorBoundary.jsx';
import { decryptEnvelope } from '../../crypto/envelope.js';
import { assertDashboardPayload } from '../../data/contract.js';
import { quarantineDashboardPayload } from '../../data/payload-quarantine.js';
import { loadOptionalRadarDelivery } from '../radar/radar-envelope.js';
import { loadSeasonalityDelivery } from '../radar/seasonality-envelope.js';
import { loadBriefingDelivery } from './briefing-artifact.js';
import { selectBriefingSession, currentRadarAvailable } from './briefing-session.js';
import { BriefingView } from './BriefingView.jsx';
import { latestCompletedSession } from './market-calendar.js';

// Optional entry only: reuse the existing unlock and dashboard components.
// The passphrase lives only in the unlock call, never in persistent state/storage.
export function BriefingSessionApp() {
  const [envelope,setEnvelope]=useState(null),[error,setError]=useState('');
  const [session,setSession]=useState(null),[view,setView]=useState(()=>location.hash==='#/briefing'?'briefing':'dashboard');
  const generation=useRef(0),request=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/payload.enc.json?v=${encodeURIComponent(__BUILD_ID__)}`,{signal:controller.signal,cache:'no-store'})
      .then(r=>{if(!r.ok)throw Error();return r.json();}).then(setEnvelope)
      .catch(e=>{if(e.name!=='AbortError')setError('스크리너 자료를 불러오지 못했습니다.');});
    const onHash=()=>setView(location.hash==='#/briefing'?'briefing':'dashboard');
    window.addEventListener('hashchange',onHash);
    return ()=>{controller.abort();request.current?.abort();generation.current++;window.removeEventListener('hashchange',onHash);};
  },[]);
  async function unlock(passphrase){
    const payload=assertDashboardPayload(quarantineDashboardPayload(assertDashboardPayload(await decryptEnvelope(envelope,passphrase))));
    const id=++generation.current;request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setSession({payload,radar:null,radarStatus:null,seasonality:null,briefing:null});
    const active=()=>generation.current===id&&!controller.signal.aborted;
    const update=patch=>{if(active())setSession(old=>old?{...old,...patch}:null);};
    const base=`${import.meta.env.BASE_URL}data/`;
    loadSeasonalityDelivery(`${base}radar-seasonality.enc.json`,passphrase,controller.signal).then(seasonality=>update({seasonality})).catch(()=>{});
    let radar=null,radarStatus=null;
    try{radar=await loadOptionalRadarDelivery(`${base}radar-observation.json`,`${base}market-radar.enc.json`,passphrase,controller.signal,value=>{radarStatus=value;});}catch{/* Optional source holds briefing freshness. */}
    if(!active())return;
    update({radar,radarStatus});
    const expectedSession=selectBriefingSession(radar,radarStatus);
    const probe=import.meta.env.DEV&&import.meta.env.MODE==='briefing-probe';
    const briefingBase=probe?`${base}briefing-probe/`:base;
    const briefing=await loadBriefingDelivery(`${briefingBase}briefing-status.json`,`${briefingBase}briefing.enc.json`,passphrase,{
      expectedSession:expectedSession||undefined,forcePrevious:!expectedSession,signal:controller.signal,
      requireMarketUnavailable:!currentRadarAvailable(radar,radarStatus),
      expectedExecutionMode:probe?'provider_test':import.meta.env.DEV?'fake_transport':'provider'
    });
    update({briefing, assessmentReference:latestCompletedSession()});
  }
  function lock(){generation.current++;request.current?.abort();setSession(null);}
  function open(next){setView(next);location.hash=next==='briefing'?'#/briefing':'#/overview';}
  return <Theme theme={neutralTheme} mode="dark">{!session?<UnlockScreen envelope={envelope} envelopeError={error} onUnlock={unlock}/>:<AppErrorBoundary onLock={lock} onRetry={()=>open('dashboard')}>
    <nav className="brief-session-nav" aria-label="화면 이동"><button onClick={()=>open('dashboard')}>스크리너</button><button onClick={()=>open('briefing')}>투자 판단 브리핑</button><button onClick={lock}>잠그기</button></nav>
    {view==='briefing'?(session.briefing?<><div className="brief-notice" role="status">{session.assessmentReference ? <p>검토 기준 거래일: {session.assessmentReference.session} · NYSE 정규장 마감 기준. 각 엔진의 실제 자료일은 아래에 별도로 표시합니다.</p> : <p>거래일 달력의 최신 확인이 필요해 당일 판단을 유보합니다.</p>}</div><BriefingView data={session.briefing}/></>:<main className="brief-demo brief-main" role="status">브리핑 자료를 확인하고 있습니다.</main>):<Dashboard payload={session.payload} radar={session.radar} radarStatus={session.radarStatus} seasonality={session.seasonality} onLock={lock}/>}
  </AppErrorBoundary>}</Theme>;
}
