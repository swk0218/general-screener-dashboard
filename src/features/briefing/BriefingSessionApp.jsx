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
import { selectBriefingSession, currentRadarAvailable, reassessOpenBriefing, receivedSourceClocks } from './briefing-session.js';
import { BriefingView } from './BriefingView.jsx';
import { latestCompletedSession } from './market-calendar.js';
import { probeStatusLabel } from './briefing-model.js';
import { optionalDelivery } from './optional-delivery.js';

// Optional entry only: reuse the existing unlock and dashboard components.
// The passphrase lives only in the unlock call, never in persistent state/storage.
export function BriefingSessionApp() {
  const probe=import.meta.env.DEV&&import.meta.env.MODE==='briefing-probe';
  const cases=['normal','date_mismatch','quarantined','insufficient','conflict'];
  const requested=new URLSearchParams(location.search).get('probe_case');
  const probeCase=cases.includes(requested)?requested:'normal';
  const sourceBase=probe?`${import.meta.env.BASE_URL}data/briefing-probe/product-v1-${probeCase}/`:`${import.meta.env.BASE_URL}data/`;
  const [envelope,setEnvelope]=useState(null),[error,setError]=useState('');
  const [session,setSession]=useState(null),[view,setView]=useState(()=>location.hash==='#/briefing'?'briefing':'dashboard');
  const generation=useRef(0),request=useRef(null);
  const [recoveryRevision,setRecoveryRevision]=useState(0);
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    const refresh=()=>setNow(Date.now());
    const timer=window.setInterval(refresh,30000);
    window.addEventListener('focus',refresh);
    window.addEventListener('pageshow',refresh);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);
      window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const assessmentReference=latestCompletedSession(now);
  const visibleBriefing=probe?session?.briefing:reassessOpenBriefing(session?.briefing,session?.radar,session?.radarStatus,now);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${sourceBase}payload.enc.json?v=${encodeURIComponent(__BUILD_ID__)}`,{signal:controller.signal,cache:'no-store'})
      .then(r=>{if(!r.ok)throw Error();return r.json();}).then(setEnvelope)
      .catch(e=>{if(e.name!=='AbortError')setError('스크리너 자료를 불러오지 못했습니다.');});
    const onHash=()=>setView(location.hash==='#/briefing'?'briefing':'dashboard');
    window.addEventListener('hashchange',onHash);
    return ()=>{controller.abort();request.current?.abort();generation.current++;window.removeEventListener('hashchange',onHash);};
  },[]);
  async function unlock(passphrase){
    setNow(Date.now());
    const payload=assertDashboardPayload(quarantineDashboardPayload(assertDashboardPayload(await decryptEnvelope(envelope,passphrase))));
    const id=++generation.current;request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setSession({payload,radar:null,radarStatus:null,seasonality:null,briefing:null});
    const active=()=>generation.current===id&&!controller.signal.aborted;
    const update=patch=>{if(active())setSession(old=>old?{...old,...patch}:null);};
    const base=`${import.meta.env.BASE_URL}data/`;
    if(!probe)optionalDelivery(signal=>loadSeasonalityDelivery(`${base}radar-seasonality.enc.json`,passphrase,signal),{signal:controller.signal}).then(seasonality=>update({seasonality}));
    let radar=null,radarStatus=null;
    if(!probe){
      const source=await optionalDelivery(async signal=>{
        let status=null;
        const value=await loadOptionalRadarDelivery(`${base}radar-observation.json`,`${base}market-radar.enc.json`,passphrase,signal,item=>{status=item;});
        return {radar:value,radarStatus:status};
      },{signal:controller.signal});
      if(source){radar=source.radar;radarStatus=source.radarStatus;}
    }
    if(!active())return;
    update({radar,radarStatus});
    const expectedSession=selectBriefingSession(radar,radarStatus);
    const briefingBase=probe?sourceBase:base;
    const briefing=await optionalDelivery(signal=>loadBriefingDelivery(`${briefingBase}briefing-status.json`,`${briefingBase}briefing.enc.json`,passphrase,{
      expectedSession:probe?undefined:expectedSession||undefined,forcePrevious:!probe&&!expectedSession,signal,
      requireMarketUnavailable:!probe&&!currentRadarAvailable(radar,radarStatus),
      expectedExecutionMode:probe?'provider_test':import.meta.env.DEV?'fake_transport':'provider'
    }),{signal:controller.signal,fallback:{status:'unavailable',demo:false,reason:'optional_delivery_timeout_or_failure'}});
    update({briefing});
  }
  function lock(){generation.current++;request.current?.abort();setSession(null);}
  function open(next){setView(next);location.hash=next==='briefing'?'#/briefing':'#/overview';}
  function retry(){
    open('dashboard');
    // Navigation alone leaves the boundary latched in its error state.
    // Remount it, matching the main dashboard's recovery behavior.
    setRecoveryRevision(current=>current+1);
  }
  return <Theme theme={neutralTheme} mode="dark">{probe?<aside className="brief-notice" aria-label="격리된 제품 시험"><strong>과거 합성 엔진 자료 · 현재 투자 판단에 사용하지 마세요</strong><p>{probeStatusLabel(session?.briefing?.probe_context)}. 운영 자료와 연결하지 않습니다.</p><nav aria-label="시험 조건">{cases.map((name,i)=><a key={name} href={`?probe_case=${name}#/briefing`}>{['정상 합성 자료','엔진 시점 차이','Radar 격리','자료 부족','근거 상충'][i]} </a>)}</nav></aside>:null}{!session?<UnlockScreen envelope={envelope} envelopeError={error} onUnlock={unlock}/>:<AppErrorBoundary key={recoveryRevision} onLock={lock} onRetry={retry}>
    <nav className="brief-session-nav" aria-label="화면 이동"><button onClick={()=>open('dashboard')}>스크리너</button><button onClick={()=>open('briefing')}>투자 판단 브리핑</button><button onClick={lock}>잠그기</button></nav>
    {view==='briefing'?(session.briefing?<><div className="brief-notice" role="status">{probe ? <p>합성 시험의 검토 거래일: {session.briefing.session || session.briefing.probe_context?.assessment_session || "확인 불가"} · 과거 합성 자료이며 현재 거래일의 실제 관측이 아닙니다.</p> : assessmentReference ? <p>검토 기준 거래일: {assessmentReference.session} · NYSE 정규장 마감 기준. 각 엔진의 실제 자료일은 아래에 별도로 표시합니다.</p> : <p>거래일 달력의 최신 확인이 필요해 당일 판단을 유보합니다.</p>}</div><BriefingView data={visibleBriefing} receivedClocks={receivedSourceClocks(session.payload,session.radarStatus)}/></>:<main className="brief-demo brief-main" role="status">브리핑 자료를 확인하고 있습니다.</main>):<Dashboard payload={session.payload} radar={session.radar} radarStatus={session.radarStatus} seasonality={session.seasonality} onLock={lock}/>}
  </AppErrorBoundary>}</Theme>;
}
