import { ChevronRight } from 'lucide-react';
import { radarPresentation } from './radar-presentation.js';
import './radar.css';

export function RadarUpdate({data,delayed=false}) {
  return <span className="radar-updated"><time dateTime={data?.session} title="시장 자료 기준일">{data?.session?`${data.session.slice(5).replace('-','.')} Updated`:'자료 없음'}</time>{delayed&&<small>갱신 지연</small>}</span>;
}
export function RadarSummary({delivery=null,onOpen}) {
  const {data,unavailable,observation,stale,failed,headline,eventLabel}=radarPresentation(delivery);
  const score=data?.gauge.score;
  return <section className="overview-radar" aria-labelledby="overview-radar-title">
    <header><h2 id="overview-radar-title">시장 전환 지수 (Beta)</h2><RadarUpdate data={data} delayed={stale||failed}/></header>
    <div className="overview-radar-body">
      <div className="overview-radar-reading">
        <div className="overview-radar-score"><strong>{Number.isInteger(score)?score:'—'}</strong><span>/100</span></div>
        <div><p><strong>{headline}</strong></p><p>{unavailable||observation?'경보 미계산':eventLabel}</p></div>
      </div>
      {data?.gauge.mixed_strength===1&&Number.isInteger(score)&&<p className="overview-radar-caption">양방향 조건 강함</p>}
      <div className="overview-radar-actions"><button type="button" onClick={onOpen}>Radar 보기<ChevronRight size={16} aria-hidden="true"/></button></div>
    </div>
  </section>;
}
