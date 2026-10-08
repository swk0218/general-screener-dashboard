export const ENGINE_STATUS_KEYS=['schema_version','producer_repository','producer_revision','status','source_session','expected_session','source_market_close_utc','input_admitted_at_utc','model_computed_at_utc','latest_attempt_at_utc','http_capture_completed_at_utc','next_scheduled_at_utc','schedule','failure_code','historical_first_seen_claimed','feed_cipher_sha256','built_at_utc','published_at_utc','publication_receipt_result_id','publication_deployment_id','engine_result_id'];
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function unavailableEngineStatus(reason='ENGINE_STATUS_UNAVAILABLE'){
  return Object.fromEntries(ENGINE_STATUS_KEYS.map(key=>[key,
    key==='schema_version'?'radar_engine_status_v1':key==='producer_repository'?'swk0218/MarketRadar':
    key==='status'?'UNAVAILABLE':key==='schedule'?'MON_SAT_1017_1240_UTC':
    key==='failure_code'?reason:key==='historical_first_seen_claimed'?false:null]));
}
export function validateEngineStatus(value){
  if(value?.schema_version!=='radar_engine_status_v1'||Object.keys(value).sort().join('|')!==[...ENGINE_STATUS_KEYS].sort().join('|')
    ||value.producer_repository!=='swk0218/MarketRadar'||value.schedule!=='MON_SAT_1017_1240_UTC'
    ||!['DATED','STALE','FAILED','UNAVAILABLE'].includes(value.status)
    ||value.historical_first_seen_claimed!==false)throw new Error('INVALID_ENGINE_STATUS');
  for(const key of ['source_market_close_utc','input_admitted_at_utc','model_computed_at_utc','latest_attempt_at_utc','http_capture_completed_at_utc','next_scheduled_at_utc','built_at_utc','published_at_utc'])
    if(value[key]!==null&&!timestamp(value[key]))throw new Error('INVALID_ENGINE_TIME');
  for(const key of ['source_session','expected_session'])
    if(value[key]!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(value[key]))throw new Error('INVALID_ENGINE_DATE');
  if(value.status!=='UNAVAILABLE'&&(!value.source_session||!value.expected_session
    ||!value.input_admitted_at_utc||!value.model_computed_at_utc||!value.latest_attempt_at_utc
    ||!value.next_scheduled_at_utc||!hash(value.feed_cipher_sha256)||!hash(value.engine_result_id)))throw new Error('MISSING_ENGINE_RECEIPT');
  if(value.input_admitted_at_utc&&Date.parse(value.input_admitted_at_utc)>Date.parse(value.model_computed_at_utc))throw new Error('ENGINE_CLOCK_REVERSED');
  if(value.model_computed_at_utc&&Date.parse(value.model_computed_at_utc)>Date.parse(value.latest_attempt_at_utc))throw new Error('ENGINE_CLOCK_REVERSED');
  if(value.status==='DATED'&&value.source_session!==value.expected_session)throw new Error('FALSE_CURRENT_ENGINE_SESSION');
  if(value.published_at_utc&&value.engine_result_id&&value.publication_receipt_result_id!==value.engine_result_id)throw new Error('PUBLICATION_RESULT_BINDING_MISMATCH');
  return value;
}
const timestamp=value=>typeof value==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
export function validateObservationStatus(value) {
  if(value?.schema_version==='radar_engine_status_v1')return validateEngineStatus(value);
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
  if(value.schema_version==='radar_engine_status_v1'){
    if(value.status==='UNAVAILABLE')return 'UNAVAILABLE';
    return value.status==='FAILED'||value.status==='STALE'
      ||Date.parse(value.model_computed_at_utc)>now+5*60000
      ||Date.parse(value.input_admitted_at_utc)>now+5*60000
      ||now>Date.parse(value.next_scheduled_at_utc)+2*3600000?'STALE':'OBSERVED_NO_SIGNAL';
  }
  if(value.status==='UNAVAILABLE')return 'UNAVAILABLE';
  return value.status==='STALE'||Date.parse(value.computed_at_utc)>now+5*60000
    ||Date.parse(value.received_at_utc)>now+5*60000||now>=Date.parse(value.next_open_utc)
    ||now>Date.parse(value.next_scheduled_at_utc)+2*3600000?'STALE':'OBSERVED_NO_SIGNAL';
}
export function kstTime(value) {
  return value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' KST':'확인 불가';
}
