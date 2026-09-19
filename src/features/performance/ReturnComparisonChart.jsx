import { useEffect, useId, useMemo, useRef, useState } from "react";

const HEIGHT = 300;
const MARGIN = Object.freeze({ top: 20, right: 22, bottom: 40, left: 58 });

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function compactDate(value) {
  return String(value || "").slice(5, 10).replace("-", ".");
}

export function ReturnComparisonChart({ points = [], strategy, benchmark = "QQQ", horizon }) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [points.length === 0]);
  const chart = useMemo(() => {
    const sorted = [...points].sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
    const values = sorted.flatMap((point) => [finite(point.strategy_return), finite(point.qqq_return), 0]);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = Math.max(0.02, rawMax - rawMin);
    const min = rawMin - span * 0.16;
    const max = rawMax + span * 0.16;
    const innerWidth = width - MARGIN.left - MARGIN.right;
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const xFor = (index) => MARGIN.left + innerWidth * (sorted.length === 1 ? 0.5 : index / (sorted.length - 1));
    const labelCount = Math.max(2, Math.floor(innerWidth / 72));
    const labelIndices = new Set(Array.from({ length: Math.min(labelCount, sorted.length) }, (_, index) => Math.round(index * (sorted.length - 1) / Math.max(1, Math.min(labelCount, sorted.length) - 1))));
    const yFor = (value) => MARGIN.top + (max - value) / (max - min) * innerHeight;
    const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4).reverse();
    return {
      sorted,
      xFor,
      yFor,
      ticks,
      labelIndices,
    };
  }, [points, width]);

  if (!chart.sorted.length) {
    return <div className="return-chart-empty">이 기간은 완전한 실행 단위 역산값이 아직 없습니다.</div>;
  }

  return (
    <figure ref={containerRef} className="return-chart" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <figcaption>
        <span id={titleId}>실행별 {horizon} 수익률 비교</span>
      </figcaption>
      <p id={descriptionId} className="return-chart-description">가로축은 추천일입니다. 각 점은 해당 추천의 {horizon.replace("D", "거래일")} 보유 수익률이며, 누적 수익률이 아닙니다.</p>
      <div className="return-chart-legend" aria-hidden="true">
        <span><i className="is-strategy" />{strategy}</span>
        <span><i className="is-benchmark" />{benchmark}</span>
        <span><i className="is-zero" />0%</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <g className="return-chart-grid">
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={chart.yFor(tick)} y2={chart.yFor(tick)} />
              <text x={MARGIN.left - 10} y={chart.yFor(tick) + 4} textAnchor="end">{(tick * 100).toFixed(1)}%</text>
            </g>
          ))}
        </g>
        <line
          className="return-zero-line"
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={chart.yFor(0)}
          y2={chart.yFor(0)}
        />
        {[['strategy_return', 'is-strategy'], ['qqq_return', 'is-benchmark']].map(([field, className]) => (
          <polyline key={field} className={`return-series ${className}`} points={chart.sorted.map((point, index) => `${chart.xFor(index)},${chart.yFor(finite(point[field]))}`).join(' ')} />
        ))}
        {chart.sorted.map((point, index) => {
          const x = chart.xFor(index);
          const strategyValue = finite(point.strategy_return);
          const qqqValue = finite(point.qqq_return);
          const strategyY = chart.yFor(strategyValue);
          const benchmarkY = chart.yFor(qqqValue);
          return (
            <g key={`${point.run_id}:${point.report_date}`}>
              {chart.labelIndices.has(index) ? <text className="return-date-label" x={x} y={HEIGHT - 14} textAnchor="middle">
                {compactDate(point.report_date)}
              </text> : null}
              <circle
                className="return-point is-strategy"
                cx={x}
                cy={strategyY}
                r="3"
              >
                <title>{`${point.report_date} ${strategy} ${formatPercent(strategyValue)}`}</title>
              </circle>
              <circle
                className="return-point is-benchmark"
                cx={x}
                cy={benchmarkY}
                r="3"
              >
                <title>{`${point.report_date} ${benchmark} ${formatPercent(qqqValue)}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
