const timestamp=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
export function validateObservationStatus(value) {
  if(value?.schema_version!=='radar_observation_status_v1'||value.mode!=='OBSERVATION_BETA'
    ||value.decision!=='NO_SIGNAL'||value.evidence_ready!==false||value.model_score!==null
    ||value.events?.bottom!==false||value.events?.top!==false
    ||!['OBSERVED_NO_SIGNAL','STALE','UNAVAILABLE'].includes(value.status)
    ||value.model_policy!=='close90_v1_unchanged'||value.collection_policy!=='next_open_observation_only'
    ||value.historical_first_seen_claimed!==false) throw new Error('INVALID_OBSERVATION_STATUS');
  for(const key of ['market_close_utc','next_open_utc','computed_at_utc','next_scheduled_at_utc'])
    if(!timestamp(value[key]))throw new Error('INVALID_OBSERVATION_TIME');
  for(const key of ['source_market_close_utc','provider_updated_at_utc','first_seen_at_utc','received_at_utc','built_at_utc','published_at_utc'])
    if(value[key]!==null&&!timestamp(value[key]))throw new Error('INVALID_OBSERVATION_TIME');
  if(value.source_session!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(value.source_session||''))throw new Error('INVALID_OBSERVATION_DATE');
  if(value.status==='OBSERVED_NO_SIGNAL'&&(!value.source_session||!value.first_seen_at_utc||!value.received_at_utc))throw new Error('MISSING_OBSERVATION_RECEIPT');
  if(value.first_seen_at_utc&&Date.parse(value.first_seen_at_utc)>Date.parse(value.received_at_utc))throw new Error('FUTURE_FIRST_SEEN');
  return value;
}
export function observationState(value,now=Date.now()) {
  if(!value)return 'UNAVAILABLE';
  if(value.status==='UNAVAILABLE')return 'UNAVAILABLE';
  return value.status==='STALE'||Date.parse(value.computed_at_utc)>now+5*60000
    ||Date.parse(value.received_at_utc)>now+5*60000||now>=Date.parse(value.next_open_utc)
    ||now>Date.parse(value.next_scheduled_at_utc)+2*3600000?'STALE':'OBSERVED_NO_SIGNAL';
}
export function kstTime(value) {
  return value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' KST':'확인 불가';
}
