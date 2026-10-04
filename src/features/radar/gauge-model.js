const finite=value=>typeof value==='number'&&Number.isFinite(value);
export function scalarPosition(value,min=0,max=100) {
  return finite(value)&&value>=min&&value<=max&&max>min ? 100*(value-min)/(max-min) : null;
}
export function thresholdPosition(score,threshold) {
  if(scalarPosition(score,0,1)===null||scalarPosition(threshold,0,1)===null) return null;
  return {score:score*100,threshold:threshold*100,delta:score-threshold,above:score>=threshold};
}
export function radarHeaderStatus(data) {
  return {date:data?.session||null,label:'Radar 기준',status:!data?'자료 없음':
    data.operating_status==='DAILY_MODEL_COMPUTED'?'일일 모델 판단 · 베타':data.operating_status==='OBSERVATION_COMPUTED'?'관찰 점수 · 경보 미발행':data.operating_status==='REPLAY_NO_FORWARD_ISSUE'?'동결 연구':
    data.gauge?.data_status==='CACHED_STALE'?'과거 자료':data.evidence_ready?'입력 검증':'관측 검증 대기',tone:'is-hold'};
}
export function inputGaugeCards(data) {
  const inputs=data?.inputs||{},references=data?.references||{};
  const metadata=key=>data?.input_metadata?.[key]||{source_date:data?.session||null,received_at_utc:null,source:'출처 확인 대기'};
  const rank=key=>scalarPosition(inputs[key],0,1);
  const positions=data?.input_positions;
  const vixRank=['frozen-input-prior-midrank-v1','frozen-input-prior-midrank-v2'].includes(positions?.version)&&positions.window_sessions===252&&positions.minimum_valid===126&&positions.excludes_current===true ? scalarPosition(positions.vix_rank,0,1):null;
  const uiRank=key=>positions?.version==='frozen-input-prior-midrank-v2'&&positions.ui_only===true ? scalarPosition(positions[key],0,1):null;
  const card=(key,title,value,unit,position,basis)=>({key,title,value:finite(value)?value:null,unit,position,basis,metadata:metadata(key)});
  return {model:[
    card('cnn_rank','CNN 과거 순위',finite(inputs.cnn_rank)?inputs.cnn_rank*100:null,'백분위',rank('cnn_rank'),'직전 252세션 내 위치'),
    card('return20_risk','20일 위험조정 수익률',inputs.return20_risk,'위험조정 배수',uiRank('return20_risk_rank'),'직전 252세션 내 위치 · 화면 전용'),
    card('trend200_risk','200일 평균선 이격',inputs.trend200_risk,'위험조정 배수',uiRank('trend200_risk_rank'),'직전 252세션 내 위치 · 화면 전용'),
    card('RV20_rank','실현 변동성 과거 순위',finite(inputs.RV20_rank)?inputs.RV20_rank*100:null,'백분위',rank('RV20_rank'),'직전 252세션 내 위치'),
    card('log_implied_realized','VIX / 실현 변동성',inputs.log_implied_realized,'자연로그',uiRank('log_implied_realized_rank'),'직전 252세션 내 위치 · 화면 전용'),
  ],reference:[
    card('cnn_score','CNN Fear & Greed',inputs.cnn_score,'점 / 100',scalarPosition(inputs.cnn_score),'원수치 · 공포 → 탐욕'),
    card('vix','VIX',references.vix,'연율 %',finite(references.vix)?vixRank:null,vixRank===null?'원수치 · 검증된 과거 순위 없음':'직전 252세션 내 위치'),
    card('rsi14','RSI 14',references.rsi14,'점 / 100',scalarPosition(references.rsi14),'Wilder RSI · 참고 지표'),
  ]};
}
