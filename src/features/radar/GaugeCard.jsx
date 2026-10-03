const format=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ko-KR',{maximumFractionDigits:3}):'—';

export function GaugeTrack({position=null,threshold=null,label,labels=['0','25','50','75','100'],banded=false}) {
  return <><div className={`radar-track${position===null?' is-unavailable':''}`} role={position===null?undefined:'meter'}
    aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={position??undefined}>
    {(banded?[0,20,40,60,80,100]:[0,25,50,75,100]).map(tick=><span className="radar-tick" key={tick} style={{left:`${tick}%`}} />)}
    {threshold!==null&&<span className="radar-threshold" style={{left:`${threshold}%`}} aria-hidden="true" />}
    {position!==null&&<span className="radar-pointer" style={{left:`${position}%`}} aria-hidden="true" />}
  </div><div className={'radar-scale'+(banded?' is-banded':'')}>{labels.map((label,index)=><span key={index}>{label}</span>)}</div></>;
}

export function GaugeCard({card}) {
  const received=card.metadata.received_at_utc;
  return <article className="radar-input-card" data-input={card.key}>
    <h3>{card.title}</h3>
    <div className="radar-card-value"><strong>{format(card.value)}</strong><span>{card.unit}</span></div>
    <GaugeTrack position={card.position} labels={card.position===null?['','','—','','']:undefined} label={`${card.title} 입력 위치 · 신규 경보 아님`} />
    {['vix','return20_risk','trend200_risk','log_implied_realized'].includes(card.key)&&card.position!==null&&<p className="radar-card-percentile">과거 백분위 {format(card.position)}%</p>}
    <p className="radar-card-basis">{card.basis}</p>
    {card.position===null&&<p className="radar-card-unavailable">위치 표시 없음</p>}
    <p className="radar-card-source">{card.metadata.source} · {card.metadata.source_date||'날짜 미확인'}</p>
    <p className="radar-card-received">{received?`수신 ${received}`:'수신 시각 미검증'}</p>
  </article>;
}
