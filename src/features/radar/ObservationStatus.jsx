import {useEffect,useState} from 'react';
import {validateObservationStatus,observationState,kstTime} from './observation-status.js';

export function ObservationStatus({delivery=null}) {
  const [data,setData]=useState(null),[now,setNow]=useState(Date.now());
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/radar-observation.json`,{signal:controller.signal,cache:'no-store'})
      .then(response=>{if(!response.ok)throw new Error('UNAVAILABLE');return response.json();})
      .then(validateObservationStatus).then(setData).catch(()=>{});
    const timer=setInterval(()=>setNow(Date.now()),60000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  const state=observationState(data,now);
  const engine=data?.schema_version==='radar_engine_status_v1';
  const engineEvidence=engine&&data.status!=='UNAVAILABLE';
  const inputTime=delivery?.observation?.first_seen_at_utc||(engine?data?.input_admitted_at_utc:data?.first_seen_at_utc);
  const computedTime=delivery?.observation?.computed_at_utc||(engine?data?.model_computed_at_utc:data?.computed_at_utc);
  return <section className="radar-observation-panel" aria-label="관찰베타 운영 상태">
    <h2>시장 신호 · 일일 결과 게시</h2>
    <p role="status"><strong>{state==='STALE'?'STALE · 이전 관찰':state==='UNAVAILABLE'?'자료 미확인':'계산된 세션 자료'}</strong> · {delivery?.controller_evaluated?'모델 상태 계산 완료':'신호 미계산'}</p>
    <p>{engineEvidence?'MarketRadar 엔진 결과가 확인되었습니다. 계획된 확인 시각은 월–토 19:17 KST, 미완료 재확인은 21:40 KST입니다.':'MarketRadar 운영 전환 준비 중이거나 엔진 결과를 확인하지 못했습니다. 목표 일정은 월–토 19:17 / 21:40 KST이며, 실제 활성화 여부는 아직 확인되지 않았습니다.'} 이 화면은 게시된 결과만 읽습니다. 일일 제품의 수신·계산 마감은 다음 XNYS 개장 30분 전입니다. 연구 당시 마감 +90분 평가 전제와 다르며 모델 계수·신호 기준은 유지합니다.</p>
    <dl>
      <div><dt>시장 기준 세션</dt><dd>{delivery?.session||data?.source_session||'확인 불가'} · XNYS</dd></div>
      <div><dt>시장 마감</dt><dd>{kstTime(delivery?.observation?.source_market_close_utc||data?.source_market_close_utc)}</dd></div>
      <div><dt>기대되는 완료 세션</dt><dd>{data?.expected_session||delivery?.observation?.expected_session||'확인 불가'}</dd></div>
      <div><dt>입력 원장 등록</dt><dd>{kstTime(inputTime)}</dd></div>
      <div><dt>입력 묶음 관측 완료</dt><dd>{kstTime(engine?data?.http_capture_completed_at_utc:null)}</dd></div>
      <div><dt>모델 계산 완료</dt><dd>{kstTime(computedTime)}</dd></div>
      <div><dt>마지막 엔진 실행 시도</dt><dd>{kstTime(engine?data?.latest_attempt_at_utc:null)}</dd></div>
      {delivery?.gauge.presentation_computed_at_utc&&<div><dt>표시 변환 갱신</dt><dd>{kstTime(delivery.gauge.presentation_computed_at_utc)} · 원점수 계산·수신 시각 유지</dd></div>}
      <div><dt>빌드 완료</dt><dd>{kstTime(data?.built_at_utc)}</dd></div>
      <div><dt>Pages 게시 확인</dt><dd>{kstTime(data?.published_at_utc)}</dd></div>
      <div><dt>다음 예정 갱신</dt><dd>{kstTime(data?.next_scheduled_at_utc)} · Actions 실행 지연 가능</dd></div>
    </dl>
    <p>시각은 입력 수신, 모델 계산, 화면 빌드, 게시를 각각 구분합니다. 화면을 다시 빌드해도 과거 입력이나 점수가 새 자료로 바뀌지 않습니다. Actions 예약 실행은 지연될 수 있습니다.</p>
    <p>{engineEvidence?'상태 제공: MarketRadar 엔진.':'상태 제공 엔진: 확인 불가.'} 이 프론트엔드는 공급자 자료를 수집하거나 모델을 계산하지 않습니다. 원본 수치·private 수신 기록·키는 이 공개 상태 파일에 포함하지 않습니다. 갱신 실패·기한 경과 시 STALE/자료 미확인입니다.</p>
  </section>;
}
