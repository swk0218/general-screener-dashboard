import { MODEL_INPUTS, REFERENCE_INPUTS, validateRadarDelivery } from './radar-contract.js';
import './radar.css';

const number = value => typeof value==='number' && Number.isFinite(value) ? value.toLocaleString('ko-KR',{maximumFractionDigits:3}) : '—';

export function RadarView({ delivery=null }) {
  let data=null;
  try { if (delivery) data=validateRadarDelivery(delivery); } catch { /* Separate optional surface fails closed. */ }
  return <section className="secondary-view radar-view">
    <header><p>MARKET RADAR</p><h1>시장 전환 신호</h1><p>낮을수록 저점, 높을수록 고점 방향의 신호입니다. 상승 확률이나 안전한 매수 확률이 아닙니다.</p></header>
    <section className="radar-gauge" aria-label="시장 전환 게이지">
      <strong>{data?.gauge.score ?? '—'}</strong><span>{data?.gauge.level==='CONFLICT'?'상충 상태':data?.gauge.level ?? '자료 확인 중'}</span>
      <div className="radar-track" role={Number.isInteger(data?.gauge.score)?'meter':undefined} aria-label="확률이 아닌 시장 전환 방향 표시 점수" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data?.gauge.score ?? undefined}>
        {Number.isInteger(data?.gauge.score) && <span className="radar-pointer" style={{left:`${data.gauge.score}%`}} aria-hidden="true" />}
      </div>
      <div className="radar-scale">{['Extreme Low','Low','Neutral','High','Extreme High'].map(label=><span key={label}>{label}</span>)}</div>
      {data?.gauge.mixed && <p>신호 혼재 — 저점·고점 신호를 함께 확인하세요.</p>}
      <p>{data ? `${data.session} 기준 · ${data.evidence_ready?'입력 검증 완료':'실제 관측 검증 대기'}` : '검증된 암호화 Radar 자료가 연결되면 표시합니다.'}</p>
    </section>
    <div className="radar-directions">{['bottom','top'].map(side=><section key={side}><h2>{side==='bottom'?'저점':'고점'} 신호</h2><p>모델 점수 {number(data?.scores[side])}</p><p>당일 신규 경보: {data ? (data.events[side]?'발신':'없음'):'—'}</p><p>기존 10세션 활성 상태: {data ? (data.active[side]?'활성':'비활성'):'—'}</p></section>)}</div>
    <p>활성 상태는 투자 보유기간을 뜻하지 않습니다. 과거 연구의 6/8 포착·오경보 10회는 미래 적중 확률이 아닙니다.</p>
    <details><summary>점수 해석과 자료 기준</summary><p>Extreme Low와 Extreme High는 당일 실제 신규 경보를 뜻합니다. 경보가 없는 날은 20~79에 표시하고, 양방향 경보가 함께 발신되면 숫자 대신 상충 상태를 표시합니다.</p><p>검증되지 않은 자료나 순위 참조가 없으면 점수를 표시하지 않습니다.</p></details>
    <section><h2>자체 모델 입력</h2><dl className="radar-inputs">{MODEL_INPUTS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{['cnn_rank','RV20_rank'].includes(key) && typeof data?.inputs[key]==='number' ? `${number(data.inputs[key]*100)}%` : number(data?.inputs[key])}</dd></div>)}</dl></section>
    <section><h2>참고 게이지</h2><p>RSI와 VIX 원수치는 참고 표시입니다.</p><dl className="radar-inputs">{REFERENCE_INPUTS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{number(data?.references[key])}</dd></div>)}</dl></section>
  </section>;
}
