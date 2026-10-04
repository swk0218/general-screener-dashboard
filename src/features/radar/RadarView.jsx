import { ChevronRight } from 'lucide-react';
import { REASONS } from './signal-contract.js';
import { validateRadarDelivery } from './radar-contract.js';
import { inputGaugeCards, thresholdPosition } from './gauge-model.js';
import { GaugeCard, InputProvenance, formatRadarNumber as number } from './GaugeCard.jsx';
import { MarketGauge } from './MarketGauge.jsx';
import { ObservationStatus } from './ObservationStatus.jsx';
import { kstTime } from './observation-status.js';
import './radar.css';

const LEVEL_COPY = {
  'Extreme Low':'저점 경보가 발생했습니다.', Low:'저점 방향으로 기울어 있습니다.',
  Neutral:'두 방향 사이에 있습니다.', High:'고점 방향으로 기울어 있습니다.',
  'Extreme High':'고점 경보가 발생했습니다.',
};
const BANDS = [['저점 경보','0–19'],['저점 쪽','20–39'],['중립','40–59'],['고점 쪽','60–79'],['고점 경보','80–100']];
const BLOCK_COPY = {
  LEGACY_OBSERVATION_ONLY:'당시 실시간 경보를 계산하지 않은 자료입니다. 새 경보로 발행하지 않습니다.',
  COOLDOWN:'앞선 신호와의 20거래일 간격을 기다리고 있습니다.',
  QUARTER_LIMIT:'이번 분기의 신호 횟수 한도에 도달했습니다.',
  GAP_RECOVERY:'자료가 빠진 뒤 처음 복귀한 날이라 발행을 보류합니다.',
  LATE_RECEIPT_OR_DECISION:'자료 수신 또는 계산이 다음 개장 전 마감을 넘었습니다.',
};

function Disclosure({title,children}) {
  return <details className="radar-explanation"><summary>{title}<ChevronRight size={16} aria-hidden="true" /></summary><div className="radar-detail-content">{children}</div></details>;
}

function DirectionSignal({side,data,stale}) {
  const title=side==='bottom'?'저점':'고점',detail=data?.native_details?.[side];
  const position=thresholdPosition(data?.scores?.[side],detail?.threshold);
  const unavailable=!data||data.gauge.level==='UNAVAILABLE';
  const observation=data?.operating_status==='OBSERVATION_COMPUTED';
  const calculated=!unavailable&&!observation&&data.controller_evaluated===true&&Boolean(detail);
  const event=data?.events?.[side]===true;
  const blocks=detail?.block_reasons||[];
  const operatingBlocks=blocks.filter(reason=>!['BELOW_Q90','CNN_CONFIRMATION'].includes(reason));
  const cnnKnown=Number.isFinite(detail?.cnn_bottom_score)&&Number.isFinite(detail?.cnn_bottom_q90);
  const active=calculated&&typeof data?.active?.[side]==='boolean'?(data.active[side]?'유지 중':'없음'):'미계산';
  return <section className="radar-direction-card" aria-label={`${title} 경보 조건`}>
    <header className="radar-direction-heading"><h3>{title} 경보</h3>
      <span className={event?'radar-issued':''}>{unavailable?'계산 불가':observation?'미계산':event?(stale?'과거 기준일 발생':'기준일 발생'):'신규 없음'}</span>
    </header>
    <p className="radar-direction-meaning">{side==='bottom'?'시장이 바닥에 가까울 가능성을 살피는 신호':'시장이 꼭대기에 가까울 가능성을 살피는 신호'}</p>
    <dl className="radar-condition-list">
      <div><dt><span>01</span> 모델 기준</dt><dd><strong>{position?(position.above?'경보 후보':'아직 후보 아님'):'미확인'}</strong><span>현재 {number(data?.scores?.[side])} <small>· 기준 {number(detail?.threshold)} 이상</small></span></dd></div>
      {side==='bottom'&&<div><dt><span>02</span> 공포 지표 확인</dt><dd><strong>{!calculated||!cnnKnown?'미확인':detail.cnn_bottom_score>=detail.cnn_bottom_q90?'추가 확인 통과':'추가 확인 부족'}</strong><span>현재 {number(detail?.cnn_bottom_score)} <small>· 기준 {number(detail?.cnn_bottom_q90)} 이상</small></span></dd></div>}
      <div><dt><span>{side==='bottom'?'03':'02'}</span> 발행 가능 여부</dt><dd><strong>{!calculated?'미계산':operatingBlocks.length?'발행 보류':'발행 제한 없음'}</strong><span className="radar-condition-hint">신호 간격 · 횟수 · 데이터 시각</span></dd></div>
    </dl>
    {unavailable?<p className="radar-condition-note">{data?'계산 불가 · 필수 입력 결측':'유효한 자료 미확인'}</p>:observation?<p className="radar-condition-note">관찰 점수만 계산한 자료입니다.</p>:
      operatingBlocks.length>0?<p className="radar-condition-note">{operatingBlocks.map(reason=>BLOCK_COPY[reason]||REASONS[reason]||reason).join(' ')}</p>:
      event?<p className="radar-condition-note">원점수·필터·발행 조건을 모두 통과했습니다.</p>:null}
    <p className="radar-active-state"><span>이전 경보 유지 <small>기준일 · 10거래일</small></span><b>{active}</b></p>
  </section>;
}

