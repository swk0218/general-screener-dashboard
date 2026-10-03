import {useEffect,useState} from 'react';
import {validateObservationStatus,observationState,kstTime} from './observation-status.js';

export function ObservationStatus() {
  const [data,setData]=useState(null),[published,setPublished]=useState(null),[now,setNow]=useState(Date.now());
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/radar-observation.json`,{signal:controller.signal,cache:'no-store'})
      .then(response=>{if(!response.ok)throw new Error('UNAVAILABLE');return response.json();})
      .then(validateObservationStatus).then(setData).catch(()=>{});
    const timer=setInterval(()=>setNow(Date.now()),60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  useEffect(()=>{
    if(!data||data.build_sha==='local')return;
    const controller=new AbortController();
    async function deploymentTime() {
      const root='https://api.github.com/repos/swk0218/general-screener-dashboard';
      const response=await fetch(`${root}/deployments?environment=github-pages&per_page=5`,{signal:controller.signal});
      if(!response.ok)return;
      for(const deployment of await response.json()) {
        if(deployment.sha!==data.build_sha)continue;
        const statuses=await fetch(`${root}/deployments/${deployment.id}/statuses`,{signal:controller.signal});
        if(!statuses.ok)return;
        const success=(await statuses.json()).find(item=>item.state==='success'&&Date.parse(item.created_at)>=Date.parse(data.computed_at_utc));
        if(success){setPublished(success.created_at);return;}
      }
    }
    deploymentTime().catch(()=>{});
    return ()=>controller.abort();
  },[data]);
  const state=observationState(data,now);
  const delay=data?.source_market_close_utc&&data?.received_at_utc?
    (Date.parse(data.received_at_utc)-Date.parse(data.source_market_close_utc))/3600000:null;
  return <section className="radar-observation-panel" aria-label="관찰베타 운영 상태">
    <h2>관찰베타 · 하루 1회 갱신</h2>
    <p role="status"><strong>{state==='STALE'?'STALE · 이전 관찰':state==='UNAVAILABLE'?'자료 미확인':'관찰 수신 완료'}</strong> · NO_SIGNAL</p>
    <p>현재는 출처·수신 지연을 관찰합니다. 실시간 유효 경보가 아니며, 원모델 마감 +90분 기준을 바꾸지 않았습니다.</p>
    <dl>
      <div><dt>시장 기준 세션</dt><dd>{data?.source_session||'확인 불가'} · XNYS</dd></div>
      <div><dt>시장 마감</dt><dd>{kstTime(data?.source_market_close_utc)}</dd></div>
      <div><dt>원천 업데이트 시각</dt><dd>{kstTime(data?.provider_updated_at_utc)}</dd></div>
      <div><dt>최초 관찰 수신</dt><dd>{kstTime(data?.first_seen_at_utc)}</dd></div>
      <div><dt>이번 수신</dt><dd>{kstTime(data?.received_at_utc)}{delay!==null?` · 마감 후 ${delay.toFixed(1)}시간`:''}</dd></div>
      <div><dt>관찰 상태 계산 완료</dt><dd>{kstTime(data?.computed_at_utc)}</dd></div>
      <div><dt>빌드 완료</dt><dd>{kstTime(data?.built_at_utc)}</dd></div>
      <div><dt>실제 게시 완료</dt><dd>{kstTime(published)}</dd></div>
      <div><dt>다음 예정 갱신</dt><dd>{kstTime(data?.next_scheduled_at_utc)} · Actions 실행 지연 가능</dd></div>
    </dl>
    <p>예정: 미국 거래일 다음날 19:00 KST. 정규 마감부터 여름 14시간·겨울 13시간 후 수신하며 계산·배포 시간이 추가됩니다. 미국 휴장일은 경보 세션으로 계산하지 않습니다.</p>
    <p>출처: 공개 third-party archive의 UTC 날짜별 full-precision 항목 확인. 원본 수치·private 수신 기록·키는 이 공개 상태 파일에 포함하지 않습니다. 갱신 실패·기한 경과 시 STALE/자료 미확인입니다.</p>
  </section>;
}
