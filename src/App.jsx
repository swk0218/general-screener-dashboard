import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronRight,
  Grid2X2,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PanelRightOpen,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { decryptEnvelope } from "./crypto/envelope.js";
import { AppErrorBoundary } from "./components/AppErrorBoundary.jsx";
import { assertDashboardPayload } from "./data/contract.js";
import { quarantineDashboardPayload } from "./data/payload-quarantine.js";
import { ReturnComparisonChart } from "./features/performance/ReturnComparisonChart.jsx";
import {
  getPerformanceState,
  createDashboardIndex,
  getIndexedRecommendation,
  getIndexedRunChanges,
  getIndexedRunRecommendations,
  getRecommendationDetail,
  getSymbolTimeline,
  getVerifiedAggregate,
  parseHashRoute,
  resolveSelectedRun,
  searchHistoryRuns,
  searchSecurities,
  serializeHashRoute,
} from "./data/dashboard-model.js";

const STRATEGIES = Object.freeze({
  MLG: { label: "중대형 성장주", pickLabel: "10 PICKS", version: "MLG v1" },
  TENX: { label: "텐베거 유망주", pickLabel: "5 PICKS", version: "TENX" },
});

const HORIZONS = Object.freeze(["20D", "60D", "120D"]);
const LAST_SEEN_STORAGE_KEY = "general-screener:last-seen-runs:v1";

const RISK_LABELS = Object.freeze({
  "ENTRY TIMING WARNING": "진입 시점",
  "RSI WARNING STATUS": "RSI 경고",
  "EVENT RISK STATUS": "이벤트 근거",
  "DATA STATUS": "데이터 상태",
  NOTE: "참고",
});

const RISK_VALUES = Object.freeze({
  clear: "경고 없음",
  available: "확인 가능",
  unavailable: "미수록",
  unknown: "확인 불가",
  true: "해당",
  false: "해당 없음",
  fundamental: "펀더멘털",
  data_quality: "데이터 품질",
  growth: "성장 지속성",
  business: "사업 모델",
  valuation: "밸류에이션",
  accounting: "회계",
  cyclicality: "경기 순환",
});

const HEAT_LABELS = Object.freeze({ low: "낮음", medium: "보통", high: "높음" });
const CONFIDENCE_LABELS = Object.freeze({ high: "높음", medium: "보통", low: "낮음", partial: "일부 근거" });

const NAV_ITEMS = Object.freeze([
  { id: "overview", label: "OVERVIEW", icon: LayoutDashboard },
  { id: "screener", label: "SCREENER", icon: TrendingUp },
  { id: "history", label: "HISTORY", icon: History },
  { id: "performance", label: "PERFORMANCE", icon: BarChart3 },
  { id: "methodology", label: "METHOD", icon: BookOpen },
]);

const MOBILE_NAV_ITEMS = Object.freeze([
  { id: "overview", label: "OVERVIEW", icon: Grid2X2 },
  { id: "screener", label: "SCREENER", icon: TrendingUp },
  { id: "history", label: "HISTORY", icon: History },
  { id: "performance", label: "PERF", icon: BarChart3 },
  { id: "methodology", label: "METHOD", icon: BookOpen },
]);

const VIEW_LABELS = Object.freeze({
  overview: "OVERVIEW",
  selection: "SCREENER",
  detail: "SECURITY DETAIL",
  history: "RUN HISTORY",
  performance: "BENCHMARK",
  methodology: "METHOD",
});

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

function formatKstDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMATTER.format(date).slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function formatMonthDay(value) {
  const match = /^(?:\d{4})-(\d{2})-(\d{2})/.exec(formatDate(value));
  return match ? `${match[1]}.${match[2]}` : "—";
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function formatCompactNumber(value, digits = 3) {
  if (value === null || value === undefined || value === "") return "—";
  if (!Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(digits).replace(/\.?0+$/, "");
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "—";
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "—";
  return `${formatNumber(Number(value) * 100)}%`;
}

function formatPercentPoints(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${(number * 100).toFixed(2)}%p`;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "" && value !== "unknown";
}

function formatSigned(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function humanizeRiskLabel(value) {
  const normalized = String(value || "NOTE").toUpperCase();
  return RISK_LABELS[normalized] || normalized.replaceAll("_", " ");
}

function humanizeRiskValue(value) {
  const normalized = String(value || "").trim();
  return RISK_VALUES[normalized.toLowerCase()] || normalized;
}

function humanizeConfidence(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CONFIDENCE_LABELS[normalized] || value;
}

function priceBasisLabel(value) {
  return {
    tracking_archive_snapshot: "공식 실행 보관값",
    validated_price_ledger_screen: "검증 가격 원장 · 선정 시점",
    validated_price_ledger_current: "검증 가격 원장 · 최근 종가",
    official_completed_eod_tracking: "공식 완료 종가",
  }[value] || value || null;
}

function benchmarkDisplayName(benchmark) {
  return String(benchmark || "QQQ").toUpperCase() === "QQQ" ? "나스닥100" : benchmark;
}

function benchmarkComparisonCopy(benchmarkLabel, excessReturn) {
  if (!Number.isFinite(Number(excessReturn))) return "비교 가능한 실행을 기다리는 중입니다";
  const value = Number(excessReturn);
  return value >= 0
    ? `${benchmarkLabel} 대비 ${(value * 100).toFixed(2)}% 앞섰습니다`
    : `${benchmarkLabel} 대비 ${(Math.abs(value) * 100).toFixed(2)}% 뒤쳐졌습니다`;
}

function BenchmarkComparisonCopy({ benchmarkLabel, excessReturn }) {
  if (!Number.isFinite(Number(excessReturn))) return benchmarkComparisonCopy(benchmarkLabel, excessReturn);
  const value = Number(excessReturn);
  const displayValue = `${(Math.abs(value) * 100).toFixed(2)}%`;
  return (
    <>
      <span className="benchmark-copy-prefix">{benchmarkLabel} 대비</span>{" "}
      <span className="benchmark-copy-result">
        <strong className="benchmark-copy-value">{displayValue}</strong>{" "}
        <span className="benchmark-copy-status">{value >= 0 ? "앞섰습니다" : "뒤쳐졌습니다"}</span>
      </span>
    </>
  );
}

function routeDocumentTitle(route) {
  if (route?.view === "detail" && route.symbol) return `${route.symbol} 상세 | GENERAL SCREENER`;
  if (route?.view === "selection") return `${route.strategy || "MLG"} 스크리너 | GENERAL SCREENER`;
  if (route?.view === "performance") return `${route.strategy || "MLG"} 성과 | GENERAL SCREENER`;
  const labels = {
    overview: "개요",
    history: "실행 이력",
    methodology: "방법론",
  };
  return `${labels[route?.view] || "개요"} | GENERAL SCREENER`;
}

function verdictLabel(verdict) {
  const normalized = String(verdict || "").trim().toUpperCase();
  if (normalized === "PASS") return "핵심 후보";
  if (normalized === "WATCH" || normalized === "AUDIT") return "관찰 후보";
  if (normalized === "FAIL") return "예비 후보";
  return verdict || "—";
}

function getBackcastCell(backcast, strategy, horizon) {
  const normalized = String(horizon).toLowerCase();
  const horizonStatus = (backcast?.horizon_statuses || []).find(
    (item) => item.strategy === strategy && String(item.horizon).toLowerCase() === normalized,
  );
  const aggregate = (backcast?.aggregates || []).find(
    (item) => item.strategy === strategy
      && String(item.horizon).toLowerCase() === normalized
      && item.status === "RECONSTRUCTED",
  );
  const runSeries = (backcast?.run_series || [])
    .filter((item) => item.strategy === strategy
      && String(item.horizon).toLowerCase() === normalized
      && item.status === "RECONSTRUCTED")
    .sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
  const signals = (backcast?.signals || []).filter(
    (item) => item.strategy === strategy
      && String(item.horizon).toLowerCase() === normalized
      && item.status === "RECONSTRUCTED",
  );
  return { horizonStatus, aggregate, runSeries, signals };
}

function loadLastSeenRuns() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_SEEN_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function verdictClass(verdict) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized === "FAIL" || normalized.includes("탈락") || normalized.includes("제외")) return "is-negative";
  if (normalized.includes("관찰") || normalized === "WATCH" || normalized === "AUDIT") return "is-watch";
  if (normalized.includes("핵심") || normalized === "PASS") return "is-investable";
  return "is-neutral";
}

function returnTone(value) {
  if (!Number.isFinite(Number(value)) || Number(value) === 0) return "is-neutral";
  return Number(value) > 0 ? "is-positive" : "is-negative";
}

function transitionLabel(transition) {
  const status = String(transition?.status || "").toUpperCase();
  if (status === "NEW") return "신규 진입";
  if (status === "RE-ENTRY") return "재진입";
  if (status === "EXIT") return "제외";
  return formatSigned(transition?.scoreDelta);
}

function transitionTone(transition) {
  const status = String(transition?.status || "").toUpperCase();
  if (status === "NEW" || status === "RE-ENTRY") return "is-positive";
  if (status === "EXIT") return "is-negative";
  return returnTone(transition?.scoreDelta);
}

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", serializeHashRoute(route));
    }
    const handleHashChange = () => setRoute(parseHashRoute(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = useCallback((nextRoute, { replace = false } = {}) => {
    const nextHash = serializeHashRoute(nextRoute);
    if (window.location.hash === nextHash) {
      setRoute(parseHashRoute(nextHash));
      return;
    }
    if (replace) {
      window.history.replaceState(null, "", nextHash);
      setRoute(parseHashRoute(nextHash));
    } else {
      window.location.hash = nextHash.slice(1);
    }
  }, []);

  return [route, navigate];
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
      </header>
      <section className="unlock-panel" aria-labelledby="unlock-title">
        <div className="unlock-symbol" aria-hidden="true"><LockKeyhole size={28} strokeWidth={1.6} /></div>
        <p className="eyeline">PRIVATE TERMINAL ACCESS</p>
        <h1 id="unlock-title">GENERAL SCREENER</h1>
        <form onSubmit={submit} className="unlock-form">
          <TextInput
            type="password"
            label="PASSWORD"
            value={passphrase}
            onChange={setPassphrase}
            placeholder="********"
            width="100%"
            size="lg"
            hasAutoFocus
            isDisabled={!envelope || Boolean(envelopeError)}
            autoComplete="current-password"
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
      </section>
    </main>
  );
}

function StrategyModeControl({ strategy, onChange, label = "스크리닝 전략" }) {
  return (
    <SegmentedControl value={strategy} onChange={onChange} label={label} size="md" layout="fill">
      <SegmentedControlItem value="MLG" label="MLG · 중대형 성장주" />
      <SegmentedControlItem value="TENX" label="TENX · 텐베거 유망주" />
    </SegmentedControl>
  );
}

function BrandHeader({
  activeView,
  strategy,
  query,
  setQuery,
  searchResults,
  onOpenSearchResult,
  generatedAt,
  onLock,
}) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchTriggerRef = useRef(null);
  const searchWrapRef = useRef(null);
  const hasSearchQuery = Boolean(query.trim());
  const searchResultsId = "global-security-search-results";
  const searchPanelId = "global-security-search-panel";

  useEffect(() => {
    if (!mobileSearchOpen) return;
    requestAnimationFrame(() => searchWrapRef.current?.querySelector("input")?.focus());
  }, [mobileSearchOpen]);

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [activeView]);

  function closeMobileSearch() {
    setMobileSearchOpen(false);
    requestAnimationFrame(() => searchTriggerRef.current?.focus());
  }

  function openSearchResult(result) {
    setQuery("");
    setMobileSearchOpen(false);
    onOpenSearchResult(result);
  }

  return (
    <header className="topbar">
      <div className="brand-wordmark">GENERAL SCREENER</div>
      <div className="topbar-context">
        <span>{VIEW_LABELS[activeView] || "GENERAL"}</span>
        {["selection", "detail", "performance"].includes(activeView) ? <strong>{strategy}</strong> : null}
      </div>
      <div
        className={`top-search ${mobileSearchOpen ? "is-open" : ""}`}
        id={searchPanelId}
        role="search"
        aria-label="전체 실행 종목 검색"
        ref={searchWrapRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setQuery("");
            if (mobileSearchOpen) closeMobileSearch();
          }
        }}
      >
        <TextInput
          label="전체 실행 종목 검색"
          isLabelHidden
          value={query}
          onChange={setQuery}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || !searchResults.length) return;
            event.preventDefault();
            searchWrapRef.current?.querySelector(".global-search-results button")?.focus();
          }}
          placeholder="Search ticker or company..."
          startIcon={<Search size={16} strokeWidth={1.8} />}
          hasClear
          width="100%"
          size="lg"
          aria-controls={hasSearchQuery ? searchResultsId : undefined}
        />
        <button type="button" className="mobile-search-close" aria-label="검색 닫기" onClick={closeMobileSearch}>
          <X size={20} />
        </button>
        {hasSearchQuery ? (
          <div className="global-search-results" id={searchResultsId} aria-live="polite" aria-label="전체 실행 종목 검색 결과">
            {searchResults.length ? searchResults.map((result) => (
              <button
                type="button"
                key={`${result.strategy}:${result.runId}:${result.symbol}`}
                onClick={() => openSearchResult(result)}
              >
                <span className="global-search-symbol">{result.symbol}</span>
                <span className="global-search-company">{result.companyName || "회사명 미수록"}</span>
                <span className="global-search-context">{result.strategy} · {result.reportDate} · {formatNumber(result.score)}점</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )) : <p>일치하는 종목이 없습니다.</p>}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="mobile-search-trigger"
        ref={searchTriggerRef}
        aria-label="전체 실행 종목 검색 열기"
        aria-expanded={mobileSearchOpen}
        aria-controls={searchPanelId}
        onClick={() => setMobileSearchOpen(true)}
      >
        <Search size={24} strokeWidth={1.8} />
      </button>
      <div className="sync-status">
        <span className="sync-label">Last Update</span>
        <time dateTime={generatedAt || undefined}>{formatKstDate(generatedAt)}</time>
        <span className="status-dot" aria-label="데이터 동기화 완료" />
      </div>
      <button type="button" className="mobile-lock" onClick={onLock} aria-label="스크리너 잠금">
        <LockKeyhole size={18} />
      </button>
    </header>
  );
}

function SideNav({ activeView, onNavigate, onLock }) {
  return (
    <aside className="side-nav" aria-label="주요 메뉴">
      <div className="side-nav-items">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = id === "screener"
            ? ["selection", "detail"].includes(activeView)
            : id === activeView;
          return (
            <button
              type="button"
              key={id}
              className={`side-nav-item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
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
        <button type="button" title="Lock" aria-label="스크리너 잠금" onClick={onLock}><LogOut size={20} /></button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
      {MOBILE_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = id === "screener" ? ["selection", "detail"].includes(activeView) : id === activeView;
        return (
          <button
            type="button"
            key={id}
            className={active ? "is-active" : ""}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function RecommendationTable({ recommendations, selectedSymbol, transitions, onPreview, onOpenDetail }) {
  return (
    <div className="recommendation-table-wrap">
      <table className="recommendation-table">
        <thead>
          <tr>
            <th scope="col">순위</th>
            <th scope="col">종목</th>
            <th scope="col" className="company-column">회사</th>
            <th scope="col">판정</th>
            <th scope="col" className="number-cell">점수</th>
            <th scope="col" className="number-cell">선정 당시 가격</th>
            <th scope="col" className="number-cell delta-column">직전 대비</th>
            <th scope="col"><span className="sr-only">상세</span></th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((item) => {
            const transition = transitions?.get(item.symbol);
            return (
            <tr key={`${item.run_id}:${item.signal_id || item.symbol}`} className={item.symbol === selectedSymbol ? "is-selected" : ""}>
              <td>{String(item.recommendation_rank).padStart(2, "0")}</td>
              <td className="ticker-cell">
                <button
                  type="button"
                  className="row-select-button"
                  aria-pressed={item.symbol === selectedSymbol}
                  aria-label={`${item.symbol}, ${item.company_name || "회사명 미수록"}, ${item.recommendation_rank}위, ${verdictLabel(item.verdict)}, 미리보기`}
                  onClick={() => onPreview(item.symbol)}
                >
                  {item.symbol}
                </button>
              </td>
              <td className="company-column">{item.company_name || "—"}</td>
              <td className={`verdict-cell ${verdictClass(item.verdict)}`}>{verdictLabel(item.verdict)}</td>
              <td className="number-cell score-cell">{formatNumber(item.score)}</td>
              <td className="number-cell muted-number">{formatPrice(item.screening_price)}</td>
              <td className={`number-cell delta-column ${transitionTone(transition)}`}>
                {transitionLabel(transition)}
              </td>
              <td className="row-action-cell">
                <button type="button" onClick={() => onOpenDetail(item.symbol)} aria-label={`${item.symbol}, ${item.company_name || "회사명 미수록"}, ${item.recommendation_rank}위, ${verdictLabel(item.verdict)}, 상세 보기`}>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </td>
            </tr>
          );})}
        </tbody>
      </table>
      <ol className="recommendation-mobile-list" aria-label="공식 추천 목록">
        {recommendations.map((item) => {
          const transition = transitions?.get(item.symbol);
          return (
          <li key={`mobile:${item.run_id}:${item.signal_id || item.symbol}`}>
            <button
              type="button"
              className={item.symbol === selectedSymbol ? "is-selected" : ""}
              aria-current={item.symbol === selectedSymbol ? "true" : undefined}
              aria-label={`${item.symbol}, ${item.company_name || "회사명 미수록"}, ${item.recommendation_rank}위, ${verdictLabel(item.verdict)}, 상세 보기`}
              onClick={() => onOpenDetail(item.symbol)}
            >
              <span className="mobile-rank">{String(item.recommendation_rank).padStart(2, "0")}</span>
              <span className="mobile-security">
                <strong>{item.symbol}</strong>
                <small>{item.company_name || "회사명 미수록"}</small>
                <span className={verdictClass(item.verdict)}>{verdictLabel(item.verdict)}</span>
              </span>
              <span className="mobile-numbers">
                <strong><small>점수</small>{formatNumber(item.score)}</strong>
                <span className={transitionTone(transition)}><small>직전 대비</small>{transitionLabel(transition)}</span>
              </span>
              <ChevronRight size={22} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </li>
        );})}
      </ol>
      {recommendations.length === 0 ? (
        <div className="empty-list">현재 실행에서 검색 조건과 일치하는 종목이 없습니다.</div>
      ) : null}
    </div>
  );
}

function FactTape({ items, className = "" }) {
  const visible = items.filter((item) => hasValue(item.value));
  if (!visible.length) return null;
  return (
    <dl className={`fact-tape ${className}`}>
      {visible.map((item) => (
        <div key={`${item.label}:${item.value}`}>
          <dt>{item.label}</dt>
          <dd className={item.tone ? `is-${item.tone}` : ""} title={String(item.value)}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceList({ items, limit = null }) {
  const visible = (limit ? items.slice(0, limit) : items).filter((item) => hasValue(item.value));
  if (!visible.length) return null;
  return (
    <ul className="evidence-list">
      {visible.map((item, index) => (
        <li key={`${item.label}:${item.value}:${index}`}>
          <strong>{item.label}</strong>
          <span>{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function RiskList({ risks, limit = null }) {
  const visible = (limit ? risks.slice(0, limit) : risks).filter((item) => hasValue(item.value));
  if (!visible.length) return null;
  return (
    <ul className="risk-list">
      {visible.map((item, index) => (
        <li key={`${item.label}:${item.value}:${index}`}>
          <strong>{humanizeRiskLabel(item.label)}</strong>
          <span>{humanizeRiskValue(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function SymbolTimelineTable({ timeline, limit = 10 }) {
  const entries = (timeline?.entries || []).slice(0, limit);
  if (!entries.length) return null;
  return (
    <div className="symbol-timeline-wrap">
      <table className="symbol-timeline-table">
        <thead>
          <tr><th>DATE</th><th>STATE</th><th>GAP</th><th>RANK</th><th>SCORE</th><th>Δ SCORE</th><th>STREAK</th></tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.runId}:${entry.status}`}>
              <td>{formatDate(entry.reportDate || entry.reportCreatedAt)}</td>
              <td className={`timeline-state is-${entry.status.toLowerCase()}`}>{entry.status}</td>
              <td>{entry.missingRunCount ? `${entry.missingRunCount} RUNS` : "—"}</td>
              <td>{entry.currentRank ?? "—"}</td>
              <td>{formatNumber(entry.currentScore)}</td>
              <td>{entry.status === "NEW" ? "—" : formatSigned(entry.scoreDelta)}</td>
              <td>{entry.status === "EXIT" ? "종료" : `${entry.streak}회`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailPanel({ recommendation, strategy, run, timeline, onClose, onOpenFull, compact = false, full = false }) {
  if (!recommendation) {
    return <aside className="detail-panel empty-detail">종목을 선택하면 상세 근거가 표시됩니다.</aside>;
  }
  const detail = getRecommendationDetail(recommendation);
  const hasCurrentPrice = hasValue(recommendation.current_price);
  const displayCurrentPrice = hasCurrentPrice ? formatPrice(recommendation.current_price) : "업데이트 대기";
  const latestTimeline = timeline?.entries?.find((entry) => entry.recommendation) || null;
  const factItems = [
    { label: "RSI14", value: hasValue(detail.timing?.rsi14) ? formatNumber(detail.timing.rsi14, 1) : null },
    { label: "HEAT", value: HEAT_LABELS[detail.timing?.heat] || detail.timing?.heat, tone: detail.timing?.heat === "high" ? "amber" : null },
    { label: "WARNING", value: detail.timing?.warning, tone: detail.timing?.warning ? "negative" : null },
    { label: "PRICE AS OF", value: detail.timing?.price_as_of },
    { label: "SELECTED AS OF", value: recommendation.screening_price_as_of },
    { label: "SELECTION BASIS", value: priceBasisLabel(recommendation.screening_price_basis) },
    { label: "CLOSE BASIS", value: priceBasisLabel(recommendation.current_price_basis) },
    { label: "SECTOR", value: recommendation.sector },
    { label: "INDUSTRY", value: recommendation.industry },
    { label: "CONFIDENCE", value: humanizeConfidence(recommendation.confidence) },
    { label: "APPEARANCE", value: timeline?.selectedRunCount ? `${timeline.selectedRunCount} / ${timeline.totalRunCount} RUNS` : null },
    { label: "CURRENT STREAK", value: timeline?.currentStreak ? `${timeline.currentStreak}회` : null },
    { label: "PREVIOUS RANK", value: latestTimeline?.previousRank },
  ];
  const knownFacts = [
    { label: "공식 순위", value: String(recommendation.recommendation_rank).padStart(2, "0") },
    { label: "전략 점수", value: formatNumber(recommendation.score) },
    { label: "최근 종가", value: displayCurrentPrice },
    { label: "선정 당시 가격", value: formatPrice(recommendation.screening_price) },
    { label: "후보 상태", value: verdictLabel(recommendation.verdict) },
    ...detail.metrics,
  ];

  if (full) {
    return (
      <article className="detail-dossier dossier-v2" aria-label={`${recommendation.symbol} 전체 상세`}>
        <header className="dossier-hero">
          <div>
            <p>{strategy || recommendation.strategy} · {STRATEGIES[strategy || recommendation.strategy]?.label || recommendation.strategy}</p>
            <h1>{recommendation.symbol}</h1>
            {recommendation.company_name ? <span>{recommendation.company_name}</span> : null}
          </div>
          <dl>
            <div><dt>RANK</dt><dd>{String(recommendation.recommendation_rank).padStart(2, "0")}</dd></div>
            <div><dt>후보 상태</dt><dd className={verdictClass(recommendation.verdict)}>{verdictLabel(recommendation.verdict)}</dd></div>
            <div><dt>전략 점수</dt><dd>{formatNumber(recommendation.score)}</dd></div>
            <div><dt>최근 종가</dt><dd>{displayCurrentPrice}{hasCurrentPrice ? <small className="metric-as-of">{recommendation.current_price_as_of} 기준</small> : null}</dd></div>
            <div><dt>DATE</dt><dd>{formatDate(run?.report_date || run?.report_created_at)}</dd></div>
          </dl>
        </header>
        <div className="dossier-grid">
          <section className="dossier-block">
            <h2>선정 요약</h2>
            <p>{detail.hasRichDetail ? detail.summary : `${recommendation.symbol}는 ${formatDate(run?.report_date || run?.report_created_at)} ${strategy || recommendation.strategy} 공식 실행에서 ${recommendation.recommendation_rank}위, ${formatNumber(recommendation.score)}점으로 선정됐습니다.`}</p>
            {detail.catalyst ? <EvidenceList items={[{ label: "CATALYST", value: detail.catalyst }]} /> : null}
          </section>

          <section className="dossier-block">
            <h2>확인할 지표</h2>
            <EvidenceList items={detail.drivers.length ? detail.drivers : knownFacts} />
          </section>

          {detail.risks.length ? (
            <section className="dossier-block">
              <h2>위험 · 무효화</h2>
              <RiskList risks={detail.risks} />
            </section>
          ) : null}

          {detail.scoreBreakdown?.dimensions?.length ? (
            <section className="dossier-block">
              <h2>점수 구성</h2>
              <EvidenceList items={detail.scoreBreakdown.dimensions.map((item) => ({ label: item.label, value: formatCompactNumber(item.value) }))} />
            </section>
          ) : null}

          <section className="dossier-block is-wide">
            <h2>종목 이력 <span className="section-inline-note">{timeline?.selectedRunCount || 0}회 선정 · 최장 {timeline?.maxStreak || 0}회 연속</span></h2>
            <SymbolTimelineTable timeline={timeline} />
          </section>
        </div>

        <section className="dossier-facts" aria-labelledby="dossier-facts-title">
          <h2 id="dossier-facts-title">실행 당시 핵심 지표</h2>
          <FactTape items={factItems} />
        </section>

        <details className="provenance-details">
          <summary>근거 출처와 실행 계보</summary>
          <p>{detail.hasRichDetail
            ? detail.detailProvenance
              ? "보관된 compact audit 수치를 공개 규칙으로 구조화한 상세입니다."
              : "실행 당시 보관된 원본 수치를 공개 규칙으로 구조화한 상세입니다."
            : "이 과거 실행은 순위·점수·가격·위험 플래그 범위에서만 보관됐습니다."}</p>
          <dl>
            <div><dt>실행 ID</dt><dd>{run?.run_id || recommendation.run_id || "—"}</dd></div>
            <div><dt>신호 ID</dt><dd>{recommendation.signal_id || "—"}</dd></div>
            <div><dt>보고 시각</dt><dd>{formatKst(run?.report_created_at)}</dd></div>
            <div><dt>소스 SHA</dt><dd>{run?.sha || run?.commit_sha || recommendation.source_sha || "—"}</dd></div>
            <div><dt>선정 가격 기준</dt><dd>{priceBasisLabel(recommendation.screening_price_basis) || "보관값"}{recommendation.screening_price_as_of ? ` · ${recommendation.screening_price_as_of}` : ""}</dd></div>
            <div><dt>최근 종가 기준</dt><dd>{priceBasisLabel(recommendation.current_price_basis) || "—"}{recommendation.current_price_as_of ? ` · ${recommendation.current_price_as_of}` : ""}</dd></div>
          </dl>
        </details>
      </article>
    );
  }

  return (
    <aside className={`detail-panel ${compact ? "is-compact" : ""}`} aria-label={`${recommendation.symbol} 미리보기`}>
      {onClose ? (
        <button type="button" className="detail-close" onClick={onClose} aria-label="상세 닫기" autoFocus><X size={20} /></button>
      ) : null}
      <div className="detail-heading">
        <p className="detail-kicker">PREVIEW · {STRATEGIES[strategy || recommendation.strategy]?.label || recommendation.strategy}</p>
        <h2>{recommendation.symbol}</h2>
        <p>{recommendation.company_name || "회사명 미수록"}</p>
      </div>
      <dl className="detail-metrics">
        <div><dt>전략 점수</dt><dd>{formatNumber(recommendation.score)}</dd></div>
        <div><dt>후보 상태</dt><dd className={verdictClass(recommendation.verdict)}>{verdictLabel(recommendation.verdict)}</dd></div>
        <div><dt>최근 종가</dt><dd>{displayCurrentPrice}{hasCurrentPrice ? <small className="metric-as-of">{recommendation.current_price_as_of} 기준</small> : null}</dd></div>
        {recommendation.sector ? <div><dt>SECTOR</dt><dd>{recommendation.sector}</dd></div> : null}
        {recommendation.confidence ? <div><dt>CONFIDENCE</dt><dd>{humanizeConfidence(recommendation.confidence)}</dd></div> : null}
      </dl>
      <section className="detail-summary">
        <h3>SUMMARY</h3>
        <p>{detail.hasRichDetail ? detail.summary : `${formatDate(run?.report_date || run?.report_created_at)} 공식 실행 ${recommendation.recommendation_rank}위 · ${timeline?.selectedRunCount || 1}회 선정 기록`}</p>
      </section>
      <FactTape items={factItems.slice(0, 6)} />
      {!detail.hasRichDetail ? <div className="archive-notice"><strong>과거 기록</strong><p>이 실행에는 상세 설명이 없어 보관된 수치와 위험 신호만 표시합니다.</p></div> : null}
      <RiskList risks={detail.risks} limit={3} />
      {onOpenFull ? (
        <button type="button" className="detail-open-full" onClick={onOpenFull}>
          전체 상세 보기 <ChevronRight size={17} aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}

function PerformancePanel({ strategy, performance, backcast, evidenceStatus, range, setRange, benchmark = "QQQ" }) {
  const benchmarkLabel = benchmarkDisplayName(benchmark);
  const officialEvidence = getPerformanceState(performance, evidenceStatus);
  const verifiedAggregate = getVerifiedAggregate(performance, strategy, range);
  const reconstructed = getBackcastCell(backcast, strategy, range);
  const aggregate = verifiedAggregate || reconstructed.aggregate;
  const source = verifiedAggregate ? "VERIFIED" : reconstructed.aggregate ? "RECONSTRUCTED" : null;
  const selectedOfficialStatus = officialEvidence.horizonStatuses.find(
    (item) => item.strategy === strategy && String(item.horizon).toUpperCase() === range,
  );
  const runSeries = source === "VERIFIED"
    ? (performance?.run_series || []).filter((item) => (
      item.strategy === strategy && String(item.horizon).toUpperCase() === range && item.status === "VERIFIED"
    )).sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)))
    : reconstructed.runSeries;
  const signals = source === "VERIFIED"
    ? (performance?.signals || []).filter((item) => (
      item.strategy === strategy && String(item.horizon).toUpperCase() === range && item.status === "VERIFIED"
    ))
    : reconstructed.signals;
  const selectedStatus = source === "VERIFIED" ? selectedOfficialStatus : reconstructed.horizonStatus;
  const expectedSignals = strategy === "MLG" ? 10 : 5;
  const completeRuns = Number(selectedStatus?.complete_run_count ?? aggregate?.run_count ?? runSeries.length ?? 0);
  const strategyReturn = Number(aggregate?.equal_weight_return);
  const benchmarkReturn = Number(aggregate?.qqq_equal_weight_return);
  const excessReturn = Number(aggregate?.equal_weight_excess_return);
  const benchmarkWinCount = runSeries.filter((item) => Number(item.excess_return) > 0).length;
  const sourceLabel = source === "VERIFIED" ? "공식 측정" : source === "RECONSTRUCTED" ? "과거 실행 역산" : "측정 대기";
  const sourceVariant = source === "VERIFIED" ? "green" : source === "RECONSTRUCTED" ? "cyan" : "neutral";
  const entryBasisLabel = source === "VERIFIED"
    ? "공식 공개 이후 첫 정규장"
    : "저장소 확정 이후 첫 정규장(역산)";
  const horizonBasisCopy = source === "RECONSTRUCTED"
    ? `저장소 확정 이후 첫 정규장부터 ${range.replace("D", "거래일")} 동일가중 참고 성과`
    : `공식 추천 공개 이후 ${range.replace("D", "거래일")} 동일가중 성과`;
  return (
    <section className="performance-panel performance-panel-v2" aria-labelledby="performance-title">
      <header className="performance-panel-header">
        <div>
          <p>{range} BENCHMARK SNAPSHOT</p>
          <h2 id="performance-title">{strategy} vs {benchmarkLabel}</h2>
        </div>
        <Badge variant={sourceVariant} label={sourceLabel} />
      </header>

      <div className="performance-controls">
        <div>
          <span>관측 기간</span>
          <SegmentedControl value={range} onChange={setRange} label="성과 관측 기간" size="md" layout="fill">
            {HORIZONS.map((item) => <SegmentedControlItem key={item} value={item} label={item.replace("D", "일")} />)}
          </SegmentedControl>
        </div>
        <p>{horizonBasisCopy}</p>
      </div>

      <div id={`performance-panel-${strategy}`} role="region" aria-live="polite">
        {aggregate ? (
          <>
            <section className="performance-result" aria-label={`${strategy} ${range} 비교 결과`}>
              <div className="performance-result-copy">
                <p><strong>{strategy} <span className={returnTone(strategyReturn)}>{formatPercent(strategyReturn)}</span></strong><span>vs</span><strong>{benchmarkLabel} <span className={returnTone(benchmarkReturn)}>{formatPercent(benchmarkReturn)}</span></strong></p>
                <h3 className={returnTone(excessReturn)}><BenchmarkComparisonCopy benchmarkLabel={benchmarkLabel} excessReturn={excessReturn} /></h3>
              </div>
              <dl className="performance-kpis">
                <div><dt>절대수익</dt><dd className={returnTone(strategyReturn)}>{formatPercent(strategyReturn)}</dd></div>
                <div><dt>{benchmarkLabel} 대비</dt><dd className={returnTone(excessReturn)}>{formatPercentPoints(excessReturn)}</dd></div>
                <div><dt>실행 완료</dt><dd>{completeRuns}회</dd></div>
                <div><dt>실행별 우위</dt><dd>{benchmarkWinCount} / {completeRuns}회</dd></div>
              </dl>
            </section>

            <ReturnComparisonChart points={runSeries} strategy={strategy} benchmark={benchmarkLabel} horizon={range} />

            <div className="performance-table-wrap">
              <table className="performance-run-table">
                <thead><tr><th>실행일</th><th>{strategy}</th><th>{benchmarkLabel}</th><th>{benchmarkLabel} 대비</th><th>관측 종목</th></tr></thead>
                <tbody>
                  {runSeries.map((item) => (
                    <tr key={`${item.run_id}:${item.report_date}`}>
                      <td data-label="실행일"><span>{item.report_date}</span><small>RUN {item.run_id}</small></td>
                      <td data-label={strategy}>{formatPercent(item.strategy_return)}</td>
                      <td data-label={benchmarkLabel}>{formatPercent(item.qqq_return)}</td>
                      <td data-label={`${benchmarkLabel} 대비`} className={returnTone(item.excess_return)}>{formatPercentPoints(item.excess_return)}</td>
                      <td data-label="관측 종목">{item.signal_count} / {expectedSignals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="signals-details">
              <summary>{source === "VERIFIED" ? "검증" : "역산"} 종목 {signals.length}건 <small>· 진입 기준 {entryBasisLabel}</small></summary>
              {signals.length ? (
                <div className="signals-table-wrap">
                  <table>
                    <thead><tr><th>종목</th><th>진입일</th><th>측정일</th><th>수익률</th><th>초과</th></tr></thead>
                    <tbody>{signals.map((item) => (
                      <tr key={`${item.run_id}:${item.signal_id}:${item.horizon}`}>
                        <th scope="row" data-label="종목">{item.symbol}</th><td data-label="진입일">{item.entry_session}</td><td data-label="측정일">{item.measurement_session}</td>
                        <td data-label="수익률">{formatPercent(item.signal_return)}</td><td data-label="초과">{formatPercentPoints(item.excess_return)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : null}
            </details>

            <details className="calculation-details">
              <summary>산정 방식 및 데이터 등급</summary>
              <div>
                <p>진입 기준은 {entryBasisLabel}입니다. 동일한 진입·측정 세션의 {benchmarkLabel}과 비교하며, 실행당 {expectedSignals}종목 전체가 갖춰진 경우만 동일가중 평균에 포함합니다. 수수료와 슬리피지는 반영하지 않습니다.</p>
                <dl>
                  <div><dt>현재 표시</dt><dd>{sourceLabel}</dd></div>
                  <div><dt>공식 성과 상태</dt><dd>{officialEvidence.level}</dd></div>
                  <div><dt>최신 측정일</dt><dd>{aggregate.measurement_session_max || "—"}</dd></div>
                  <div><dt>근거 코드</dt><dd>{source === "RECONSTRUCTED" ? "REPOSITORY-BOUND" : officialEvidence.reason}</dd></div>
                </dl>
              </div>
            </details>
          </>
        ) : (
          <div className="performance-empty">
            <strong>{strategy} {range} 성과는 아직 측정 중입니다.</strong>
            <p>{expectedSignals}개 추천과 {benchmarkLabel}의 같은 거래일 가격이 모두 모이면 자동으로 표시됩니다.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SelectionView({ payload, index, strategy, query, setQuery, selectedRunId, selectedSymbol, onSelectSymbol, onOpenDetail, onLatest, onStrategy }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tabletDetailTriggerRef = useRef(null);
  const tabletDrawerRef = useRef(null);
  const { latestRun, currentRun, requestedRunMissing } = useMemo(
    () => resolveSelectedRun(payload.runs, strategy, selectedRunId),
    [payload.runs, selectedRunId, strategy],
  );
  const allRecommendations = useMemo(
    () => currentRun ? getIndexedRunRecommendations(index, strategy, currentRun.run_id) : [],
    [currentRun, index, strategy],
  );
  const recommendations = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) return allRecommendations;
    return allRecommendations.filter((item) => (
      `${item.symbol} ${item.company_name || ""}`.toUpperCase().includes(normalizedQuery)
    ));
  }, [allRecommendations, query]);
  const resolvedSelected = recommendations.find((item) => item.symbol === selectedSymbol)
    || recommendations[0]
    || null;
  const runChanges = getIndexedRunChanges(index, strategy, currentRun?.run_id);
  const transitions = new Map(
    (runChanges?.transitions || [])
      .filter((item) => item.recommendation)
      .map((item) => [item.symbol, item]),
  );
  const selectedTimeline = resolvedSelected ? getSymbolTimeline(index, strategy, resolvedSelected.symbol) : null;
  const isHistorical = Boolean(currentRun && latestRun && String(currentRun.run_id) !== String(latestRun.run_id));
  const richDetailCount = Number(currentRun.detail_coverage?.complete_count
    ?? allRecommendations.filter((item) => getRecommendationDetail(item).hasRichDetail).length);

  useEffect(() => {
    setDrawerOpen(false);
  }, [strategy, selectedRunId]);

  function closeTabletDrawer() {
    setDrawerOpen(false);
    requestAnimationFrame(() => tabletDetailTriggerRef.current?.focus());
  }

  function handleDrawerKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTabletDrawer();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...tabletDrawerRef.current.querySelectorAll("button, [href], input, [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!currentRun) {
    return (
      <section className="secondary-view empty-route-state">
        <p>GENERAL / {strategy}</p>
        {requestedRunMissing ? (
          <>
            <h1>요청한 실행을 찾을 수 없습니다.</h1>
            <span>이 실행 ID는 현재 보관 데이터에 없으므로 최신 목록으로 자동 변경하지 않았습니다.</span>
            <button type="button" className="route-back" onClick={onLatest}>최신 실행으로</button>
          </>
        ) : null}
        <div hidden={requestedRunMissing}>
        <h1>공식 실행이 아직 없습니다.</h1>
        <span>엔진이 검증된 실행을 게시하면 추천 목록이 표시됩니다.</span>
        </div>
      </section>
    );
  }

  return (
    <div className="selection-view">
      <section className="screener-mode-bar" aria-label="스크리너 선택">
        <div>
          <p>SCREENER MODE</p>
        </div>
        <StrategyModeControl strategy={strategy} onChange={onStrategy} />
      </section>
      <section className="run-header">
        <div className="run-title-row">
          <div>
            <h1>
              <span>{strategy}</span>
              <span className="run-date">· {formatDate(currentRun.report_date || currentRun.report_created_at)}</span>
            </h1>
            <p className="strategy-descriptor">{STRATEGIES[strategy].label}</p>
          </div>
        </div>
        {isHistorical ? <p className="run-provenance">과거 실행 · RUN {currentRun.run_id}</p> : null}
        {isHistorical ? (
          <div className="historical-banner" role="status">
            <span>과거 실행을 보고 있습니다. 최신 추천과 혼동하지 마세요.</span>
            <button type="button" onClick={onLatest}>최신 실행으로</button>
          </div>
        ) : null}
        {isHistorical ? (
          <div className="run-tape" aria-label="과거 실행 정보">
            <span><strong>{allRecommendations.length}</strong>개 선정</span>
            <span>RUN <strong>{currentRun.run_id}</strong></span>
            <span>상세 설명 <strong>{richDetailCount} / {allRecommendations.length}</strong></span>
          </div>
        ) : null}
      </section>

      <div className="selection-content">
        <section className="table-panel" aria-labelledby="current-selection-title">
          <div className="section-heading-row table-heading">
            <h2 id="current-selection-title">{isHistorical ? "과거 실행 종목" : "현재 선정 종목"}</h2>
            {query ? <span className="row-hint" aria-live="polite">{recommendations.length} / {allRecommendations.length}개 일치</span> : null}
          </div>
          <div className="selection-filter">
            <TextInput
              label="현재 실행 종목 필터"
              isLabelHidden
              value={query}
              onChange={setQuery}
              placeholder="종목 또는 회사 검색"
              startIcon={<Search size={16} strokeWidth={1.8} />}
              hasClear
              width="100%"
              size="md"
            />
          </div>
          <RecommendationTable
            recommendations={recommendations}
            selectedSymbol={resolvedSelected?.symbol}
            transitions={transitions}
            onPreview={onSelectSymbol}
            onOpenDetail={(symbol) => onOpenDetail(currentRun.run_id, symbol)}
          />
        </section>
        <div className="desktop-detail">
          <DetailPanel
            recommendation={resolvedSelected}
            strategy={strategy}
            run={currentRun}
            timeline={selectedTimeline}
            onOpenFull={() => resolvedSelected && onOpenDetail(currentRun.run_id, resolvedSelected.symbol)}
          />
        </div>
        <button
          type="button"
          className="tablet-detail-trigger"
          ref={tabletDetailTriggerRef}
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="tablet-detail-drawer"
          aria-label={`${resolvedSelected?.symbol || "종목"} 상세 열기`}
        >
          <PanelRightOpen size={18} />
          <span>{resolvedSelected?.symbol || "종목"} 상세</span>
        </button>
        {drawerOpen ? (
          <>
            <button type="button" className="drawer-backdrop" aria-label="상세 닫기" onClick={closeTabletDrawer} />
            <div
              id="tablet-detail-drawer"
              ref={tabletDrawerRef}
              className="tablet-detail-drawer is-open"
              role="dialog"
              aria-modal="true"
              aria-label={`${resolvedSelected?.symbol || "종목"} 상세`}
              onKeyDown={handleDrawerKeyDown}
            >
              <DetailPanel
                recommendation={resolvedSelected}
                strategy={strategy}
                run={currentRun}
                timeline={selectedTimeline}
                onClose={closeTabletDrawer}
                onOpenFull={() => resolvedSelected && onOpenDetail(currentRun.run_id, resolvedSelected.symbol)}
                compact
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function OverviewView({ payload, index, lastSeen, onStrategy, onOpenDetail, onPerformance, onHistory }) {
  const latestRuns = Object.keys(STRATEGIES).map((strategy) => {
    const strategyRuns = index.runsByStrategy.get(strategy) || [];
    const run = strategyRuns[0] || null;
    const picks = run ? getIndexedRunRecommendations(index, strategy, run.run_id) : [];
    const seenIndex = strategyRuns.findIndex((item) => String(item.run_id) === String(lastSeen?.[strategy]));
    const comparisonRun = seenIndex > 0 ? strategyRuns[seenIndex]
      : seenIndex === 0 ? strategyRuns[0]
        : strategyRuns[1] || null;
    const comparisonPicks = comparisonRun ? getIndexedRunRecommendations(index, strategy, comparisonRun.run_id) : [];
    const currentBySymbol = new Map(picks.map((item) => [item.symbol, item]));
    const previousBySymbol = new Map(comparisonPicks.map((item) => [item.symbol, item]));
    const added = picks.filter((item) => !previousBySymbol.has(item.symbol)).map((item) => item.symbol);
    const removed = comparisonPicks.filter((item) => !currentBySymbol.has(item.symbol)).map((item) => item.symbol);
    const retained = picks.filter((item) => previousBySymbol.has(item.symbol));
    const rankUp = retained.filter((item) => Number(previousBySymbol.get(item.symbol)?.recommendation_rank) > Number(item.recommendation_rank)).length;
    const rankDown = retained.filter((item) => Number(previousBySymbol.get(item.symbol)?.recommendation_rank) < Number(item.recommendation_rank)).length;
    return {
      strategy,
      run,
      picks,
      added,
      removed,
      retained,
      rankUp,
      rankDown,
    };
  });
  const backcastAggregates = payload.performance_backcast?.aggregates || [];
  const backcastPreviews = Object.keys(STRATEGIES).map((strategy) => ({
    strategy,
    aggregate: backcastAggregates.find((item) => (
      item.strategy === strategy
      && String(item.horizon).toLowerCase() === "20d"
      && item.status === "RECONSTRUCTED"
    )) || null,
  }));
  const hasBackcastPreview = backcastPreviews.some((item) => item.aggregate);
  const benchmarkLabel = benchmarkDisplayName(payload.benchmark);
  return (
    <section className="secondary-view overview-view overview-v2">
      <header className="overview-page-header">
        <h1>최근 변경 사항</h1>
        <button type="button" className="overview-history-link" onClick={onHistory}>
          실행 기록 <ChevronRight size={16} aria-hidden="true" />
        </button>
      </header>

      <section className="since-visit" aria-label="최근 실행 변화">
        <div className="visit-strategies">
          {latestRuns.map((item) => (
            <button type="button" className="visit-strategy" key={item.strategy} onClick={() => onStrategy(item.strategy)} disabled={!item.run}>
              <span className="visit-strategy-heading">
                <strong>{item.strategy}</strong><span>{STRATEGIES[item.strategy].label}</span>
                {item.run ? <small className="visit-updated-badge">{formatMonthDay(item.run.report_date || item.run.report_created_at)} Updated</small> : null}
              </span>
              <dl className="visit-changes">
                <div><dt>새 진입</dt><dd className={`is-added${item.added.length ? " has-change" : ""}`}>{item.added.length ? `+ ${item.added.join(" · ")}` : "없음"}</dd></div>
                <div><dt>제외</dt><dd className={`is-removed${item.removed.length ? " has-change" : ""}`}>{item.removed.length ? `− ${item.removed.join(" · ")}` : "없음"}</dd></div>
                <div><dt>유지 / 순위</dt><dd>{item.retained.length} · ↑{item.rankUp} ↓{item.rankDown}</dd></div>
              </dl>
            </button>
          ))}
        </div>
        <footer className="since-visit-footer">
          <button type="button" onClick={onHistory}>전체 실행 기록 <ChevronRight size={16} aria-hidden="true" /></button>
        </footer>
      </section>

      <div className="overview-working-grid">
        <section className="latest-selection-mini">
          <header><h2>최신 상위 종목</h2></header>
          <div className="mini-strategy-grid">
            {latestRuns.map((item) => (
              <section className="mini-strategy-card" key={item.strategy} aria-label={`${item.strategy} 상위 종목`}>
                <header>
                  <div><strong>{item.strategy}</strong><span>{STRATEGIES[item.strategy].label}</span></div>
                  <button type="button" onClick={() => onStrategy(item.strategy)}>전체 보기 <ChevronRight size={14} /></button>
                </header>
                <ol>
                  {item.picks.slice(0, 3).map((pick) => (
                    <li key={`${item.strategy}:${pick.run_id}:${pick.symbol}`}>
                      <button type="button" onClick={() => onOpenDetail(item.strategy, item.run.run_id, pick.symbol)}>
                        <span>{String(pick.recommendation_rank).padStart(2, "0")}</span>
                        <strong>{pick.symbol}</strong>
                        <span className="mini-company">{pick.company_name || ""}</span>
                        <span className={verdictClass(pick.verdict)}>{verdictLabel(pick.verdict)}</span>
                        <b>{formatNumber(pick.score)}</b>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>

        <section className="backcast-preview">
          <header><h2>{hasBackcastPreview ? "스크리너 성과" : "성과 비교 준비 중"}</h2>{hasBackcastPreview ? <Badge variant="cyan" label="과거 실행 역산" /> : null}</header>
          <div className="backcast-preview-body">
            <div className="backcast-performance-list">
              {backcastPreviews.map(({ strategy, aggregate }) => (
                <section className="backcast-performance-item" key={strategy} aria-label={`${strategy} 20일 성과`}>
                  {aggregate ? (
                    <>
                      <p className="backcast-comparison-line">
                        <strong>{aggregate.strategy} {String(aggregate.horizon).toUpperCase()} <span className={returnTone(aggregate.equal_weight_return)}>{formatPercent(aggregate.equal_weight_return)}</span></strong>
                        <span>vs</span>
                        <strong>{benchmarkLabel} <span className={returnTone(aggregate.qqq_equal_weight_return)}>{formatPercent(aggregate.qqq_equal_weight_return)}</span></strong>
                      </p>
                      <p className={`backcast-outcome ${returnTone(aggregate.equal_weight_excess_return)}`}>
                        <BenchmarkComparisonCopy benchmarkLabel={benchmarkLabel} excessReturn={aggregate.equal_weight_excess_return} />
                      </p>
                      <span className="backcast-meta">완전 실행 {aggregate.run_count || "—"}회 · 종목 관측 {aggregate.underlying_signal_count || "—"}건</span>
                    </>
                  ) : (
                    <>
                      <p className="backcast-comparison-line"><strong>{strategy} 20D</strong></p>
                      <p className="backcast-pending">완전한 실행 단위의 가격 관측을 기다리고 있습니다.</p>
                    </>
                  )}
                </section>
              ))}
            </div>
            <button type="button" className="backcast-open" onClick={() => onPerformance("MLG")}>성과 자세히 <ChevronRight size={16} /></button>
          </div>
        </section>
      </div>
    </section>
  );
}

function ChangeSummary({ summary }) {
  if (!summary || summary.isBaseline) return <span className="history-change is-baseline">기준 실행</span>;
  return (
    <span className="history-change" aria-label={`신규 ${summary.added.length}, 제외 ${summary.removed.length}, 유지 ${summary.retained.length}`}>
      <i className="is-added">신규 {summary.added.length}</i>
      <i className="is-removed">제외 {summary.removed.length}</i>
      <i>유지 {summary.retained.length}</i>
    </span>
  );
}

function HistoryView({ payload, index, onStrategy }) {
  const [filter, setFilter] = useState("ALL");
  const [historyQuery, setHistoryQuery] = useState("");
  const runs = index.runs;
  const latestRunIds = useMemo(() => new Set(
    Object.keys(STRATEGIES)
      .map((strategy) => runs.find((run) => run.strategy === strategy))
      .filter(Boolean)
      .map((run) => `${run.strategy}:${run.run_id}`),
  ), [runs]);
  const filteredRuns = searchHistoryRuns(index, { strategy: filter, query: historyQuery });

  return (
    <section className="secondary-view history-view">
      <header>
        <h1>실행 기록</h1>
      </header>
      <div className="history-controls">
        <div className="history-filter" role="group" aria-label="엔진 필터">
          {["ALL", "MLG", "TENX"].map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "is-active" : ""}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <TextInput
          label="실행 기록 검색"
          isLabelHidden
          value={historyQuery}
          onChange={setHistoryQuery}
          placeholder="종목·회사·실행 ID·날짜 검색"
          startIcon={<Search size={16} />}
          hasClear
          width="100%"
          size="md"
        />
        <p className="history-result-count" aria-live="polite">전체 {filteredRuns.length}건</p>
      </div>
      <div className="history-column-head" aria-hidden="true">
        <span>전략</span>
        <span>실행일</span>
        <span>실행 정보</span>
        <span>구성 변화</span>
        <span>결과</span>
        <span />
      </div>
      <div className="history-list-v2">
        {filteredRuns.map((run) => {
          const picks = getIndexedRunRecommendations(index, run.strategy, run.run_id);
          const summary = getIndexedRunChanges(index, run.strategy, run.run_id);
          const isLatest = latestRunIds.has(`${run.strategy}:${run.run_id}`);
          return (
            <button type="button" className="history-run" key={`${run.strategy}:${run.run_id}`} onClick={() => onStrategy(run.strategy, run.run_id)}>
              <span className="history-engine">{run.strategy}</span>
              <span className="history-date">{formatDate(run.report_date || run.report_created_at)} {isLatest ? <b>최신</b> : null}</span>
              <span className="history-id">RUN {run.run_id} · {picks.length}개 선정</span>
              <span className="history-symbols">
                {summary?.isBaseline ? `기준 실행 · ${picks.map((item) => item.symbol).join(" · ")}` : (
                  summary?.added.length || summary?.removed.length ? (
                    <>
                      {summary.added.length ? <i className="is-added">+ {summary.added.join(" · ")}</i> : null}
                      {summary.added.length && summary.removed.length ? " / " : null}
                      {summary.removed.length ? <i className="is-removed">− {summary.removed.join(" · ")}</i> : null}
                    </>
                  ) : <i className="is-unchanged">변동 없음</i>
                )}
              </span>
              <ChangeSummary summary={summary} />
              <ChevronRight size={19} />
            </button>
          );
        })}
        {!filteredRuns.length ? <div className="empty-list">조건과 일치하는 실행 기록이 없습니다.</div> : null}
      </div>
    </section>
  );
}

function StandalonePerformanceView({ payload, strategy, onStrategy }) {
  const [range, setRange] = useState("20D");
  return (
    <section className="secondary-view performance-view">
      <header>
        <h1>벤치마크 비교</h1>
      </header>
      <div className="performance-strategy-control">
        <span>비교 전략</span>
        <StrategyModeControl strategy={strategy} onChange={onStrategy} label="성과 비교 전략" />
      </div>
      <PerformancePanel
        strategy={strategy}
        performance={payload.performance}
        backcast={payload.performance_backcast}
        evidenceStatus={payload.evidence_status}
        benchmark={payload.benchmark}
        range={range}
        setRange={setRange}
      />
    </section>
  );
}

function MethodologyView({ benchmark, section, onSection }) {
  const benchmarkLabel = benchmarkDisplayName(benchmark);
  const activeTitle = {
    mlg: "MLG 스크리닝 로직",
    tenx: "TENX 스크리닝 로직",
    performance: `${benchmarkLabel} 수익률 산정`,
    operations: "자동 업데이트와 운영",
  }[section];

  return (
    <section className="secondary-view methodology-view">
      <header>
        <h1>스크리닝 및 성과 산정 방식</h1>
        <span>무엇을 걸러내고, 어떻게 순위를 만들며, 성과가 언제 업데이트되는지 설명합니다.</span>
      </header>

      <div className="method-tabs">
        <TabList value={section} onChange={onSection} size="lg" layout="fill" hasDivider aria-label="방법론 항목">
          <Tab value="mlg" label="MLG 로직" />
          <Tab value="tenx" label="TENX 로직" />
          <Tab value="performance" label="수익률 산정" />
          <Tab value="operations" label="시스템 운영" />
        </TabList>
      </div>

      <div className="method-panel" role="region" aria-label={activeTitle}>
        {section === "mlg" ? (
          <>
            <section className="method-hero-card">
              <div><p>MLG</p><h2>중대형 성장주 Top 10</h2><span>실적 이력·현금흐름·애널리스트 커버리지가 갖춰진 미국 중대형 성장주를 찾습니다.</span></div>
              <dl><div><dt>기초 규모</dt><dd>시총 $5B+</dd></div><div><dt>정밀 게이트</dt><dd>시총 $10B+</dd></div><div><dt>공식 결과</dt><dd>Top 10</dd></div></dl>
            </section>
            <div className="method-content-grid">
              <section className="method-card is-wide">
                <h3>선별 흐름</h3>
                <ol className="method-steps">
                  <li><b>1</b><div><strong>미국 보통주 풀</strong><span>S&amp;P 500·Russell 1000·Nasdaq·NYSE를 목표로, 주가 $5 이상과 평균 거래량 20만주 이상부터 시작합니다.</span></div></li>
                  <li><b>2</b><div><strong>품질 성장주 회수</strong><span>대형주 앵커, 품질 소프트웨어, AI 플랫폼·인프라와 섹터별 후보를 빠짐없이 모읍니다.</span></div></li>
                  <li><b>3</b><div><strong>경량 점수로 후보 압축</strong><span>매출·EPS 성장, Rule of 40, 향후 전망, ROE와 부채 품질로 정밀 분석 대상을 압축합니다.</span></div></li>
                  <li><b>4</b><div><strong>하드게이트와 최종 순위</strong><span>모든 필수 조건을 통과한 후보만 공식 score 내림차순으로 정렬해 Top 10을 게시합니다.</span></div></li>
                </ol>
              </section>
              <section className="method-card">
                <h3>주요 하드게이트</h3>
                <ul className="method-checks">
                  <li><span>FCF</span><strong>양수</strong></li>
                  <li><span>Rule of 40</span><strong>30% 이상</strong></li>
                  <li><span>매출 성장</span><strong>10% 이상</strong></li>
                  <li><span>EPS 성장</span><strong>20% 이상</strong></li>
                  <li><span>3년 매출 CAGR</span><strong>11% 이상</strong></li>
                  <li><span>전망·부채·SEC</span><strong>무결성 통과</strong></li>
                </ul>
              </section>
              <section className="method-card">
                <h3>최종 점수 100</h3>
                <dl className="method-weights">
                  <div><dt>코어 성장 적합도</dt><dd>20</dd></div><div><dt>EPS 전망</dt><dd>18</dd></div><div><dt>밸류에이션</dt><dd>17</dd></div>
                  <div><dt>매출 전망</dt><dd>15</dd></div><div><dt>해자</dt><dd>10</dd></div><div><dt>애널리스트 신호</dt><dd>8</dd></div>
                  <div><dt>이벤트 품질</dt><dd>6</dd></div><div><dt>부채 품질</dt><dd>4</dd></div><div><dt>컨센서스</dt><dd>2</dd></div>
                </dl>
              </section>
            </div>
            <div className="method-note"><Badge variant="green" label="핵심 후보" /><Badge variant="yellow" label="관찰 후보" /><span>두 라벨은 결과 해석용입니다. 포트폴리오 라벨이나 진입 타이밍 지표가 공식 순위를 다시 매기지는 않습니다.</span></div>
          </>
        ) : null}

        {section === "tenx" ? (
          <>
            <section className="method-hero-card">
              <div><p>TENX</p><h2>텐베거 유망주 Top 5</h2><span>미국 상장 기술·첨단산업에서 5~10년 비대칭성이 있는 초기 성장 후보를 찾습니다.</span></div>
              <dl><div><dt>시가총액</dt><dd>$0.25B–40B</dd></div><div><dt>집중 분석</dt><dd>약 45개</dd></div><div><dt>공식 결과</dt><dd>Top 5</dd></div></dl>
            </section>
            <div className="method-content-grid">
              <section className="method-card is-wide">
                <h3>선별 흐름</h3>
                <ol className="method-steps">
                  <li><b>1</b><div><strong>고성장 기대 섹터</strong><span>소프트웨어·데이터, 반도체·컴퓨트, 기술 플랫폼, 프런티어 기술, 디지털 인프라를 우선 분석합니다.</span></div></li>
                  <li><b>2</b><div><strong>성장성과 지속성 검증</strong><span>성장 가속, 향후 지속성, 주당 총이익 품질, 비대칭성과 데이터 품질을 함께 평가해 분석 대상을 압축합니다.</span></div></li>
                  <li><b>3</b><div><strong>데이터 검증</strong><span>점수에 쓰는 필수 FMP 값의 시점·기간·분기/누적·주식수 기준을 검사합니다. SEC 부재나 비교 불가만으로 제외하지 않습니다. 분기 OCF·FCF·SBC 대조만 미적용됐고 동일 FMP 연간 현금흐름 대체값이 점수 입력으로 선택됐음이 입증되면 경고 후 순위를 계산합니다.</span></div></li>
                  <li><b>4</b><div><strong>종합 점수 상위 5종목</strong><span>성장성·비대칭성·생존력 점수를 합산해 상위 5종목을 선정합니다. 사후 재순위나 대체 충원은 없습니다.</span></div></li>
                </ol>
              </section>
              <section className="method-card">
                <h3>Core v3.1 비중</h3>
                <dl className="method-weights">
                  <div><dt>초기 텐베거 비대칭성</dt><dd>30%</dd></div><div><dt>향후 성장 지속성</dt><dd>25%</dd></div>
                  <div><dt>성장 가속</dt><dd>15%</dd></div><div><dt>주주 경제성</dt><dd>15%</dd></div><div><dt>생존·현금 전환</dt><dd>15%</dd></div>
                  <div><dt>후보 자체 시장 확인</dt><dd>+3점</dd></div>
                </dl>
              </section>
              <section className="method-card">
                <h3>텐베거 경로</h3>
                <p className="method-formula">목표 기업가치 ÷ 합리적 매출배수 → 필요한 5·7·10년 매출 CAGR</p>
                <ul className="method-bullets">
                  <li>현재 시가총액의 10배를 목표값으로 둡니다.</li>
                  <li>엔진이 지지하는 성장률과 필요한 성장률의 차이를 path gap으로 봅니다.</li>
                  <li>{benchmarkLabel}은 TENX 점수 입력에 사용하지 않습니다.</li>
                </ul>
              </section>
            </div>
            <div className="method-note"><Badge variant="green" label="핵심 후보" /><Badge variant="yellow" label="관찰 후보" /><Badge variant="red" label="예비 후보" /><span>공개 판정과 점수 순위는 별도로 계산합니다.</span></div>
          </>
        ) : null}

        {section === "performance" ? (
          <>
            <section className="method-hero-card">
              <div><p>PERFORMANCE</p><h2>{benchmarkLabel}과 같은 거래일로 비교</h2><span>추천 종목과 벤치마크에 동일한 진입·측정 세션을 적용해 20·60·120거래일 성과를 계산합니다.</span></div>
              <dl><div><dt>진입</dt><dd>첫 정규장 시가</dd></div><div><dt>관측</dt><dd>20D · 60D · 120D</dd></div><div><dt>집계</dt><dd>동일가중</dd></div></dl>
            </section>
            <div className="method-content-grid">
              <section className="method-card is-wide">
                <h3>산식</h3>
                <div className="formula-stack">
                  <code>종목 수익률 = 관측일 조정종가 ÷ 진입일 조정시가 − 1</code>
                  <code>{benchmarkLabel} 수익률 = 같은 관측일 조정종가 ÷ 같은 진입일 조정시가 − 1</code>
                  <code>초과수익률 = 전략 수익률 − {benchmarkLabel} 수익률</code>
                </div>
              </section>
              <section className="method-card">
                <h3>집계 순서</h3>
                <ol className="method-numbered">
                  <li>각 추천 종목의 수익률을 계산</li>
                  <li>MLG 10종목·TENX 5종목 전체가 있는 실행만 평균</li>
                  <li>완전한 실행 수익률끼리 다시 단순평균</li>
                  <li>초과수익이 양수인 실행 비율을 {benchmarkLabel} 우위로 표시</li>
                </ol>
              </section>
              <section className="method-card">
                <h3>숫자에 포함되는 조건</h3>
                <ul className="method-bullets">
                  <li>main의 scheduled production 추천</li>
                  <li>종목과 {benchmarkLabel}의 진입·관측 세션 일치</li>
                  <li>양수 가격과 가격 무결성 게이트 통과</li>
                  <li>부분 실행과 아직 성숙하지 않은 기간은 제외</li>
                </ul>
              </section>
            </div>
            <p className="method-note">같은 종목이 여러 실행에서 반복 추천되면 실행별 별도 신호로 계산합니다. 거래비용과 슬리피지는 현재 산식에 포함하지 않습니다.</p>
          </>
        ) : null}

        {section === "operations" ? (
          <>
            <section className="method-hero-card">
              <div><p>OPERATIONS</p><h2>엔진 실행부터 암호화 게시까지</h2><span>프론트엔드는 외부 데이터 API를 직접 호출하지 않고, 검증된 저장소 이력을 암호화한 데이터만 읽습니다.</span></div>
              <dl><div><dt>MLG</dt><dd>수·토 09:00</dd></div><div><dt>TENX</dt><dd>화·금 09:00</dd></div><div><dt>가격 백필</dt><dd>화–토 07:30</dd></div></dl>
            </section>
            <div className="method-content-grid">
              <section className="method-card is-wide">
                <h3>자동 업데이트 흐름</h3>
                <ol className="method-steps operation-steps">
                  <li><b>1</b><div><strong>엔진 실행</strong><span>MLG와 TENX가 각자의 규칙으로 추천과 상세 근거를 생성합니다.</span></div></li>
                  <li><b>2</b><div><strong>품질 게이트와 발송</strong><span>MLG는 데이터·신호·보고서 게이트를, TENX는 후보·보고서·증거·복구 가능성 계약을 통과해야 발송됩니다. TENX 데이터·신호 진단은 운영 관측으로 별도 보존합니다.</span></div></li>
                  <li><b>3</b><div><strong>이력과 가격 보강</strong><span>추천 이력을 main에 누적하고, 종목과 {benchmarkLabel}의 20·60·120일 가격을 별도 작업이 보강합니다.</span></div></li>
                  <li><b>4</b><div><strong>암호화 게시</strong><span>게시기가 최신 이력으로 좁은 JSON을 만들고 AES-GCM 암호문만 프론트 저장소에 보냅니다.</span></div></li>
                  <li><b>5</b><div><strong>GitHub Pages 배포</strong><span>프론트 검증과 빌드를 통과하면 종목·이력·성과 화면이 함께 업데이트됩니다.</span></div></li>
                </ol>
              </section>
              <section className="method-card">
                <h3>예약 시각 · KST</h3>
                <dl className="method-schedule">
                  <div><dt>MLG 공식 실행</dt><dd>수요일 · 토요일 09:00</dd></div>
                  <div><dt>TENX 공식 실행</dt><dd>화요일 · 금요일 09:00</dd></div>
                  <div><dt>가격·{benchmarkLabel} 백필</dt><dd>화요일–토요일 07:30</dd></div>
                </dl>
              </section>
              <section className="method-card">
                <h3>실패 시 동작</h3>
                <ul className="method-bullets">
                  <li>수동 실행은 기본 dry-run이며 공식 이력에 넣지 않습니다.</li>
                  <li>변환·암호화·검증이 실패하면 기존 배포 데이터를 유지합니다.</li>
                  <li>브라우저에는 API 키와 복호화 전 평문 데이터가 배포되지 않습니다.</li>
                </ul>
              </section>
            </div>
          </>
        ) : null}
      </div>

      <details className="method-data-grades">
        <summary>데이터 등급과 표시 원칙</summary>
        <dl>
          <div><dt>공식 측정</dt><dd>실제 발송 또는 전달 결정 뒤 기록된 공개시각을 기준으로 계산합니다.</dd></div>
          <div><dt>과거 실행 역산</dt><dd>검증된 저장소 archive commit 이후 첫 정규장을 보수적 진입 시점으로 사용합니다.</dd></div>
          <div><dt>측정 대기</dt><dd>필요한 거래일이나 완전한 종목 집합이 아직 갖춰지지 않은 기간입니다.</dd></div>
        </dl>
      </details>
    </section>
  );
}

function FullDetailView({ payload, index, route, onBack }) {
  const run = index.runByKey.get(`${route.strategy}:${route.runId}`) || null;
  const recommendation = getIndexedRecommendation(index, route.strategy, route.runId, route.symbol);
  const timeline = getSymbolTimeline(index, route.strategy, route.symbol);

  if (!run || !recommendation) {
    return (
      <section className="secondary-view empty-route-state">
        <p>GENERAL / DETAIL</p>
        <h1>상세 기록을 찾을 수 없습니다.</h1>
        <span>URL의 실행 ID 또는 종목이 현재 보관 데이터에 없습니다.</span>
        <button type="button" className="route-back" onClick={onBack}><ArrowLeft size={17} /> 목록으로</button>
      </section>
    );
  }

  return (
    <section className="full-detail-view">
      <header className="full-detail-header">
        <button type="button" className="route-back" onClick={onBack}><ArrowLeft size={17} /> 목록으로</button>
        <div>
          <p>{route.strategy} / RUN {route.runId}</p>
          <span>{formatKst(run.report_created_at)} · {STRATEGIES[route.strategy].label}</span>
        </div>
      </header>
      <DetailPanel
        recommendation={recommendation}
        strategy={route.strategy}
        run={run}
        timeline={timeline}
        full
      />
    </section>
  );
}

function Dashboard({ payload, onLock }) {
  const [route, navigate] = useHashRoute();
  const [globalQuery, setGlobalQuery] = useState("");
  const [selectionQuery, setSelectionQuery] = useState("");
  const [previewSymbols, setPreviewSymbols] = useState({});
  const [lastSeen, setLastSeen] = useState(loadLastSeenRuns);
  const mainRef = useRef(null);
  const previousRouteRef = useRef(null);
  const index = useMemo(() => createDashboardIndex(payload), [payload]);
  const searchResults = useMemo(() => searchSecurities(index, globalQuery), [index, globalQuery]);
  const strategy = route.strategy || "MLG";
  const latestStrategyRun = index.runsByStrategy.get(strategy)?.[0];
  const routeKey = serializeHashRoute(
    route.view === "selection"
      && route.runId
      && String(route.runId) === String(latestStrategyRun?.run_id)
      ? { ...route, runId: null }
      : route,
  );

  useEffect(() => {
    const previousRoute = previousRouteRef.current;
    const changedOnlyMethodologySection = previousRoute?.view === "methodology"
      && route.view === "methodology"
      && previousRoute.section !== route.section;
    previousRouteRef.current = route;
    const frame = requestAnimationFrame(() => {
      document.title = routeDocumentTitle(route);
      if (changedOnlyMethodologySection) return;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      mainRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [route, routeKey]);

  const markStrategyRead = useCallback((nextStrategy, explicitRunId = null) => {
    const latest = index.runsByStrategy.get(nextStrategy)?.[0];
    if (!latest || (explicitRunId && String(explicitRunId) !== String(latest.run_id))) return;
    setLastSeen((current) => {
      if (String(current[nextStrategy]) === String(latest.run_id)) return current;
      const next = { ...current, [nextStrategy]: String(latest.run_id) };
      try { window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(next)); } catch { /* local storage can be disabled */ }
      return next;
    });
  }, [index]);

  const selectStrategy = useCallback((nextStrategy, runId = null) => {
    setGlobalQuery("");
    setSelectionQuery("");
    markStrategyRead(nextStrategy, runId);
    navigate({ view: "selection", strategy: nextStrategy, runId });
  }, [markStrategyRead, navigate]);

  function navigateItem(id) {
    setGlobalQuery("");
    if (id === "screener") {
      selectStrategy(strategy);
      return;
    }
    if (id === "performance") {
      navigate({ view: "performance", strategy });
      return;
    }
    navigate({ view: id, strategy });
  }

  function openSearchResult(result) {
    setGlobalQuery("");
    setSelectionQuery("");
    navigate({
      view: "detail",
      strategy: result.strategy,
      runId: result.runId,
      symbol: result.symbol,
    });
  }

  let content;
  if (route.view === "overview") {
    content = (
      <OverviewView
        payload={payload}
        index={index}
        lastSeen={lastSeen}
        onStrategy={selectStrategy}
        onOpenDetail={(nextStrategy, runId, symbol) => navigate({ view: "detail", strategy: nextStrategy, runId, symbol })}
        onHistory={() => navigate({ view: "history", strategy })}
        onPerformance={(nextStrategy) => navigate({ view: "performance", strategy: nextStrategy })}
      />
    );
  } else if (route.view === "history") {
    content = <HistoryView payload={payload} index={index} onStrategy={selectStrategy} />;
  } else if (route.view === "performance") {
    content = (
      <StandalonePerformanceView
        payload={payload}
        strategy={strategy}
        onStrategy={(nextStrategy) => navigate({ view: "performance", strategy: nextStrategy })}
      />
    );
  } else if (route.view === "methodology") {
    content = (
      <MethodologyView
        benchmark={payload.benchmark}
        section={route.section || "mlg"}
        onSection={(section) => navigate({ view: "methodology", section })}
      />
    );
  } else if (route.view === "detail") {
    content = (
      <FullDetailView
        payload={payload}
        index={index}
        route={route}
        onBack={() => navigate({ view: "selection", strategy, runId: route.runId })}
      />
    );
  } else {
    content = (
      <SelectionView
        payload={payload}
        index={index}
        strategy={strategy}
        query={selectionQuery}
        setQuery={setSelectionQuery}
        selectedRunId={route.runId}
        selectedSymbol={previewSymbols[strategy] || null}
        onSelectSymbol={(symbol) => setPreviewSymbols((current) => ({ ...current, [strategy]: symbol }))}
        onOpenDetail={(runId, symbol) => navigate({ view: "detail", strategy, runId, symbol })}
        onLatest={() => selectStrategy(strategy)}
        onStrategy={selectStrategy}
      />
    );
  }

  return (
    <div className={`app-shell view-${route.view}`}>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <BrandHeader
        activeView={route.view}
        strategy={strategy}
        query={globalQuery}
        setQuery={setGlobalQuery}
        searchResults={searchResults}
        onOpenSearchResult={openSearchResult}
        generatedAt={payload.generated_at}
        onLock={onLock}
      />
      <SideNav activeView={route.view} onNavigate={navigateItem} onLock={onLock} />
      <main className="workspace" id="main-content" ref={mainRef} tabIndex={-1}>{content}</main>
      <MobileNav activeView={route.view} onNavigate={navigateItem} />
    </div>
  );
}

export function App() {
  const [envelope, setEnvelope] = useState(null);
  const [envelopeError, setEnvelopeError] = useState("");
  const [payload, setPayload] = useState(null);
  const [dashboardRevision, setDashboardRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const payloadUrl = `${import.meta.env.BASE_URL}data/payload.enc.json?v=${encodeURIComponent(__BUILD_ID__)}`;
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

  useEffect(() => {
    if (!payload) document.title = "GENERAL SCREENER";
  }, [payload]);

  async function unlock(passphrase) {
    const decrypted = await decryptEnvelope(envelope, passphrase);
    const validated = assertDashboardPayload(decrypted);
    setPayload(assertDashboardPayload(quarantineDashboardPayload(validated)));
  }

  return (
    <Theme theme={neutralTheme} mode="dark">
      {payload ? (
        <AppErrorBoundary
          key={dashboardRevision}
          onRetry={() => setDashboardRevision((current) => current + 1)}
          onLock={() => setPayload(null)}
        >
          <Dashboard payload={payload} onLock={() => setPayload(null)} />
        </AppErrorBoundary>
      ) : (
        <UnlockScreen envelope={envelope} envelopeError={envelopeError} onUnlock={unlock} />
      )}
    </Theme>
  );
}