export function RadarView({delivery=null}) {
  let data=null;
  try {if(delivery)data=validateRadarDelivery(delivery);} catch {/* Optional surface stays fail closed. */}
  const cards=inputGaugeCards(data),daily=data?.operating_status==='DAILY_MODEL_COMPUTED';
  const observation=data?.operating_status==='OBSERVATION_COMPUTED',dated=daily||observation;
  const unavailable=!data||data.gauge.level==='UNAVAILABLE';
  const stale=['DATED_STALE_OBSERVATION','CACHED_STALE'].includes(data?.gauge.data_status);
  const conflict=data?.events.bottom&&data?.events.top;
  const failed=data?.observation?.collection_status==='FAILED_RETAINED_DATED';
  const level=data?.gauge.level;
  const headline=conflict?'양방향 경보 충돌':unavailable?'점수를 계산할 수 없습니다.':level==='CONFLICT'?'이전 혼합 표시 자료':LEVEL_COPY[level];
  const eventLabel=unavailable?'미계산':observation?'미계산':conflict?'저점·고점 동시 발생':data.events.bottom?'저점 경보':data.events.top?'고점 경보':'없음';
  return <section className="secondary-view radar-view">
    <header className="radar-page-header"><div><h1>시장 전환 신호</h1><p>S&P 500 · 저점과 고점을 살피는 연구 모델</p></div><span className="radar-beta-label">BETA · 실운영 성과 미검증</span></header>
    <section className="radar-gauge" aria-labelledby="radar-composite-title">
      <div className="radar-score-meta"><h2 id="radar-composite-title">시장 전환 종합 지표</h2><span>기준일 <time dateTime={data?.session}>{data?.session||'확인 대기'}</time></span></div>
      {(stale||failed)&&<p className="radar-data-notice" role="status"><strong>{failed?'갱신 실패 · 이전 점수 유지':'이전 거래일 점수'}</strong>
        {dated&&<span>{data.observation.latest_session_input_missing?.length
          ?`${data.observation.expected_session} 자료 ${data.observation.latest_session_input_missing.join(' · ')} 미확보`
          :'갱신을 완료하지 못해 이전 기준일의 점수를 유지합니다.'} · 오늘의 신규 신호가 아닙니다.</span>}</p>}
      <div className="radar-hero-content"><MarketGauge score={data?.gauge.score??null} level={unavailable?'계산 불가':level==='CONFLICT'?'단일 점수 없음':level}/>
        <div className="radar-reading"><h3>{headline}</h3><p>{unavailable?'유효한 공통 입력이 갖춰지면 점수를 표시합니다.':conflict?'저점과 고점의 최종 경보가 함께 발생해 대표 숫자를 표시하지 않습니다.':level==='CONFLICT'?'과거 버전의 혼합 표시입니다. 최신 자료를 확인해 주세요.':observation?'운영 경보는 계산하지 않은 관찰 점수입니다.':data.events.bottom||data.events.top?'표시된 기준일에 모든 경보 조건을 통과했습니다.':'최종 경보 조건은 아직 충족하지 않았습니다.'}</p>
          <dl className="radar-event-summary"><dt>기준일 신규 신호</dt><dd>{eventLabel}</dd></dl>
        </div>
      </div>
      <div className="radar-band-legend" aria-label="점수 구간">{BANDS.map(([label,range],index)=><span key={label} className={Number.isInteger(data?.gauge.score)&&Math.min(4,Math.floor(data.gauge.score/20))===index?'is-current':''}><b>{label}</b><small>{range}</small></span>)}</div>
      <div className="radar-score-foot"><p>낮을수록 저점, 높을수록 고점 방향 · 적중 확률이 아닙니다.</p>
        {data?.gauge.mixed&&<p className="radar-mixed"><strong>혼합 성향{Number.isFinite(data.gauge.mixed_strength)?` ${Math.round(data.gauge.mixed_strength*100)} /100`:''}</strong><span>{conflict?'양방향 신규 경보 동시 발생':data.gauge.mixed_strength===1?'양쪽 모델 모두 경보 후보 수준 · 조건이 약한 중립은 아닙니다.':'양쪽 성향이 함께 있으나, 양방향 경보 충돌은 아닙니다.'}</span></p>}
      </div>
    </section>

    <section className="radar-section" aria-labelledby="radar-conditions-title">
      <div className="radar-section-heading"><h2 id="radar-conditions-title">경보까지 남은 조건</h2><p>기준을 넘어도 바로 경보는 아닙니다.</p></div>
      <p className="radar-section-intro">모델 기준을 넘으면 <strong>경보 후보</strong>가 됩니다. 아래 확인과 발행 조건까지 모두 통과해야 <strong>최종 경보</strong>가 됩니다.</p>
      <div className="radar-directions">{['bottom','top'].map(side=><DirectionSignal key={side} side={side} data={data} stale={stale}/>)}</div>
      <Disclosure title="경보 기준과 상세 계산">
        <p>여기의 방향별 모델 점수는 위의 대표 0–100점과 다른 원점수입니다. 저점·고점 모델 모두 원점수가 각자의 기준 이상이어야 후보가 됩니다. 저점 원점수가 높아질수록 대표 점수는 낮은 쪽으로 움직입니다.</p>
        <p>q90는 해당 연도 학습 점수의 90분위 기준입니다. 원점수 0.9나 CNN 원값 90이 아닙니다. 원점수 기준, 저점 CNN 확인, 20거래일 간격·분기별 원신호 2회 한도·결측 복귀·수신 마감을 모두 통과해야 신규 경보입니다.</p>
        <p>최근 신호 유지는 신규 발생과 다릅니다. 기준일의 10세션 상태이며 투자 보유기간을 뜻하지 않습니다.</p>
        <dl className="radar-provenance-list">{['bottom','top'].map(side=><div key={side}><dt>{side==='bottom'?'저점':'고점'} 원점수 / q90</dt><dd>{number(data?.scores?.[side],9)} / {number(data?.native_details?.[side]?.threshold,9)}<span>{data?.native_details?.[side]?.block_reasons?.map(reason=>REASONS[reason]||reason).join(' · ')||'차단 사유 미확인'}</span></dd></div>)}</dl>
        {daily&&data.gauge.normalization?.bottom&&data.gauge.normalization?.top&&<p>방향별 단독 표시점수: 저점 {data.gauge.normalization.bottom.conditional_score} · 고점 {data.gauge.normalization.top.conditional_score} /100. 대표 점수와 별개의 방향별 척도입니다.</p>}
      </Disclosure>
    </section>

    <section className="radar-section" aria-labelledby="radar-inputs-title">
      <div className="radar-section-heading"><h2 id="radar-inputs-title">시장 보조 지표</h2><p>종합 지표와 같은 기준일의 원값 · 참고 수치</p></div>
      <div className="radar-reference-grid">{cards.reference.map(card=><GaugeCard key={card.key} card={card}/>)}</div>
    </section>
    <section className="radar-section" aria-labelledby="radar-model-title">
      <div className="radar-section-heading"><h2 id="radar-model-title">시장 전환 개별 지표</h2><p>모델이 읽는 5가지 시장 상태</p></div>
      <p className="radar-input-intro">SPY 가격·CNN 공포·탐욕·VIX를 가공한 지표입니다. 높고 낮음은 각각 아래의 시장 상태를 뜻하며, 하나만으로 저점·고점 경보를 판단하지 않습니다.</p>
      <p className="radar-input-rank-note">과거 위치 0은 낮은 쪽, 100은 높은 쪽입니다. 오늘을 제외한 직전 252거래일과 비교합니다.</p>
      <div className="radar-input-list">{cards.model.map(card=><GaugeCard key={card.key} card={card} model/>)}</div>
      <Disclosure title="입력 원값·출처·수신 시각">
        <p>CNN·실현 변동성·VIX의 과거 순위는 모델 입력입니다. 가격 흐름·장기 추세·예상/실제 변동성 비교의 과거 위치는 읽기를 돕는 화면 전용 순위입니다. 오늘을 제외한 직전 252세션 중 최소 126개 유효값을 사용하며, 검증된 순위가 없으면 위치를 추정하지 않습니다. RSI는 모델 입력이 아닙니다.</p>
        <InputProvenance cards={[...cards.reference,...cards.model]}/>
      </Disclosure>
    </section>

    <div className="radar-support">
      <Disclosure title="일일 갱신·자료 상태"><ObservationStatus delivery={data}/></Disclosure>
      <Disclosure title="점수 읽는 법과 연구 한계">
        <p>0–19 Extreme Low는 저점 경보, 20–39 Low는 저점 방향, 40–59 Neutral은 중간 구간, 60–79 High는 고점 방향, 80–100 Extreme High는 고점 경보입니다. Extreme은 기준일 신규 경보에만 대응합니다. 오래된 자료를 오늘 신호로 읽지 마세요.</p>
        <p>대표 점수는 각 방향의 학습 중앙값→q90 거리로 계산합니다. 비신호일은 50 + 30 × (고점 접근도 − 저점 접근도)를 반올림하고 20~79에 둡니다. 접근도는 중앙값에서 0, q90 이상에서 1입니다. 양쪽 성향이 강해도 대표 숫자를 유지하며, 두 최종 경보가 동시에 발생한 경우만 비웁니다.</p>
        <p>혼합 강도는 두 접근도 중 작은 값입니다. 대표 점수가 중간이어도 양쪽 조건이 약하다는 뜻은 아닙니다. 단독 방향의 경보 시작·해제는 최대21점(고점79↔100, 저점20↔0은20점), 강한 혼합 상태에서는 최대50점 차이를 만들 수 있습니다. 연도별 기준 갱신도 점수를 바꿀 수 있습니다.</p>
        <p>점수는 상승·하락 또는 안전한 매수의 확률이 아닙니다. 특정 고정 CNN 역사 자료에서는 6/8 포착·오경보 10회, 다른 버전에서는 5/8·10회였습니다. 회고 결과이며 실운영 성과나 안정적인 저점 4/4 성능이 아닙니다.</p>
      </Disclosure>
      {data?.gauge.reason&&<Disclosure title="모델·자료 검증 정보">
        <dl className="radar-provenance-list"><div><dt>모델 버전</dt><dd>{data.model_version}</dd></div><div><dt>표시 버전</dt><dd>{data.gauge.presentation_version}</dd></div><div><dt>자료 상태 / 표시 사유</dt><dd>{data.gauge.data_status} / {data.gauge.reason}</dd></div><div><dt>기준 버전</dt><dd>{data.gauge.reference_version}</dd></div></dl>
        {daily&&<><p>수신·계산 마감: {kstTime(data.timing.deadline_utc)} · {data.timing.eligible?'마감 충족':REASONS[data.timing.reason]||data.timing.reason}</p><p>컨트롤러 초기 이력은 고정 연구 재현입니다. 과거 실제 수신·발행 이력으로 주장하지 않습니다.</p></>}
      </Disclosure>}
    </div>
  </section>;
}
