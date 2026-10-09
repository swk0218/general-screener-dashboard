import { validateRadarDelivery } from './radar-contract.js';
import { observationState, validateObservationStatus } from './observation-status.js';

const LEVEL_COPY = {
  'Extreme Low':'저점 경보 발생', Low:'냉각 구간', Neutral:'중립 구간',
  High:'과열 구간', 'Extreme High':'고점 경보 발생',
};

// Both entry points consume the same validated packet, including stale/conflict states.
export function radarPresentation(delivery,status=undefined,now=Date.now()) {
  let data=null;
  try { if(delivery)data=validateRadarDelivery(delivery); } catch { /* Optional data fails closed. */ }
  const unavailable=!data||data.gauge.level==='UNAVAILABLE';
  const observation=data?.operating_status==='OBSERVATION_COMPUTED';
  const conflict=Boolean(data?.events.bottom&&data?.events.top);
  let currentStatus=null;
  try { if(status)currentStatus=validateObservationStatus(status); } catch { /* Retain dated data only. */ }
  const statusUnavailable=status!==undefined&&(!currentStatus
    ||observationState(currentStatus,now)==='UNAVAILABLE'
    ||currentStatus.source_session!==data?.session);
  const failed=data?.observation?.collection_status==='FAILED_RETAINED_DATED'||currentStatus?.status==='FAILED';
  const stale=Boolean(data)&&(['DATED_STALE_OBSERVATION','CACHED_STALE'].includes(data.gauge.data_status)
    ||failed||statusUnavailable||Boolean(currentStatus&&observationState(currentStatus,now)==='STALE'));
  const level=data?.gauge.level;
  const headline=conflict?'양방향 경보 충돌':unavailable?'—':level==='CONFLICT'?'—':LEVEL_COPY[level];
  const eventKind=unavailable||observation?'unavailable':conflict?'both':data.events.bottom?'bottom':data.events.top?'top':'none';
  const eventLabel={unavailable:'—',both:'저점·고점 동시 발생',bottom:'저점 경보',top:'고점 경보',none:'경보 없음'}[eventKind];
  const missing=data?.observation?.latest_session_input_missing;
  const notice=!data?null:statusUnavailable?'자료 상태 미확인 · 기준일 관측':stale||failed ? missing?.length
    ?`${currentStatus?.expected_session||data.observation.expected_session} ${missing.join(' · ')} 미확보`
    :failed?'갱신 실패 · 이전 점수 유지':'갱신 지연 · 이전 점수 유지' : null;
  return {data,unavailable,observation,conflict,stale,failed,level,headline,eventKind,
    eventLabel:stale&&!unavailable&&!observation?`기준일 ${eventLabel}`:eventLabel,notice};
}
