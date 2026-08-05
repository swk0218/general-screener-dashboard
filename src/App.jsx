import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Grid2X2,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PanelRightOpen,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { decryptEnvelope } from "./crypto/envelope.js";
import { assertDashboardPayload } from "./data/contract.js";

const STRATEGIES = Object.freeze({
  MLG: {
    label: "중대형 성장주",
    pickLabel: "10 PICKS",
    version: "MLG v1",
  },
  TENX: {
    label: "텐베거 유망주",
    pickLabel: "5 PICKS",
    version: "TENX",
  },
});

const NAV_ITEMS = Object.freeze([
  { id: "overview", label: "OVERVIEW", icon: LayoutDashboard },
  { id: "MLG", label: "MLG", icon: TrendingUp },
  { id: "TENX", label: "TENX", icon: Grid2X2 },
  { id: "history", label: "HISTORY", icon: History },
  { id: "performance", label: "PERFORMANCE", icon: BarChart3 },
  { id: "methodology", label: "METHODOLOGY", icon: BookOpen },
]);

const MOBILE_NAV_ITEMS = Object.freeze([
  { id: "overview", label: "OVERVIEW", icon: Grid2X2 },
  { id: "strategy", label: "SCREENER", icon: TrendingUp },
  { id: "history", label: "HISTORY", icon: Clock3 },
  { id: "performance", label: "PERF", icon: BarChart3 },
]);

const DATE_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatKst(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${DATE_FORMATTER.format(date).replace(",", "")} KST`;
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${formatNumber(Number(value) * 100)}%`;
}

function verdictClass(verdict) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized.includes("관찰") || normalized === "WATCH") return "is-cyan";
  if (normalized === "FAIL") return "is-negative";
  return "is-amber";
}

function parseRiskFlags(raw) {
  if (!raw) return [];
  return String(raw)
    .split("|")
    .map((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 0) return { key: "NOTE", value: entry.trim() };
      return {
        key: entry.slice(0, separator).trim().replaceAll("_", " ").toUpperCase(),
        value: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry) => entry.value);
}

