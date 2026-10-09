export const formatRadarNumber = (value, digits=3) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('ko-KR', {maximumFractionDigits:digits}) : '—';

const INPUT_TITLES = {
  cnn_score: 'Fear & Greed Index',
  vix: 'VIX Index',
  rsi14: 'RSI (14)',
  cnn_rank: 'Fear & Greed Index의 역사적 위치',
  return20_risk: '최근 20일 가격 흐름',
  trend200_risk: '200일 이평선 이격도',
  RV20_rank: '최근 20일 변동성의 역사적 크기',
  log_implied_realized: '예상 변동성(VIX)/실제 변동성 로그',
};

export function GaugeCard({card, model=false}) {
  const title=INPUT_TITLES[card.key]||card.title;
  const signed=['return20_risk','trend200_risk','log_implied_realized'].includes(card.key);
  const rankInput=['cnn_rank','RV20_rank'].includes(card.key);
  const value=<div className="radar-card-value"><strong>{formatRadarNumber(card.value,model?3:2)}</strong><span>{card.key==='log_implied_realized'?'로그값':signed?'변동성 조정값':card.unit}</span></div>;
  return <article className={model?'radar-input-row':'radar-reference-item'} data-input={card.key}>
    <div className="radar-input-heading"><div className="radar-input-label"><h3>{title}</h3></div>{value}</div>
    {model&&rankInput&&card.position!==null&&<div className="radar-input-reading"><div className="radar-input-position">
      <span>과거 대비 위치</span>
      <div className="radar-mini-track" role={card.position===null?undefined:'meter'} aria-label={`${title} 과거 위치 · 경보 아님`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={card.position??undefined}>
        {card.position!==null&&<i style={{left:`${card.position}%`}} />}
      </div>
      <div className="radar-input-scale" aria-hidden="true"><span>0</span><span>100</span></div>
    </div></div>}
  </article>;
}

export function InputProvenance({cards}) {
  return <dl className="radar-provenance-list">{cards.map(card=><div key={card.key}>
    <dt>{card.title}</dt><dd><span>표시 전 값 {card.value??'—'} {card.unit} · {card.basis}{card.position!==null&&` · 위치 ${formatRadarNumber(card.position,6)} /100`}</span>
      <span>{card.metadata.source} · 기준일 {card.metadata.source_date||'—'}</span></dd>
  </div>)}</dl>;
}
