import { seasonalityMonth, seasonalityPercent } from './seasonality-contract.js';

export function SeasonalityCard({ data = null, currentMonth = seasonalityMonth() }) {
  if (!data) return null;
  const scale = Math.max(...data.months.map(row => Math.abs(row.mean_return)), 0.01);
  return <section className="radar-seasonality" aria-labelledby="radar-seasonality-title">
    <header className="radar-seasonality-heading">
      <h3 id="radar-seasonality-title">SPY 월별 평균 수익률</h3>
      <span>{data.start_year}–{data.end_year} · 최근 {data.lookback_years}년</span>
    </header>
    <dl className="radar-seasonality-months">
      {data.months.map(row => <div key={row.month} className={`radar-seasonality-month${row.month === currentMonth ? ' is-current' : ''}`} aria-current={row.month === currentMonth ? 'date' : undefined}>
        <dt>{row.month}월{row.month === currentMonth && <span className="sr-only"> · 이번 달</span>}</dt>
        <dd>
          <span className="radar-seasonality-bar" aria-hidden="true"><i className={row.mean_return < 0 ? 'is-negative' : 'is-positive'} style={{ height: `${Math.abs(row.mean_return) / scale * 45}%` }} /></span>
          <strong className={row.mean_return < 0 ? 'is-negative' : 'is-positive'}>{seasonalityPercent(row.mean_return)}</strong>
        </dd>
      </div>)}
    </dl>
  </section>;
}
