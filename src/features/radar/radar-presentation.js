import { validateRadarDelivery } from './radar-contract.js';

const LEVEL_COPY = {
  'Extreme Low':'저점 경보 발생', Low:'냉각 구간', Neutral:'중간 구간',
  High:'과열 구간', 'Extreme High':'고점 경보 발생',
};

// Both entry points consume the same validated packet, including stale/conflict states.
export function radarPresentation(delivery) {
  let data=null;
  try { if(delivery)data=validateRadarDelivery(delivery); } catch { /* Optional data fails closed. */ }
  const unavailable=!data||data.gauge.level==='UNAVAILABLE';
  const observation=data?.operating_status==='OBSERVATION_COMPUTED';
  const conflict=Boolean(data?.events.bottom&&data?.events.top);
  const stale=['DATED_STALE_OBSERVATION','CACHED_STALE'].includes(data?.gauge.data_status);
  const failed=data?.observation?.collection_status==='FAILED_RETAINED_DATED';
  const level=data?.gauge.level;
  const headline=conflict?'양방향 경보 충돌':unavailable?'계산 불가':level==='CONFLICT'?'이전 혼합 표시 자료':LEVEL_COPY[level];
  const eventLabel=unavailable||observation?'미계산':conflict?'저점·고점 동시 발생':data.events.bottom?'저점 경보':data.events.top?'고점 경보':'고점 및 저점 경보 없음';
  const missing=data?.observation?.latest_session_input_missing;
  const notice=stale||failed ? missing?.length
    ?`${data.observation.expected_session} ${missing.join(' · ')} 미확보`
    :failed?'갱신 실패 · 이전 점수 유지':'갱신 지연 · 이전 점수 유지' : null;
  return {data,unavailable,observation,conflict,stale,failed,level,headline,eventLabel,notice};
}
