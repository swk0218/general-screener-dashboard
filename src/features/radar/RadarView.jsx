import {REASONS} from './signal-contract.js';
import { validateRadarDelivery } from './radar-contract.js';
import { inputGaugeCards, thresholdPosition, radarHeaderStatus } from './gauge-model.js';
import { GaugeCard, GaugeTrack } from './GaugeCard.jsx';
import './radar.css';
import { ObservationStatus } from './ObservationStatus.jsx';
import { kstTime } from './observation-status.js';

const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:3}):'—';

export function RadarView({delivery=null}) {
  let data=null;
  try {if(delivery)data=validateRadarDelivery(delivery);}catch{/* Separate optional surface fails closed. */}
  const cards=inputGaugeCards(data),status=radarHeaderStatus(data);
  const observation=data?.operating_status==='OBSERVATION_COMPUTED';
  const daily=data?.operating_status==='DAILY_MODEL_COMPUTED';
  const dated=observation||daily;
  const stale=data?.gauge.data_status==='DATED_STALE_OBSERVATION';
  return <section className="secondary-view radar-view">
    <header className="radar-page-header"><p>MARKET RADAR</p><h1>시장 전환 신호</h1><p>낮을수록 저점, 높을수록 고점 방향 · 확률이 아닌 연구 점수</p></header>
    <div className="radar-research-notice" role="status">
      <span>{status.status}</span><time dateTime={data?.session}>{data?.session||'자료 확인 대기'}</time>
      <p>{daily?'일일 모델 판단 · 베타 검증 중 · 실운영 성과 미검증':observation?'날짜가 명시된 관찰 점수 · 운영 경보 미발행 · 경보 제어기 미계산':data?.operating_status==='REPLAY_NO_FORWARD_ISSUE'?'동결 연구 재현 · 실제 운영 신호 아님':'실제 관측·수집 경로 검증 대기'}</p>
    </div>
    {dated&&<div role="status"><p>관찰 기준일 {data.session} · {data.gauge.data_status==='DATED_STALE_OBSERVATION'?'과거 관찰':'최신 공통 입력'} 점수입니다. 최신 시장 기준일 {data.observation.expected_session}의 결측: {data.observation.latest_session_input_missing?.join(', ')||'없음'}.</p>
      <p>공통 입력 최초 관찰 수신 {kstTime(data.observation.first_seen_at_utc)} · 점수 계산 {kstTime(data.observation.computed_at_utc)}{daily?' · 다음 개장 전 수신 정책':' · 신호 미계산'}.</p></div>}
    {dated&&data.observation.collection_status==='FAILED_RETAINED_DATED'&&<p role="status">갱신 실패 · 이전 기준일의 점수를 유지합니다. 오늘의 신규 신호가 아닙니다.</p>}
    <section className="radar-gauge" aria-label="시장 전환 게이지">
      <div className="radar-main-value"><strong>{data?.gauge.score??'—'}<small className="radar-score-denominator"> /100</small></strong><span>{data?.gauge.level==='CONFLICT'?'혼합 · 단일 점수 없음':data?.gauge.score===null?'자료 확인 중':data?.gauge.level||'자료 확인 중'}</span></div>
      <GaugeTrack position={data?.gauge.score??null} label="확률이 아닌 시장 전환 방향 표시 점수"
        banded
        labels={['Extreme Low','Low','Neutral','High','Extreme High']} />
      {data?.gauge.mixed&&<p className="radar-mixed">양방향 조건 혼재 · 한 방향 점수로 요약하지 않습니다.</p>}
      {daily&&data.gauge.normalization?.bottom&&data.gauge.normalization?.top&&<p>방향별 표시: 저점 {data.gauge.normalization.bottom.conditional_score} · 고점 {data.gauge.normalization.top.conditional_score} /100 · {data.session.slice(0,4)}년 학습 기준</p>}
      <p className="radar-main-caption">Extreme은 표시된 기준일에 필터·컨트롤러까지 통과한 신규 모델 신호입니다. 오래된 기준일의 신호는 오늘 신호가 아닙니다.</p>
    </section>
    <div className="radar-directions">{['bottom','top'].map(side=>{
      const threshold=data?.native_details?.[side]?.threshold,position=thresholdPosition(data?.scores[side],threshold);
      return <section className="radar-direction-card" key={side}>
        <div className="radar-direction-heading"><h2>{side==='bottom'?'저점':'고점'} 신호</h2><span className={data?.events[side]?'radar-issued':''}>{observation?'미계산':data?(data.events[side]?(stale?'과거 기준일 신호':'기준일 신규 신호'):'신규 없음'):'확인 대기'}</span></div>
        <div className="radar-native-values"><strong>{number(data?.scores[side])}</strong><span>문턱 <b>{number(threshold)}</b></span></div>
        <GaugeTrack position={position?.score??null} threshold={position?.threshold??null} label={(side==='bottom'?'저점':'고점')+' 원점수와 q90 · 확률 아님'} labels={['0','0.25','0.5','0.75','1']} />
        <p>{position?(position.above?'문턱 이상':'문턱 미만')+' · 문턱과 차이 '+(position.delta>=0?'+':'')+number(position.delta):'임계 위치 확인 대기'}</p>
        {daily&&<p>{data.events[side]?'원점수 · 확인 필터 · 컨트롤러 통과':(data.native_details[side].block_reasons.map(reason=>REASONS[reason]||reason).join(' · ')||'현재 신규 조건 미충족')}</p>}
        {daily&&side==='bottom'&&<p>CNN 저점 확인 {number(data.native_details.bottom.cnn_bottom_score)} / q90 {number(data.native_details.bottom.cnn_bottom_q90)}</p>}
        <p className="radar-active-state">기준일 현재 최근 신호 10세션 상태 <b>{observation?'미계산':data?(data.active[side]?'활성':'비활성'):'—'}</b></p>
      </section>;
    })}</div>
    <details className="radar-explanation radar-observation-details"><summary>관찰 수신·갱신 시각과 출처 확인</summary><ObservationStatus delivery={data} /></details>
    <section className="radar-card-section"><div className="radar-section-heading"><h2>자체 모델 입력</h2><p>입력 위치는 신규 경보가 아닙니다.</p></div>
      <div className="radar-card-grid">{cards.model.map(card=><GaugeCard key={card.key} card={card}/>)}</div>
    </section>
    <section className="radar-card-section"><div className="radar-section-heading"><h2>시장 원수치 · 참고 지표</h2><p>F&G 원수치 · VIX 원수치 · RSI 참고 표시</p></div>
      <div className="radar-card-grid">{cards.reference.map(card=><GaugeCard key={card.key} card={card}/>)}</div>
    </section>
    <details className="radar-explanation"><summary>점수 해석과 자료 기준</summary>
      <p>상승 확률이나 안전한 매수 확률이 아닙니다. 특정 고정 CNN 역사 자료에서는 6/8 포착·오경보 10회, 다른 버전에서는 5/8·10회였습니다. 회고 결과이며 실운영 성과나 안정적인 저점 4/4 성능이 아닙니다.</p>
      <p>원점수가 문턱 이상이어도 CNN 확인·간격·분기 제한 때문에 신규 경보가 없을 수 있습니다. 경보가 없는 날의 대표 점수는 20~79입니다. 양방향 신규 신호 또는 양쪽 원점수가 모두 각 학습 중앙값을 넘으면 혼합 상태로 표시합니다. 단일 신규 신호가 있으면 해당 Extreme과 혼재 여부를 함께 표시합니다.</p>
      <p>대표 점수는 각 방향의 학습 중앙값→q90 거리로 계산합니다. 비신호일은 강한 방향을 표시하며 양쪽을 빼거나 평균내지 않습니다. q90 이상이어도 필터·간격·분기 한도에 차단되면 20 또는 79에 머뭅니다. 신규 신호 발생·해제, 방향 전환, 연도별 기준 갱신은 점프를 만들 수 있습니다.</p>
      <p>문턱은 봉인된 연도별 학습 점수의 q90입니다. 흰 선은 현재 원점수, 황갈색 선은 문턱입니다.</p>
      <p>활성 상태는 투자 보유기간이 아닙니다. 하위 게이지는 원수치 또는 오늘을 제외한 직전 252세션 중 최소 126개 유효값에 대한 과거 순위입니다. 척도·검증된 순위가 없는 값은 위치를 추정하지 않습니다.</p>
      <p>VIX·RSI 원수치는 참고 표시이며, VIX/RV20의 로그와 CNN·RV20 과거 순위는 모델 입력입니다. 수신 시각이 확인되지 않은 자료는 실제 관측 검증 완료로 표시하지 않습니다.</p>
    </details>
    {data?.gauge.reason&&<details className="radar-explanation"><summary>모델·자료·표시 검증 정보</summary>
      <p>모델 버전: {data.model_version}</p><p>표시 버전: {data.gauge.presentation_version}</p>
      <p>자료 상태: {data.gauge.data_status} · 표시 사유: {data.gauge.reason}</p><p>기준 버전: {data.gauge.reference_version}</p>
      {daily&&<><p>수신·계산 마감: {kstTime(data.timing.deadline_utc)} · {data.timing.eligible?'마감 충족':REASONS[data.timing.reason]||data.timing.reason}</p><p>컨트롤러 초기 이력은 고정 연구 재현입니다. 과거 실제 수신·발행 이력으로 주장하지 않습니다.</p></>}
      {['bottom','top'].map(side=><p key={side}>{side==='bottom'?'저점':'고점'} 확인 거부: {observation?'미계산':typeof data.native_details?.[side]?.vetoed==='boolean'?(data.native_details[side].vetoed?'예':'아니오'):'미확인'} · 입력 사유: {data.native_details?.[side]?.availability_reason||'—'}</p>)}
    </details>}
  </section>;
}
