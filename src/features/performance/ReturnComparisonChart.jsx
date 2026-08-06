import { useId, useMemo } from "react";

const WIDTH = 900;
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
  const chart = useMemo(() => {
    const sorted = [...points].sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
    const values = sorted.flatMap((point) => [finite(point.strategy_return), finite(point.qqq_return), 0]);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = Math.max(0.02, rawMax - rawMin);
    const min = rawMin - span * 0.16;
    const max = rawMax + span * 0.16;
    const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const groupWidth = innerWidth / Math.max(1, sorted.length);
    const barWidth = Math.min(28, groupWidth * 0.3);
    const xFor = (index) => MARGIN.left + groupWidth * (index + 0.5);
    const yFor = (value) => MARGIN.top + (max - value) / (max - min) * innerHeight;
    const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4).reverse();
    return {
      sorted,
      xFor,
      yFor,
      ticks,
      barWidth,
    };
  }, [points]);

  if (!chart.sorted.length) {
    return <div className="return-chart-empty">이 기간은 완전한 실행 단위 역산값이 아직 없습니다.</div>;
  }

  return (
    <figure className="return-chart" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <figcaption>
        <span id={titleId}>실행별 {horizon} 수익률 비교</span>
        <span id={descriptionId}>각 실행의 {strategy}와 같은 거래기간 {benchmark}를 나란히 비교한 막대 차트</span>
      </figcaption>
      <div className="return-chart-legend" aria-hidden="true">
        <span><i className="is-strategy" />{strategy}</span>
        <span><i className="is-benchmark" />{benchmark}</span>
        <span><i className="is-zero" />0%</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{ minWidth: `${Math.max(280, chart.sorted.length * 92)}px` }}
      >
        <g className="return-chart-grid">
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={chart.yFor(tick)} y2={chart.yFor(tick)} />
              <text x={MARGIN.left - 10} y={chart.yFor(tick) + 4} textAnchor="end">{(tick * 100).toFixed(1)}%</text>
            </g>
          ))}
        </g>
        <line
          className="return-zero-line"
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={chart.yFor(0)}
          y2={chart.yFor(0)}
        />
        {chart.sorted.map((point, index) => {
          const x = chart.xFor(index);
          const strategyValue = finite(point.strategy_return);
          const qqqValue = finite(point.qqq_return);
          const baseline = chart.yFor(0);
          const strategyY = chart.yFor(strategyValue);
          const benchmarkY = chart.yFor(qqqValue);
          return (
            <g key={`${point.run_id}:${point.report_date}`}>
              <text className="return-date-label" x={x} y={HEIGHT - 14} textAnchor="middle">
                {compactDate(point.report_date)}
              </text>
              <rect
                className="return-bar is-strategy"
                x={x - chart.barWidth - 2}
                y={Math.min(baseline, strategyY)}
                width={chart.barWidth}
                height={Math.max(1, Math.abs(baseline - strategyY))}
                rx="1"
              >
                <title>{`${point.report_date} ${strategy} ${formatPercent(strategyValue)}`}</title>
              </rect>
              <rect
                className="return-bar is-benchmark"
                x={x + 2}
                y={Math.min(baseline, benchmarkY)}
                width={chart.barWidth}
                height={Math.max(1, Math.abs(baseline - benchmarkY))}
                rx="1"
              >
                <title>{`${point.report_date} ${benchmark} ${formatPercent(qqqValue)}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
