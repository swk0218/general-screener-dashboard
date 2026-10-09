import { ChevronRight, TriangleAlert, BellOff } from 'lucide-react';
import { useRadarPresentation } from './use-radar-presentation.js';
import { inputGaugeCards, thresholdPosition } from './gauge-model.js';
import { GaugeCard, InputProvenance, formatRadarNumber as number } from './GaugeCard.jsx';
import { RadarUpdate, RadarHeadline, RadarEventLabel } from './RadarSummary.jsx';
import { MarketGauge } from './MarketGauge.jsx';
import { SeasonalityCard } from './SeasonalityCard.jsx';
import './radar.css';

const BANDS = [['저점 경보','0–19'],['냉각 구간','20–39'],['중립','40–59'],['과열 구간','60–79'],['고점 경보','80–100']];
function Disclosure({title,children}) {
  return <details className="radar-explanation"><summary>{title}<ChevronRight size={16} aria-hidden="true" /></summary><div className="radar-detail-content">{children}</div></details>;
}

function DirectionSignal({side,data,stale}) {
  const title=side==='bottom'?'저점':'고점',detail=data?.native_details?.[side];
  const unavailable=!data||data.gauge.level==='UNAVAILABLE'||stale;
  const position=unavailable?null:thresholdPosition(data?.scores?.[side],detail?.threshold);
  const calculated=!unavailable&&data?.operating_status==='DAILY_MODEL_COMPUTED'&&data.controller_evaluated===true&&Boolean(detail);
  const event=!unavailable&&data?.events?.[side]===true;
  const cnnKnown=Number.isFinite(detail?.cnn_bottom_score)&&Number.isFinite(detail?.cnn_bottom_q90);
  const checks=[['모델 기준',!position?'—':position.above?'충족':'미달']];
  if(side==='bottom')checks.push(['공포 지표',!calculated||!cnnKnown?'—':detail.cnn_bottom_score>=detail.cnn_bottom_q90?'충족':'미달']);
  const liveAlert=event&&!stale;
  return <section className={`radar-direction-card${liveAlert?' is-issued':''}`} aria-label={`${title} 경보 조건`}>
    <header className="radar-direction-heading"><h3>{title} 경보</h3></header>
    <div className={`radar-alert-outcome${liveAlert?' is-issued':''}`} role={liveAlert?'alert':undefined}>
      {event?<TriangleAlert size={22} aria-hidden="true"/>:calculated?<BellOff size={20} aria-hidden="true"/>:null}
      <strong>{unavailable||!calculated?'—':event?(stale?'기준일 경보':'경보 발생'):'경보 없음'}</strong>
    </div>
    {position&&<figure className="radar-threshold-chart">
      <figcaption><span>원점수 <b>{number(data.scores[side],3)}</b></span><span>경보 기준 <b>{number(detail.threshold,3)}</b></span></figcaption>
      <div className="radar-threshold-track" role="meter" aria-label={`${title} 원점수와 경보 기준`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={data.scores[side]} aria-valuetext={`원점수 ${number(data.scores[side],6)}, 경보 기준 ${number(detail.threshold,6)}, ${position.above?'기준 충족':'기준 미달'}`}>
        <span className="radar-threshold-fill" style={{width:`${position.score}%`}}/>
        <span className="radar-threshold-marker" style={{left:`${position.threshold}%`}}/>
      </div>
      <div className="radar-threshold-scale" aria-hidden="true"><span>0</span><span>1</span></div>
    </figure>}
    <dl className="radar-checks">{checks.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}

export function RadarView({delivery=null,seasonality=null,status=undefined}) {
  const {data,unavailable,observation,conflict,stale,failed,level,headline,eventLabel,eventKind,displayScore}=useRadarPresentation(delivery,status);
  const cards=inputGaugeCards(data),daily=data?.operating_status==='DAILY_MODEL_COMPUTED';
  return <section className="secondary-view radar-view">
    <h1 className="sr-only">시장 신호 (Beta)</h1>
    <section className="radar-gauge" aria-labelledby="radar-composite-title">
      <div className="radar-score-meta"><h2 id="radar-composite-title">시장 전환 지수 (Beta)</h2><RadarUpdate data={data}/></div>
      <div className="radar-hero-content"><MarketGauge score={displayScore} level={unavailable||stale?'계산 불가':level==='CONFLICT'?'단일 점수 없음':level}/>
        <div className="radar-reading"><h3 className="market-insight"><RadarHeadline headline={headline} alert={!stale&&Boolean(data?.events.bottom||data?.events.top)}/></h3>
          <dl className="radar-event-summary"><dd><RadarEventLabel label={eventLabel} kind={eventKind}/></dd></dl>
        </div>
      </div>
      <div className="radar-band-legend" aria-label="점수 구간">{BANDS.map(([label,range],index)=><span key={label} className={Number.isInteger(displayScore)&&Math.min(4,Math.floor(displayScore/20))===index?'is-current':''}><b>{label}</b><small>{range}</small></span>)}</div>
      {!stale&&data?.gauge.mixed_strength===1&&!conflict&&<p className="radar-mixed">양방향 조건 강함</p>}
    </section>

    <section className="radar-section" aria-labelledby="radar-conditions-title">
      <div className="radar-section-heading"><h2 id="radar-conditions-title">저점·고점 경보</h2></div>
      <div className="radar-directions">{['bottom','top'].map(side=><DirectionSignal key={side} side={side} data={data} stale={stale||failed}/>)}</div>
      <Disclosure title={stale?'기준일 결과':'신호 상세'}>
        {data&&<p>{data.session} · {number(data.gauge.score,0)} /100{data.events.bottom||data.events.top?` · ${data.events.bottom?'저점':''}${data.events.bottom&&data.events.top?'·':''}${data.events.top?'고점':''} 경보`:observation?' · 점수 전용':''}</p>}
        <dl className="radar-provenance-list">{['bottom','top'].map(side=><div key={side}><dt>{side==='bottom'?'저점':'고점'} 원점수 / q90</dt><dd>{number(data?.scores?.[side],9)} / {number(data?.native_details?.[side]?.threshold,9)}<span>이전 경보 유지 · 10거래일: {daily&&!unavailable&&typeof data?.active?.[side]==='boolean'?(data.active[side]?'유지 중':'없음'):'—'}</span></dd></div>)}</dl>
        <p>저점 공포 지표: {number(data?.native_details?.bottom?.cnn_bottom_score,9)} / 기준 {number(data?.native_details?.bottom?.cnn_bottom_q90,9)}</p>
        {daily&&data.gauge.normalization?.bottom&&data.gauge.normalization?.top&&<p>방향별 점수: 저점 {data.gauge.normalization.bottom.conditional_score} · 고점 {data.gauge.normalization.top.conditional_score} /100</p>}
        <p>이전 경보 유지는 기준일 상태이며 투자 보유기간이 아닙니다.</p>
      </Disclosure>
    </section>

    <section className="radar-section" aria-labelledby="radar-model-title">
      <div className="radar-section-heading"><h2 id="radar-model-title">구성 지표</h2></div>
      <div className="radar-input-list">{cards.model.map(card=><GaugeCard key={card.key} card={card} model/>)}</div>
      <Disclosure title="지표 원값·출처">
        <InputProvenance cards={[...cards.reference,...cards.model]}/>
        <p>점수는 확률이 아닙니다. RSI와 VIX 원값은 보조 지표입니다.</p>
      </Disclosure>
    </section>
    <section className="radar-section" aria-labelledby="radar-inputs-title">
      <div className="radar-section-heading"><h2 id="radar-inputs-title">보조 지표</h2></div>
      <div className="radar-reference-grid">{cards.reference.map(card=><GaugeCard key={card.key} card={card}/>)}</div>
      <SeasonalityCard data={seasonality}/>
    </section>
  </section>;
}
