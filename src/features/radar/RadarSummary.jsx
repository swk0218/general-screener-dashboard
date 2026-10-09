import { BellOff, TriangleAlert } from 'lucide-react';
import { UpdateBadge, SectionFooter } from '../../components/SectionElements.jsx';
import { useRadarPresentation } from './use-radar-presentation.js';
import './radar.css';

export function RadarUpdate({data}) {
  return <span className="radar-updated"><UpdateBadge date={data?.session}/></span>;
}
export function RadarHeadline({headline,alert=false}) {
  const normal=['냉각 구간','중립 구간','과열 구간'].includes(headline);
  return <span className={`radar-headline ${alert?'is-alert':normal?'is-normal':'is-unavailable'}`}>
    <strong>{headline}</strong>
  </span>;
}
export function RadarEventLabel({label,kind}) {
  if(kind==='unavailable')return null;
  const Icon=kind==='none'?BellOff:['bottom','top','both'].includes(kind)?TriangleAlert:null;
  return <span className="radar-event-label">{Icon&&<Icon size={14} aria-hidden="true"/>}{label}</span>;
}
export function RadarSummary({delivery=null,status=undefined,onOpen}) {
  const {data,headline,eventLabel,eventKind,stale,displayScore}=useRadarPresentation(delivery,status);
  const score=displayScore;
  return <section className="overview-radar" aria-labelledby="overview-radar-title">
    <header><h2 id="overview-radar-title">시장 전환 지수 (Beta)</h2><RadarUpdate data={data}/></header>
    <div className="overview-radar-body">
      <div className="overview-radar-reading">
        <div className="overview-radar-score"><strong>{Number.isInteger(score)?score:'—'}</strong><span>/100</span></div>
        <div><p className="market-insight"><RadarHeadline headline={headline} alert={!stale&&Boolean(data?.events.bottom||data?.events.top)}/></p><p><RadarEventLabel label={eventLabel} kind={eventKind}/></p></div>
      </div>
      {data?.gauge.mixed_strength===1&&Number.isInteger(score)&&<p className="overview-radar-caption">양방향 조건 강함</p>}
    </div>
    <SectionFooter onClick={onOpen}>지수 자세히</SectionFooter>
  </section>;
}
