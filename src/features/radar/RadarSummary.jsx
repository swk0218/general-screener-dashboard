import { BellOff, TriangleAlert } from 'lucide-react';
import { SectionFooter } from '../../components/SectionElements.jsx';
import { useRadarPresentation } from './use-radar-presentation.js';
import './radar.css';

// One visible source-session date. Refresh/admission/build clocks remain in
// radarPresentation and provenance; none may substitute for the data basis.
export function RadarUpdate({sourceDate=null,basisDate=null}) {
  const basis=basisDate||sourceDate;
  const valid=typeof basis==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(basis)
    &&Number.isFinite(Date.parse(`${basis}T00:00:00Z`))
    &&new Date(`${basis}T00:00:00Z`).toISOString().slice(0,10)===basis;
  return <span className="radar-updated">
    {valid?<span className="radar-basis-date" role="group" aria-label="관측 기준일"><time className="update-badge radar-data-date" title={`자료 기준일 ${basis}`} dateTime={basis}>{basis.slice(5).replace('-','.')} Data</time></span>:<span className="radar-basis-date">기준일 확인 불가</span>}
  </span>;
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
  const {data,headline,eventLabel,eventKind,displayScore,updateDate,sourceDate,displayUnavailable,basisDate,freshnessNote}=useRadarPresentation(delivery,status);
  const score=displayScore;
  return <section className="overview-radar" aria-labelledby="overview-radar-title">
    <header><h2 id="overview-radar-title">시장 전환 지수 (Beta)</h2><RadarUpdate date={updateDate} sourceDate={sourceDate} basisDate={basisDate} note={freshnessNote}/></header>
    <div className="overview-radar-body">
      <div className="overview-radar-reading">
        <div className="overview-radar-score"><strong>{Number.isInteger(score)?score:'—'}</strong><span>/100</span></div>
        <div><p className="market-insight"><RadarHeadline headline={headline} alert={!displayUnavailable&&Boolean(data?.events.bottom||data?.events.top)}/></p><p><RadarEventLabel label={eventLabel} kind={eventKind}/></p></div>
      </div>
      {!displayUnavailable&&data?.gauge.mixed_strength===1&&Number.isInteger(score)&&<p className="overview-radar-caption">양방향 조건 강함</p>}
    </div>
    <SectionFooter onClick={onOpen}>지수 자세히</SectionFooter>
  </section>;
}
