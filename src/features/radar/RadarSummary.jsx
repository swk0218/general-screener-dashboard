import { BellOff, TriangleAlert } from 'lucide-react';
import { UpdateBadge, SectionFooter } from '../../components/SectionElements.jsx';
import { useRadarPresentation } from './use-radar-presentation.js';
import './radar.css';

export function RadarUpdate({data}) {
  return <span className="radar-updated"><UpdateBadge date={data?.session}/></span>;
}
export function RadarHeadline({headline,alert=false,dated=false}) {
  const normal=['냉각 구간','중립 구간','과열 구간'].includes(headline);
  return <span className={`radar-headline ${alert?'is-alert':normal?'is-normal':'is-unavailable'}`}>
    {normal?<>S&P500은 {dated?'해당 기준일에':'현재'} <span className="radar-headline-result"><strong>{headline}</strong>{dated?'으로 관측됐습니다':'입니다'}</span></>:<strong>{dated?'기준일 ':''}{headline}</strong>}
  </span>;
}
export function RadarEventLabel({label}) {
  const Icon=label==='고점 및 저점 경보 없음'?BellOff:label.includes('미계산')?null:TriangleAlert;
  return <span className="radar-event-label">{Icon&&<Icon size={14} aria-hidden="true"/>}{label}</span>;
}
export function RadarSummary({delivery=null,status=undefined,onOpen}) {
  const {data,unavailable,observation,headline,eventLabel,stale,notice}=useRadarPresentation(delivery,status);
  const score=data?.gauge.score;
  return <section className="overview-radar" aria-labelledby="overview-radar-title">
    <header><h2 id="overview-radar-title">시장 전환 지수 (Beta)</h2><RadarUpdate data={data}/></header>
    <div className="overview-radar-body">
      <div className="overview-radar-reading">
        <div className="overview-radar-score"><strong>{Number.isInteger(score)?score:'—'}</strong><span>/100</span></div>
        <div><p className="market-insight"><RadarHeadline headline={headline} dated={stale} alert={!stale&&Boolean(data?.events.bottom||data?.events.top)}/></p><p><RadarEventLabel label={unavailable||observation?'경보 미계산':eventLabel}/></p></div>
      </div>
      {data?.gauge.mixed_strength===1&&Number.isInteger(score)&&<p className="overview-radar-caption">양방향 조건 강함</p>}
      {notice&&<p className="overview-radar-caption" role="status">{notice}</p>}
    </div>
    <SectionFooter onClick={onOpen}>지수 자세히</SectionFooter>
  </section>;
}
