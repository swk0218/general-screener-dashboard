export function NewsImpact({presentation,reviewer=false}) {
  return <div className="news-interpretation">
    {reviewer&&<small className="briefing-note">추가 검토 해석 · 새 GPT 판단 아님</small>}
    <p className="news-watch-point"><strong>봐야 할 포인트</strong> {presentation.watchPoint}</p>
    <div className="news-impact-line"><span className={'event-badge news-impact is-'+presentation.impact.direction}>{presentation.impact.label}</span>{presentation.impact.scope&&<span className="news-impact-scope">{presentation.impact.scope}</span>}</div>
    {presentation.impact.condition&&<p className="news-impact-condition">{presentation.impact.condition}</p>}
  </div>;
}
