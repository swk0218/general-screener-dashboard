const point = (score,radius) => {
  const angle=Math.PI*(1-score/100);
  return [180+radius*Math.cos(angle),166-radius*Math.sin(angle)];
};
const arc = (start,end) => {
  const a=point(start,138),b=point(end,138);
  return `M ${a[0]} ${a[1]} A 138 138 0 0 1 ${b[0]} ${b[1]}`;
};

export function MarketGauge({score=null,level='계산 불가'}) {
  const hasScore=Number.isInteger(score)&&score>=0&&score<=100;
  const band=hasScore?Math.min(4,Math.floor(score/20)):null;
  return <div className={`radar-dial${hasScore?'':' is-unavailable'}`} role={hasScore?'meter':undefined}
    aria-label={`시장 전환 종합 지표 · ${level} · 확률 아님`} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={hasScore?score:undefined} aria-valuetext={hasScore?`${score} /100 · ${level}`:undefined}>
    <svg viewBox="0 0 360 248" aria-hidden="true">
      {[0,1,2,3,4].map(i=><path key={i} d={arc(i*20+.7,(i+1)*20-.7)} className={`radar-dial-band${band===i?' is-current':''}`} />)}
      {[0,20,40,60,80,100].map(value=>{
        const a=point(value,120),b=point(value,127),text=point(value,156);
        return <g key={value}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="radar-dial-tick" />
          <text x={text[0]} y={text[1]+4} textAnchor="middle" className="radar-dial-label">{value}</text></g>;
      })}
      {hasScore&&<g className="radar-dial-needle" style={{transform:`rotate(${score*1.8-90}deg)`}}>
        <path d="M 177 166 L 180 49 L 183 166 Z"/><circle cx="180" cy="166" r="5"/>
      </g>}
      <text x="180" y="213" textAnchor="middle" className="radar-dial-number">{hasScore?score:'—'}<tspan dx="6" className="radar-dial-denominator">/100</tspan></text>
      <text x="180" y="241" textAnchor="middle" className="radar-dial-level">{level}</text>
    </svg>
    <span className="sr-only">{hasScore?`${score} /100 · ${level}`:'단일 점수 없음'}</span>
  </div>;
}