function UnlockScreen({ envelope, envelopeError, onUnlock }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  async function submit(event) {
    event?.preventDefault();
    if (!envelope || !passphrase) return;
    setIsUnlocking(true);
    setError("");
    try {
      await onUnlock(passphrase);
      setPassphrase("");
    } catch {
      setPassphrase("");
      setError("암호문구가 맞지 않거나 데이터가 손상되었습니다.");
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <main className="unlock-screen">
      <header className="unlock-header">
        <span className="brand-wordmark">GENERAL SCREENER</span>
        <span className="system-state"><span className="status-dot" /> ENCRYPTED STATIC VAULT</span>
      </header>
      <section className="unlock-panel" aria-labelledby="unlock-title">
        <div className="unlock-symbol" aria-hidden="true"><LockKeyhole size={28} strokeWidth={1.6} /></div>
        <p className="eyeline">PRIVATE TERMINAL ACCESS</p>
        <h1 id="unlock-title">GENERAL SCREENER</h1>
        <p className="unlock-copy">
          입력값은 이 기기에서 데이터 복호화에만 사용되며 앱에서 전송하거나 저장하지 않습니다.
        </p>
        <form onSubmit={submit} className="unlock-form">
          <TextInput
            type="password"
            label="암호문구"
            value={passphrase}
            onChange={setPassphrase}
            placeholder="Enter passphrase"
            width="100%"
            size="lg"
            hasAutoFocus
            isDisabled={!envelope || Boolean(envelopeError)}
            autoComplete="off"
          />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {envelopeError ? <p className="form-error" role="alert">{envelopeError}</p> : null}
          <Button
            type="submit"
            label={envelope ? "OPEN GENERAL SCREENER" : "LOADING ENCRYPTED DATA"}
            variant="primary"
            size="lg"
            width="100%"
            isDisabled={!envelope || !passphrase || Boolean(envelopeError)}
            isLoading={isUnlocking}
          />
        </form>
        <div className="unlock-footnote">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>API key 없음 · 평문 payload 없음 · browser memory only</span>
        </div>
      </section>
    </main>
  );
}

function BrandHeader({ strategy, query, setQuery, generatedAt, onStrategy, onLock }) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="brand-wordmark">GENERAL SCREENER</div>
      <nav className="engine-tabs" aria-label="스크리닝 전략">
        {Object.keys(STRATEGIES).map((item) => (
          <button
            type="button"
            key={item}
            className={strategy === item ? "is-active" : ""}
            onClick={() => onStrategy(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className={`top-search ${mobileSearchOpen ? "is-open" : ""}`}>
        <TextInput
          label="종목 검색"
          isLabelHidden
          value={query}
          onChange={setQuery}
          placeholder="Search ticker or company..."
          startIcon={<Search size={16} strokeWidth={1.8} />}
          hasClear
          width="100%"
          size="lg"
        />
        <button
          type="button"
          className="mobile-search-close"
          aria-label="검색 닫기"
          onClick={() => setMobileSearchOpen(false)}
        >
          <X size={20} />
        </button>
      </div>
      <button
        type="button"
        className="mobile-search-trigger"
        aria-label="종목 검색 열기"
        onClick={() => setMobileSearchOpen(true)}
      >
        <Search size={24} strokeWidth={1.8} />
      </button>
      <div className="sync-status">
        <span className="sync-label">LAST SYNC</span>
        <time>{formatKst(generatedAt)}</time>
        <span className="status-dot" aria-label="정상 동기화" />
      </div>
      <button type="button" className="mobile-lock" onClick={onLock} aria-label="스크리너 잠금">
        <LockKeyhole size={18} />
      </button>
    </header>
  );
}

function SideNav({ activeView, strategy, onNavigate, onLock }) {
  return (
    <aside className="side-nav" aria-label="주요 메뉴">
      <div className="side-nav-items">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = id === strategy ? activeView === "selection" : id === activeView;
          return (
            <button
              type="button"
              key={id}
              className={`side-nav-item ${active ? "is-active" : ""}`}
              onClick={() => onNavigate(id)}
              title={label}
            >
              <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="side-nav-utility">
        <span title="Settings" aria-hidden="true"><Settings size={20} /></span>
        <span title="Help" aria-hidden="true"><CircleHelp size={20} /></span>
        <button type="button" title="Lock" aria-label="스크리너 잠금" onClick={onLock}><LogOut size={20} /></button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, strategy, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
      {MOBILE_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const target = id === "strategy" ? strategy : id;
        const resolvedLabel = id === "strategy" ? strategy : label;
        const active = id === "strategy" ? activeView === "selection" : id === activeView;
        return (
          <button
            type="button"
            key={id}
            className={active ? "is-active" : ""}
            onClick={() => onNavigate(target)}
          >
            <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
            <span>{resolvedLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MetadataStrip({ strategy, count, benchmark, evidenceStatus, contractVersion }) {
  const items = [
    ["추천", String(count)],
    ["전략", STRATEGIES[strategy].version],
    ["기준", benchmark || "QQQ"],
    ["가격", evidenceStatus?.startsWith("HOLD") ? "관측 준비 중" : "관측 연결"],
    ["실행", "OFFICIAL"],
    ["계약", contractVersion],
  ];
  return (
    <dl className="metadata-strip">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecommendationTable({ recommendations, selectedSymbol, onSelect, onOpenMobile }) {
  return (
    <div className="recommendation-table-wrap">
      <table className="recommendation-table">
        <thead>
          <tr>
            <th scope="col">RANK</th>
            <th scope="col">TICKER</th>
            <th scope="col" className="company-column">COMPANY</th>
            <th scope="col">VERDICT</th>
            <th scope="col" className="number-cell">SCORE</th>
            <th scope="col" className="number-cell">PRICE</th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((item) => (
            <tr
              key={`${item.run_id}:${item.signal_id || item.symbol}`}
              className={item.symbol === selectedSymbol ? "is-selected" : ""}
              tabIndex={0}
              aria-selected={item.symbol === selectedSymbol}
              onClick={() => onSelect(item.symbol)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item.symbol);
                }
              }}
            >
              <td>{String(item.recommendation_rank).padStart(2, "0")}</td>
              <td className="ticker-cell">{item.symbol}</td>
              <td className="company-column">{item.company_name || "—"}</td>
              <td className={`verdict-cell ${verdictClass(item.verdict)}`}>{item.verdict || "—"}</td>
              <td className="number-cell score-cell">{formatNumber(item.score)}</td>
              <td className="number-cell muted-number">{formatPrice(item.screening_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="recommendation-mobile-list" aria-label="공식 추천 목록">
        {recommendations.map((item) => (
          <li key={`mobile:${item.run_id}:${item.signal_id || item.symbol}`}>
            <button
              type="button"
              className={item.symbol === selectedSymbol ? "is-selected" : ""}
              onClick={() => {
                onSelect(item.symbol);
                onOpenMobile();
              }}
            >
              <span className="mobile-rank">{String(item.recommendation_rank).padStart(2, "0")}</span>
              <span className="mobile-security">
                <strong>{item.symbol}</strong>
                <span className={verdictClass(item.verdict)}>{item.verdict || "—"}</span>
              </span>
              <span className="mobile-numbers">
                <strong>{formatNumber(item.score)}</strong>
                <span>{formatPrice(item.screening_price)}</span>
              </span>
              <ChevronRight size={22} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {recommendations.length === 0 ? (
        <div className="empty-list">검색 조건에 맞는 공식 추천 종목이 없습니다.</div>
      ) : null}
    </div>
  );
}

function DetailPanel({ recommendation, onClose, compact = false }) {
  if (!recommendation) {
    return <aside className="detail-panel empty-detail">종목을 선택하면 상세 근거가 표시됩니다.</aside>;
  }
  const risks = parseRiskFlags(recommendation.risk_flags);
  return (
    <aside className={`detail-panel ${compact ? "is-compact" : ""}`} aria-label={`${recommendation.symbol} 상세`}>
      {onClose ? (
        <button type="button" className="detail-close" onClick={onClose} aria-label="상세 닫기" autoFocus><X size={20} /></button>
      ) : null}
      <div className="detail-heading">
        <h2>{recommendation.symbol}</h2>
        <p>{recommendation.company_name || "회사명 미수록"}</p>
      </div>
      <dl className="detail-metrics">
        <div><dt>SCORE</dt><dd>{formatNumber(recommendation.score)}</dd></div>
        <div><dt>VERDICT</dt><dd className={verdictClass(recommendation.verdict)}>{recommendation.verdict || "—"}</dd></div>
        <div><dt>PRICE</dt><dd>{formatPrice(recommendation.screening_price)}</dd></div>
        <div><dt>SECTOR</dt><dd>{recommendation.sector || "—"}</dd></div>
        <div><dt>CONFIDENCE</dt><dd>{recommendation.confidence || "—"}</dd></div>
      </dl>
      <div className="detail-evidence">
        {risks.length ? risks.slice(0, 4).map((risk, index) => (
          <div key={`${risk.key}:${index}`}>
            {index === 0 ? <ShieldCheck size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
            <span><small>{risk.key}</small>{risk.value}</span>
          </div>
        )) : (
          <div><FileText size={20} aria-hidden="true" /><span>추가 위험 플래그 없음</span></div>
        )}
      </div>
    </aside>
  );
}

function PerformancePanel({ strategy, aggregates, evidenceStatus, range, setRange, benchmark = "QQQ" }) {
  const horizon = range.toLowerCase();
  const aggregate = aggregates.find(
    (item) => item.strategy === strategy && String(item.horizon).toLowerCase() === horizon,
  );
  return (
    <section className="performance-panel" aria-labelledby="performance-title">
      <div className="section-heading-row">
        <h2 id="performance-title">BENCHMARK PERFORMANCE</h2>
        <div className="legend" aria-label="차트 범례">
          <span><i className="legend-line is-amber" />{strategy}</span>
          <span><i className="legend-line is-cyan" />{benchmark}</span>
        </div>
      </div>
      <div className="range-tabs" role="tablist" aria-label="성과 기간">
        {["5D", "10D", "20D"].map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={range === item}
            className={range === item ? "is-active" : ""}
            onClick={() => setRange(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      {aggregate ? (
        <dl className="performance-summary">
          <div><dt>{strategy}</dt><dd>{formatPercent(aggregate.equal_weight_return)}</dd></div>
          <div><dt>{benchmark}</dt><dd>{formatPercent(aggregate.qqq_equal_weight_return)}</dd></div>
          <div><dt>EXCESS</dt><dd>{formatPercent(aggregate.equal_weight_excess_return)}</dd></div>
          <div><dt>SAMPLE</dt><dd>{aggregate.count ?? "—"}</dd></div>
        </dl>
      ) : (
        <div className="performance-empty">
          <p>가격 관측 원장 준비 중</p>
          <small>{evidenceStatus || "PERFORMANCE_PENDING"}</small>
        </div>
      )}
    </section>
  );
}

function MobileSectionTabs({ value, onChange }) {
  return (
    <div className="mobile-section-tabs" role="tablist" aria-label="모바일 상세 섹션">
      {[
        ["selection", "SELECTION"],
        ["performance", "PERFORMANCE"],
        ["details", "DETAILS"],
      ].map(([id, label]) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === id}
          className={value === id ? "is-active" : ""}
          onClick={() => onChange(id)}
          key={id}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SelectionView({ payload, strategy, query, selectedRunId }) {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("selection");
  const [range, setRange] = useState("5D");
  const tabletDetailTriggerRef = useRef(null);

  const currentRun = useMemo(() => {
    const matches = payload.runs.filter((item) => item.strategy === strategy);
    if (selectedRunId !== null) {
      const selectedRun = matches.find((item) => String(item.run_id) === String(selectedRunId));
      if (selectedRun) return selectedRun;
    }
    return [...matches].sort((a, b) => String(b.report_created_at).localeCompare(String(a.report_created_at)))[0] || null;
  }, [payload.runs, selectedRunId, strategy]);

  const recommendations = useMemo(() => {
    if (!currentRun) return [];
    const normalizedQuery = query.trim().toUpperCase();
    return payload.recommendations
      .filter((item) => item.strategy === strategy && String(item.run_id) === String(currentRun.run_id))
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.symbol} ${item.company_name || ""}`.toUpperCase().includes(normalizedQuery);
      })
      .sort((a, b) => Number(a.recommendation_rank) - Number(b.recommendation_rank));
  }, [currentRun, payload.recommendations, query, strategy]);

  useEffect(() => {
    if (!recommendations.some((item) => item.symbol === selectedSymbol)) {
      setSelectedSymbol(recommendations[0]?.symbol || null);
    }
  }, [recommendations, selectedSymbol]);

  useEffect(() => {
    setMobileTab("selection");
    setDrawerOpen(false);
  }, [strategy]);

  function closeTabletDrawer() {
    setDrawerOpen(false);
    requestAnimationFrame(() => tabletDetailTriggerRef.current?.focus());
  }

  const selected = recommendations.find((item) => item.symbol === selectedSymbol) || recommendations[0] || null;
  const aggregates = payload.performance?.aggregates || [];

  return (
    <div className="selection-view" data-mobile-tab={mobileTab}>
      <section className="run-header">
        <h1>
          <span>{strategy}</span>
          <span className="run-date">· {formatDate(currentRun?.report_date || currentRun?.report_created_at)}</span>
        </h1>
        <p className="strategy-descriptor">{STRATEGIES[strategy].label}</p>
        <p className="run-provenance">
          OFFICIAL SCHEDULED RUN · RUN {currentRun?.run_id || "—"} · {currentRun?.branch || "MAIN"}
        </p>
        <MetadataStrip
          strategy={strategy}
          count={recommendations.length}
          benchmark={payload.benchmark}
          evidenceStatus={payload.evidence_status}
          contractVersion={payload.contract_version}
        />
      </section>

      <MobileSectionTabs value={mobileTab} onChange={setMobileTab} />

      <div className="selection-content">
        <section className="table-panel" aria-labelledby="current-selection-title">
          <div className="section-heading-row table-heading">
            <h2 id="current-selection-title">CURRENT SELECTION</h2>
            <span className="row-hint">Select a row to view details <ChevronRight size={17} /></span>
          </div>
          <RecommendationTable
            recommendations={recommendations}
            selectedSymbol={selected?.symbol}
            onSelect={setSelectedSymbol}
            onOpenMobile={() => setMobileTab("details")}
          />
        </section>
        <div className="desktop-detail"><DetailPanel recommendation={selected} /></div>
        <button
          type="button"
          className="tablet-detail-trigger"
          ref={tabletDetailTriggerRef}
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="tablet-detail-drawer"
          aria-label={`${selected?.symbol || "종목"} 상세 열기`}
        >
          <PanelRightOpen size={18} />
          <span>{selected?.symbol || "ROW"} DETAILS</span>
        </button>
        {drawerOpen ? (
          <div
            id="tablet-detail-drawer"
            className="tablet-detail-drawer is-open"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected?.symbol || "종목"} 상세`}
            onKeyDown={(event) => {
              if (event.key === "Tab") event.preventDefault();
              if (event.key === "Escape") {
                event.preventDefault();
                closeTabletDrawer();
              }
            }}
          >
            <DetailPanel recommendation={selected} onClose={closeTabletDrawer} compact />
          </div>
        ) : null}
      </div>

      <div className="mobile-detail"><DetailPanel recommendation={selected} /></div>
      <PerformancePanel
        strategy={strategy}
        aggregates={aggregates}
        evidenceStatus={payload.evidence_status}
        benchmark={payload.benchmark}
        range={range}
        setRange={setRange}
      />
    </div>
  );
}

function OverviewView({ payload, onStrategy }) {
  const latestRuns = Object.keys(STRATEGIES).map((strategy) => {
    const run = payload.runs
      .filter((item) => item.strategy === strategy)
      .sort((a, b) => String(b.report_created_at).localeCompare(String(a.report_created_at)))[0];
    const count = run
      ? payload.recommendations.filter(
          (item) => item.strategy === strategy && String(item.run_id) === String(run.run_id),
        ).length
      : 0;
    return { strategy, run, count };
  });
  return (
    <section className="secondary-view overview-view">
      <header>
        <p>GENERAL / OVERVIEW</p>
        <h1>OFFICIAL SCREENERS</h1>
        <span>두 엔진의 공식 순위와 점수는 서로 합산하거나 재정렬하지 않습니다.</span>
      </header>
      <div className="overview-list">
        {latestRuns.map(({ strategy, run, count }) => (
          <button type="button" key={strategy} onClick={() => onStrategy(strategy)}>
            <span className="overview-engine">{strategy}</span>
            <span className="overview-label">{STRATEGIES[strategy].label}</span>
            <span>{count} PICKS</span>
            <span>{formatDate(run?.report_date || run?.report_created_at)}</span>
            <ChevronRight size={20} />
          </button>
        ))}
      </div>
      <dl className="overview-status">
        <div><dt>BENCHMARK</dt><dd>{payload.benchmark || "QQQ"}</dd></div>
        <div><dt>EVIDENCE</dt><dd>{payload.evidence_status || "—"}</dd></div>
        <div><dt>LAST SYNC</dt><dd>{formatKst(payload.generated_at)}</dd></div>
      </dl>
    </section>
  );
}

function HistoryView({ payload, strategy, onStrategy }) {
  const runs = [...payload.runs].sort(
    (a, b) => String(b.report_created_at).localeCompare(String(a.report_created_at)),
  );
  return (
    <section className="secondary-view history-view">
      <header>
        <p>GENERAL / HISTORY</p>
        <h1>OFFICIAL RUN HISTORY</h1>
        <span>실행 ID와 전략별 공식 추천 기록</span>
      </header>
      <div className="history-list">
        {runs.map((run) => {
          const count = payload.recommendations.filter(
            (item) => item.strategy === run.strategy && String(item.run_id) === String(run.run_id),
          ).length;
          return (
            <button type="button" key={`${run.strategy}:${run.run_id}`} onClick={() => onStrategy(run.strategy, run.run_id)}>
              <span className={run.strategy === strategy ? "is-current" : ""}>{run.strategy}</span>
              <span>{formatKst(run.report_created_at)}</span>
              <span>RUN {run.run_id}</span>
              <span>{count} PICKS</span>
              <ChevronRight size={19} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StandalonePerformanceView({ payload, strategy }) {
  const [range, setRange] = useState("5D");
  return (
    <section className="secondary-view performance-view">
      <header>
        <p>GENERAL / PERFORMANCE</p>
        <h1>{strategy} VS {payload.benchmark || "QQQ"}</h1>
        <span>공식 추천 이후 동일 기간 성과 비교</span>
      </header>
      <PerformancePanel
        strategy={strategy}
        aggregates={payload.performance?.aggregates || []}
        evidenceStatus={payload.evidence_status}
        benchmark={payload.benchmark}
        range={range}
        setRange={setRange}
      />
    </section>
  );
}

function MethodologyView({ benchmark }) {
  return (
    <section className="secondary-view methodology-view">
      <header>
        <p>GENERAL / METHODOLOGY</p>
        <h1>READ THE SIGNAL, KEEP THE LINEAGE</h1>
        <span>스크리너 출력과 성과 근거를 분리해 표시합니다.</span>
      </header>
      <dl className="methodology-list">
        <div><dt>MLG</dt><dd><strong>중대형 성장주</strong><span>공식 MLG 엔진 순위를 그대로 표시합니다.</span></dd></div>
        <div><dt>TENX</dt><dd><strong>텐베거 유망주</strong><span>공식 TENX Top5 순위를 그대로 표시합니다.</span></dd></div>
        <div><dt>BENCHMARK</dt><dd><strong>{benchmark || "QQQ"}</strong><span>동일 진입 시점과 관측 기간으로 초과수익을 계산합니다.</span></dd></div>
        <div><dt>PROVENANCE</dt><dd><strong>RUN ID + SOURCE TIME</strong><span>결과마다 실행 ID와 생성 시각을 유지합니다.</span></dd></div>
      </dl>
    </section>
  );
}

function Dashboard({ payload, onLock }) {
  const [strategy, setStrategy] = useState("MLG");
  const [activeView, setActiveView] = useState("selection");
  const [query, setQuery] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(null);

  function selectStrategy(nextStrategy, runId = null) {
    setStrategy(nextStrategy);
    setSelectedRunId(runId);
    setActiveView("selection");
    setQuery("");
  }

  function navigate(id) {
    if (id === "MLG" || id === "TENX") {
      selectStrategy(id);
      return;
    }
    setActiveView(id);
  }

  let content;
  if (activeView === "overview") {
    content = <OverviewView payload={payload} onStrategy={selectStrategy} />;
  } else if (activeView === "history") {
    content = <HistoryView payload={payload} strategy={strategy} onStrategy={selectStrategy} />;
  } else if (activeView === "performance") {
    content = <StandalonePerformanceView payload={payload} strategy={strategy} />;
  } else if (activeView === "methodology") {
    content = <MethodologyView benchmark={payload.benchmark} />;
  } else {
    content = <SelectionView payload={payload} strategy={strategy} query={query} selectedRunId={selectedRunId} />;
  }

  return (
    <div className="app-shell">
      <BrandHeader
        strategy={strategy}
        query={query}
        setQuery={setQuery}
        generatedAt={payload.generated_at}
        onStrategy={selectStrategy}
        onLock={onLock}
      />
      <SideNav activeView={activeView} strategy={strategy} onNavigate={navigate} onLock={onLock} />
      <main className="workspace">{content}</main>
      <MobileNav activeView={activeView} strategy={strategy} onNavigate={navigate} />
    </div>
  );
}

export function App() {
  const [envelope, setEnvelope] = useState(null);
  const [envelopeError, setEnvelopeError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const payloadUrl = `${import.meta.env.BASE_URL}data/payload.enc.json`;
    fetch(payloadUrl, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Encrypted payload unavailable (${response.status})`);
        return response.json();
      })
      .then(setEnvelope)
      .catch((error) => {
        if (error.name !== "AbortError") setEnvelopeError("암호화된 스크리너 데이터를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, []);

  async function unlock(passphrase) {
    const decrypted = await decryptEnvelope(envelope, passphrase);
    setPayload(assertDashboardPayload(decrypted));
  }

  function lock() {
    setPayload(null);
  }

  return (
    <Theme theme={neutralTheme} mode="dark">
      {payload ? (
        <Dashboard payload={payload} onLock={lock} />
      ) : (
        <UnlockScreen envelope={envelope} envelopeError={envelopeError} onUnlock={unlock} />
      )}
    </Theme>
  );
}
