import { useEffect, useState } from 'react';
import { seasonalityMonth, seasonalityPercent, seasonalityIsCurrent } from './seasonality-contract.js';

export function SeasonalityCard({ data = null, currentMonth = null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!data) return undefined;
    const refresh = () => setNow(new Date());
    refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [data]);
  if (!data || !seasonalityIsCurrent(data, now)) return null;
  const highlightedMonth = currentMonth ?? seasonalityMonth(now);
  const scale = Math.max(...data.months.map(row => Math.abs(row.mean_return)), 0.01);
  return <section className="radar-seasonality" aria-labelledby="radar-seasonality-title">
    <header className="radar-seasonality-heading">
      <h3 id="radar-seasonality-title">SPY 월별 평균 수익률</h3>
      <span>{data.start_year}–{data.end_year} · 최근 {data.lookback_years}년</span>
    </header>
    <dl className="radar-seasonality-months">
      {data.months.map(row => <div key={row.month} className={`radar-seasonality-month${row.month === highlightedMonth ? ' is-current' : ''}`} aria-current={row.month === highlightedMonth ? 'date' : undefined}>
        <dt>{row.month}월{row.month === highlightedMonth && <span className="sr-only"> · 이번 달</span>}</dt>
        <dd>
          <span className="radar-seasonality-bar" aria-hidden="true"><i className={row.mean_return < 0 ? 'is-negative' : 'is-positive'} style={{ height: `${Math.abs(row.mean_return) / scale * 45}%` }} /></span>
          <strong className={row.mean_return < 0 ? 'is-negative' : 'is-positive'}>{seasonalityPercent(row.mean_return)}</strong>
        </dd>
      </div>)}
    </dl>
  </section>;
}
