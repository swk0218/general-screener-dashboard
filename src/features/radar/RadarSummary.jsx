import { ChevronRight } from 'lucide-react';
import { radarPresentation } from './radar-presentation.js';
import './radar.css';

export function RadarSummary({delivery=null,onOpen}) {
  const {data,unavailable,observation,stale,failed,headline,eventLabel,notice}=radarPresentation(delivery);
  const score=data?.gauge.score;
  return <section className="overview-radar" aria-labelledby="overview-radar-title">
    <header><h2 id="overview-radar-title">시장 전환 종합 지표</h2><button type="button" onClick={onOpen}>Radar 보기<ChevronRight size={16} aria-hidden="true"/></button></header>
    <div className="overview-radar-reading">
      <div className="overview-radar-score"><strong>{Number.isInteger(score)?score:'—'}</strong><span>/100</span></div>
      <div><p><strong>{headline}</strong>{Number.isInteger(score)&&<span>{data.gauge.level}</span>}</p>
        <p>{data?.session?`기준일 ${data.session}`:'유효한 자료 미확인'} · {unavailable||observation?'경보 미계산':`${stale||failed?'당시':'기준일'} 신규 경보 ${eventLabel}`}</p>
      </div>
    </div>
    <p className={notice?'overview-radar-notice':'overview-radar-caption'}>{notice?`${notice} · 오늘의 신규 신호가 아닙니다.`:'낮을수록 저점, 높을수록 고점 방향 · 확률 아님'}</p>
    {data?.gauge.mixed_strength===1&&Number.isInteger(score)&&<p className="overview-radar-caption">양쪽 모두 경보 후보 수준 · 중간 점수여도 양쪽 조건이 약한 것은 아닙니다.</p>}
  </section>;
}
