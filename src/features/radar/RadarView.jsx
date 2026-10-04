import { ChevronRight, TriangleAlert, BellOff } from 'lucide-react';
import { REASONS } from './signal-contract.js';
import { radarPresentation } from './radar-presentation.js';
import { inputGaugeCards, thresholdPosition } from './gauge-model.js';
import { GaugeCard, InputProvenance, formatRadarNumber as number } from './GaugeCard.jsx';
import { RadarUpdate } from './RadarSummary.jsx';
import { MarketGauge } from './MarketGauge.jsx';
import { ObservationStatus } from './ObservationStatus.jsx';
import { kstTime } from './observation-status.js';
import './radar.css';

const BANDS = [['저점 경보','0–19'],['냉각 구간','20–39'],['중립','40–59'],['과열 구간','60–79'],['고점 경보','80–100']];
const BLOCK_COPY = {
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
  const calculated=!unavailable&&data?.operating_status==='DAILY_MODEL_COMPUTED'&&data.controller_evaluated===true&&Boolean(detail);
  const event=data?.events?.[side]===true;
  const operatingBlocks=(detail?.block_reasons||[]).filter(reason=>!['BELOW_Q90','CNN_CONFIRMATION'].includes(reason));
  const cnnKnown=Number.isFinite(detail?.cnn_bottom_score)&&Number.isFinite(detail?.cnn_bottom_q90);
  const checks=[['모델 기준',!position?'미확인':position.above?'충족':'미달']];
  checks.push(['공포 지표',side==='top'?'적용 안 함':!calculated||!cnnKnown?'미확인':detail.cnn_bottom_score>=detail.cnn_bottom_q90?'충족':'미달']);
  checks.push(['경보 제한',!calculated?'미계산':operatingBlocks.length?'보류':'없음']);
  const reasons=operatingBlocks.filter(reason=>reason!=='LEGACY_OBSERVATION_ONLY');
  const liveAlert=event&&!stale;
  return <section className={`radar-direction-card${liveAlert?' is-issued':''}`} aria-label={`${title} 경보 조건`}>
    <header className="radar-direction-heading"><h3>{title} 경보</h3></header>
    <div className={`radar-alert-outcome${liveAlert?' is-issued':''}`} role={liveAlert?'alert':undefined}>
      {event?<TriangleAlert size={22} aria-hidden="true"/>:calculated?<BellOff size={20} aria-hidden="true"/>:null}
      <strong>{unavailable?'계산 불가':!calculated?'미계산':event?(stale?'과거 기준일 발생':'경보 발생'):'경보 없음'}</strong>
    </div>
    {position&&<figure className="radar-threshold-chart">
      <figcaption><span>원점수 <b>{number(data.scores[side],3)}</b></span><span>경보 기준 <b>{number(detail.threshold,3)}</b></span></figcaption>
      <div className="radar-threshold-track" role="meter" aria-label={`${title} 원점수와 경보 기준`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={data.scores[side]} aria-valuetext={`원점수 ${number(data.scores[side],6)}, 경보 기준 ${number(detail.threshold,6)}, ${position.above?'기준 충족':'기준 미달'}`}>
        <span className="radar-threshold-fill" style={{width:`${position.score}%`}}/>
        <span className="radar-threshold-marker" style={{left:`${position.threshold}%`}}/>
      </div>
      <div className="radar-threshold-scale" aria-hidden="true"><span>0</span><span>기준선 이상이면 경보 후보</span><span>1</span></div>
    </figure>}
    <dl className="radar-checks">{checks.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {reasons.length>0&&<p className="radar-condition-note">{reasons.map(reason=>BLOCK_COPY[reason]||REASONS[reason]||reason).join(' ')}</p>}
  </section>;
}

export function RadarView({delivery=null}) {
  const {data,unavailable,observation,conflict,stale,failed,level,headline,eventLabel,notice}=radarPresentation(delivery);
  const cards=inputGaugeCards(data),daily=data?.operating_status==='DAILY_MODEL_COMPUTED';
  return <section className="secondary-view radar-view">
    <h1 className="sr-only">시장 신호 (Beta)</h1>
    <section className="radar-gauge" aria-labelledby="radar-composite-title">
      <div className="radar-score-meta"><h2 id="radar-composite-title">시장 전환 지수 (Beta)</h2><RadarUpdate data={data} delayed={stale||failed}/></div>
      <div className="radar-hero-content"><MarketGauge score={data?.gauge.score??null} level={unavailable?'계산 불가':level==='CONFLICT'?'단일 점수 없음':level}/>
        <div className="radar-reading"><h3>{headline}</h3>
          {(unavailable||conflict||level==='CONFLICT'||observation)&&<p>{unavailable?(data?'계산 불가 · 필수 입력 결측':'유효한 자료 미확인'):conflict?'양쪽 경보가 동시에 발생해 단일 점수를 표시하지 않습니다.':observation?'점수만 계산한 자료이며 경보는 미계산입니다.':'최신 자료를 확인해 주세요.'}</p>}
          <dl className="radar-event-summary"><dd>{eventLabel}</dd></dl>
        </div>
      </div>
      <div className="radar-band-legend" aria-label="점수 구간">{BANDS.map(([label,range],index)=><span key={label} className={Number.isInteger(data?.gauge.score)&&Math.min(4,Math.floor(data.gauge.score/20))===index?'is-current':''}><b>{label}</b><small>{range}</small></span>)}</div>
      {data?.gauge.mixed_strength===1&&!conflict&&<p className="radar-mixed">양방향 조건 강함</p>}
    </section>

    <section className="radar-section" aria-labelledby="radar-conditions-title">
      <div className="radar-section-heading"><h2 id="radar-conditions-title">저점·고점 경보</h2></div>
      <div className="radar-directions">{['bottom','top'].map(side=><DirectionSignal key={side} side={side} data={data} stale={stale||failed}/>)}</div>
      <Disclosure title="상세 조건·이전 경보">
        <p>여기의 방향별 모델 점수는 위의 대표 0–100점과 다른 원점수입니다. 저점·고점 모델 모두 원점수가 각자의 기준 이상이어야 후보가 됩니다. 저점 원점수가 높아질수록 대표 점수는 낮은 쪽으로 움직입니다.</p>
        <p>q90는 해당 연도 학습 점수의 90분위 기준입니다. 원점수 0.9나 CNN 원값 90이 아닙니다. 원점수 기준, 저점 CNN 확인, 20거래일 간격·분기별 원신호 2회 한도·결측 복귀·수신 마감을 모두 통과해야 신규 경보입니다.</p>
        <p>최근 신호 유지는 신규 발생과 다릅니다. 기준일의 10세션 상태이며 투자 보유기간을 뜻하지 않습니다.</p>
        <dl className="radar-provenance-list">{['bottom','top'].map(side=><div key={side}><dt>{side==='bottom'?'저점':'고점'} 원점수 / q90</dt><dd>{number(data?.scores?.[side],9)} / {number(data?.native_details?.[side]?.threshold,9)}<span>{data?.native_details?.[side]?.block_reasons?.map(reason=>REASONS[reason]||reason).join(' · ')||(daily&&!unavailable?'차단 없음':'차단 사유 미확인')}</span><span>이전 경보 유지(기준일 · 10거래일): {daily&&!unavailable&&typeof data?.active?.[side]==='boolean'?(data.active[side]?'유지 중':'없음'):'미계산'}</span></dd></div>)}</dl>
        <p>저점 공포 지표: 현재 {number(data?.native_details?.bottom?.cnn_bottom_score,9)} / 기준 {number(data?.native_details?.bottom?.cnn_bottom_q90,9)} 이상</p>
        {daily&&data.gauge.normalization?.bottom&&data.gauge.normalization?.top&&<p>방향별 단독 표시점수: 저점 {data.gauge.normalization.bottom.conditional_score} · 고점 {data.gauge.normalization.top.conditional_score} /100. 대표 점수와 별개의 방향별 척도입니다.</p>}
      </Disclosure>
    </section>

    <section className="radar-section" aria-labelledby="radar-model-title">
      <div className="radar-section-heading"><h2 id="radar-model-title">구성 지표</h2></div>
      <div className="radar-input-list">{cards.model.map(card=><GaugeCard key={card.key} card={card} model/>)}</div>
      <Disclosure title="입력 원값·출처·수신 시각">
        <p>CNN·실현 변동성·VIX의 과거 순위는 모델 입력입니다. 가격 흐름·장기 추세·예상/실제 변동성 비교의 과거 위치는 읽기를 돕는 화면 전용 순위입니다. 오늘을 제외한 직전 252세션 중 최소 126개 유효값을 사용하며, 검증된 순위가 없으면 위치를 추정하지 않습니다. RSI는 모델 입력이 아닙니다.</p>
        <InputProvenance cards={[...cards.reference,...cards.model]}/>
      </Disclosure>
    </section>
    <section className="radar-section" aria-labelledby="radar-inputs-title">
      <div className="radar-section-heading"><h2 id="radar-inputs-title">보조 지표</h2></div>
      <div className="radar-reference-grid">{cards.reference.map(card=><GaugeCard key={card.key} card={card}/>)}</div>
    </section>

    <div className="radar-support">
      <Disclosure title="일일 갱신·자료 상태"><ObservationStatus delivery={data}/></Disclosure>
      <Disclosure title="점수 읽는 법과 연구 한계">
        <p>0–19 Extreme Low는 저점 경보, 20–39는 냉각 구간, 40–59 Neutral은 중간 구간, 60–79는 과열 구간, 80–100 Extreme High는 고점 경보입니다. Extreme은 기준일 신규 경보에만 대응합니다. 오래된 자료를 오늘 신호로 읽지 마세요.</p>
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
