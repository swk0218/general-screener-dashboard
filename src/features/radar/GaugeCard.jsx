import { kstTime } from './observation-status.js';

export const formatRadarNumber = (value, digits=3) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('ko-KR', {maximumFractionDigits:digits}) : '—';

const INPUT_COPY = {
  cnn_score: ['Fear & Greed Index', 'CNN 원값 · 0 공포 → 100 탐욕'],
  vix: ['VIX Index', '높을수록 예상 변동성이 큼'],
  rsi14: ['RSI (14)', '참고 지표 · 모델 점수에 미반영'],
  cnn_rank: ['Fear & Greed Index의 역사적 위치', 'CNN 공포·탐욕의 과거 대비 위치',
    '평소보다 공포 쪽에 가까움', '평소보다 탐욕 쪽에 가까움'],
  return20_risk: ['최근 20일 가격 흐름', '20일 가격 변화를 변동성으로 조정',
    '20일 전보다 하락', '20일 전보다 상승',
    '0은 가격 변화 없음. 절댓값이 클수록 변동성에 비해 큰 움직임입니다.'],
  trend200_risk: ['200일 이평선 이격도', '200일 평균 가격과의 거리를 변동성으로 조정',
    '가격이 이평선 미만', '가격이 이평선 초과',
    '0은 평균선과 같음. 변동성으로 조정해 서로 다른 시기의 거리를 비교합니다.'],
  RV20_rank: ['최근 20일 변동성의 역사적 크기', '최근 20일 가격 흔들림의 과거 대비 위치',
    '평소보다 변동성이 낮음', '평소보다 변동성이 높음',
    '움직임의 크기이며 상승·하락 방향은 아닙니다.'],
  log_implied_realized: ['예상 변동성(VIX)/실제 변동성 로그', 'VIX 예상 변동성 ÷ 실제 변동성의 로그값',
    '예상 변동성이 실제보다 낮음', '예상 변동성이 실제보다 높음',
    '0이면 둘이 같고, 양수면 예상이 더 큽니다. 비율에 로그를 취한 값이며 하락 확률은 아닙니다.'],
};

export function GaugeCard({card, model=false}) {
  const [title,,low,high]=INPUT_COPY[card.key]||[card.title,card.basis];
  const signed=['return20_risk','trend200_risk','log_implied_realized'].includes(card.key);
  const ratio=card.key==='log_implied_realized';
  const rankInput=['cnn_rank','RV20_rank'].includes(card.key);
  const value=<div className="radar-card-value"><strong>{formatRadarNumber(card.value,model?3:2)}</strong><span>{card.key==='log_implied_realized'?'로그값':signed?'변동성 조정값':card.unit}</span></div>;
  return <article className={model?'radar-input-row':'radar-reference-item'} data-input={card.key}>
    <div className="radar-input-heading"><div className="radar-input-label"><h3>{title}</h3></div>{value}</div>
    {model&&<div className="radar-input-reading">{rankInput&&<div className="radar-input-position">
      <span>{card.position===null?'과거 위치 미확인':'과거 대비 위치'}</span>
      <div className="radar-mini-track" role={card.position===null?undefined:'meter'} aria-label={`${title} 과거 위치 · 경보 아님`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.position??undefined}>
        {card.position!==null&&<i style={{left:`${card.position}%`}} />}
      </div>
      <div className="radar-input-scale" aria-hidden="true"><span>0</span><span>100</span></div>
    </div>}
    <div className="radar-input-meaning"><dl className={ratio?'is-ratio':undefined}>
      <div className={signed&&Number.isFinite(card.value)&&card.value<0?'is-current':undefined}><dt>{signed?'음수일 때':'낮을수록'}</dt><dd>{low}</dd></div>
      {ratio&&<div className={card.value===0?'is-current':undefined}><dt>0일 때</dt><dd>예상 변동성과 실제 변동성이 같음</dd></div>}
      <div className={signed&&Number.isFinite(card.value)&&card.value>0?'is-current':undefined}><dt>{signed?'양수일 때':'높을수록'}</dt><dd>{high}</dd></div>
    </dl></div></div>}
  </article>;
}

export function InputProvenance({cards}) {
  return <dl className="radar-provenance-list">{cards.map(card=><div key={card.key}>
    <dt>{card.title}</dt><dd>{INPUT_COPY[card.key]?.[4]&&<span>{INPUT_COPY[card.key][4]}</span>}<span>표시 전 값 {card.value??'—'} {card.unit} · {card.basis}{card.position!==null&&` · 위치 ${formatRadarNumber(card.position,6)} /100`}</span>
      <span>{card.metadata.source} · 기준일 {card.metadata.source_date||'미확인'} · 수신 {kstTime(card.metadata.received_at_utc)}</span></dd>
  </div>)}</dl>;
}
