import { kstTime } from './observation-status.js';

export const formatRadarNumber = (value, digits=3) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('ko-KR', {maximumFractionDigits:digits}) : '—';

const INPUT_COPY = {
  cnn_score: ['공포·탐욕', 'CNN 원값 · 0 공포 → 100 탐욕'],
  vix: ['VIX', '높을수록 예상하는 가격 흔들림이 큽니다.'],
  rsi14: ['RSI (14일)', '참고 지표 · 모델 점수에 미반영'],
  cnn_rank: ['공포·탐욕의 과거 위치', '오늘의 CNN 공포·탐욕이 과거에 비해 어느 쪽인지 봅니다.',
    '평소보다 공포 쪽에 가까움', '평소보다 탐욕 쪽에 가까움'],
  return20_risk: ['최근 20일 가격 흐름', 'SPY의 20일 가격 변화를 평소 움직임 크기로 나눈 값입니다.',
    '하락 쪽 · 음수면 20일 전보다 하락', '상승 쪽 · 양수면 20일 전보다 상승',
    '0은 가격 변화 없음. 절댓값이 클수록 변동성에 비해 큰 움직임입니다.'],
  trend200_risk: ['장기 추세와의 거리', 'SPY가 200일 평균 가격에서 얼마나 떨어져 있는지 봅니다.',
    '평균선 아래쪽 · 음수면 평균 가격 미만', '평균선 위쪽 · 양수면 평균 가격 초과',
    '0은 평균선과 같음. 변동성으로 조정해 서로 다른 시기의 거리를 비교합니다.'],
  RV20_rank: ['실제 변동성의 과거 위치', '최근 20일 동안 가격이 흔들린 정도를 과거와 비교합니다.',
    '가격 움직임이 평소보다 작음', '가격 움직임이 평소보다 큼',
    '높아도 상승인지 하락인지는 알 수 없습니다. 움직임의 크기를 나타냅니다.'],
  log_implied_realized: ['예상·실제 변동성 비교', 'VIX의 예상 변동성을 최근 실제 변동성과 비교한 값입니다.',
    '실제 대비 예상 변동성이 낮아짐', '실제 대비 예상 변동성이 높아짐',
    '0이면 둘이 같고, 양수면 예상이 더 큽니다. 비율에 로그를 취한 값이며 하락 확률은 아닙니다.'],
};

export function GaugeCard({card, model=false}) {
  const [title,description,low,high,note]=INPUT_COPY[card.key]||[card.title,card.basis];
  return <article className={model?'radar-input-row':'radar-reference-item'} data-input={card.key}>
    <div className="radar-input-label"><h3>{title}</h3><p>{description}</p></div>
    <div className="radar-card-value"><strong>{formatRadarNumber(card.value,model?3:2)}</strong><span>{card.unit}</span></div>
    {!model&&card.key==='vix'&&<p className="radar-reference-rank">과거 위치 {card.position===null?'미확인':`${formatRadarNumber(card.position,1)} /100`} · 이 순위도 모델에 사용합니다.</p>}
    {model&&<div className="radar-input-position">
      <span>{card.position===null?'과거 위치 미확인':`과거 위치 ${formatRadarNumber(card.position,1)} /100`}</span>
      <div className="radar-mini-track" role={card.position===null?undefined:'meter'} aria-label={`${title} 과거 위치 · 경보 아님`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.position??undefined}>
        {card.position!==null&&<i style={{left:`${card.position}%`}} />}
      </div>
    </div>}
    {model&&<div className="radar-input-meaning"><dl>
      <div><dt>낮을수록</dt><dd>{low}</dd></div><div><dt>높을수록</dt><dd>{high}</dd></div>
    </dl>{note&&<p>{note}</p>}</div>}
  </article>;
}

export function InputProvenance({cards}) {
  return <dl className="radar-provenance-list">{cards.map(card=><div key={card.key}>
    <dt>{card.title}</dt><dd><span>표시 전 값 {card.value??'—'} {card.unit} · {card.basis}{card.position!==null&&` · 위치 ${formatRadarNumber(card.position,6)} /100`}</span>
      <span>{card.metadata.source} · 기준일 {card.metadata.source_date||'미확인'} · 수신 {kstTime(card.metadata.received_at_utc)}</span></dd>
  </div>)}</dl>;
}
