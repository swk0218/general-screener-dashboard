import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock3,
  Grid2X2,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PanelRightOpen,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import { decryptEnvelope } from "./crypto/envelope.js";
import { assertDashboardPayload } from "./data/contract.js";
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
  serializeHashRoute,
  sortRunsNewestFirst,
} from "./data/dashboard-model.js";

const STRATEGIES = Object.freeze({
  MLG: { label: "중대형 성장주", pickLabel: "10 PICKS", version: "MLG v1" },
  TENX: { label: "텐베거 유망주", pickLabel: "5 PICKS", version: "TENX" },
});

const HORIZONS = Object.freeze(["5D", "10D", "20D"]);
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
  { id: "methodology", label: "METHOD", icon: BookOpen },
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
  if (normalized.includes("관찰") || normalized === "WATCH") return "is-cyan";
  if (normalized === "FAIL") return "is-negative";
  return "is-amber";
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
        <span className="system-state"><span className="status-dot" /> ENCRYPTED STATIC VAULT</span>
      </header>
      <section className="unlock-panel" aria-labelledby="unlock-title">
        <div className="unlock-symbol" aria-hidden="true"><LockKeyhole size={28} strokeWidth={1.6} /></div>
        <p className="eyeline">PRIVATE TERMINAL ACCESS</p>
        <h1 id="unlock-title">GENERAL SCREENER</h1>
        <p className="unlock-copy">
          입력값은 이 기기에서 데이터 복호화에만 사용되며 서버로 전송하거나 저장하지 않습니다.
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
        <div className="unlock-footnote">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>API key 없음 · 평문 payload 없음 · browser memory only</span>
        </div>
      </section>
    </main>
  );
}

function EvidenceBadge({ evidence, compact = false }) {
  return (
    <span className={`evidence-badge is-${evidence.level.toLowerCase()} ${compact ? "is-compact" : ""}`}>
      <span aria-hidden="true" />
      {evidence.label}
    </span>
  );
}

function BrandHeader({ activeView, strategy, query, setQuery, generatedAt, evidence, onStrategy, onLock }) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchTriggerRef = useRef(null);
  const searchWrapRef = useRef(null);
  const searchEnabled = activeView === "selection";

  useEffect(() => {
    if (!mobileSearchOpen) return;
    requestAnimationFrame(() => searchWrapRef.current?.querySelector("input")?.focus());
  }, [mobileSearchOpen]);

  function closeMobileSearch() {
    setMobileSearchOpen(false);
    requestAnimationFrame(() => searchTriggerRef.current?.focus());
  }

  return (
    <header className="topbar">
      <div className="brand-wordmark">GENERAL SCREENER</div>
      <nav className="engine-tabs" aria-label="스크리닝 전략">
        {Object.keys(STRATEGIES).map((item) => (
          <button
            type="button"
            key={item}
            className={strategy === item && ["selection", "detail"].includes(activeView) ? "is-active" : ""}
            aria-current={strategy === item && ["selection", "detail"].includes(activeView) ? "page" : undefined}
            onClick={() => onStrategy(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div
        className={`top-search ${mobileSearchOpen ? "is-open" : ""} ${searchEnabled ? "" : "is-disabled"}`}
        ref={searchWrapRef}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mobileSearchOpen) closeMobileSearch();
        }}
      >
        {searchEnabled ? (
          <TextInput
            label="현재 실행 종목 검색"
            isLabelHidden
            value={query}
            onChange={setQuery}
            placeholder="Search current run..."
            startIcon={<Search size={16} strokeWidth={1.8} />}
            hasClear
            width="100%"
            size="lg"
          />
        ) : <span className="search-scope-label">SEARCH · CURRENT RUN ONLY</span>}
        <button type="button" className="mobile-search-close" aria-label="검색 닫기" onClick={closeMobileSearch}>
          <X size={20} />
        </button>
      </div>
      <button
        type="button"
        className="mobile-search-trigger"
        ref={searchTriggerRef}
        aria-label="현재 실행 종목 검색 열기"
        disabled={!searchEnabled}
        onClick={() => setMobileSearchOpen(true)}
      >
        <Search size={24} strokeWidth={1.8} />
      </button>
      <div className="sync-status">
        <span className="sync-label">LAST SYNC</span>
        <time dateTime={generatedAt || undefined}>{formatKst(generatedAt)}</time>
        <span className={`status-dot is-${evidence.level.toLowerCase()}`} aria-label={evidence.label} />
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
          const active = id === strategy
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

function MobileNav({ activeView, strategy, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
      {MOBILE_NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const target = id === "strategy" ? strategy : id;
        const active = id === "strategy" ? ["selection", "detail"].includes(activeView) : id === activeView;
        return (
          <button
            type="button"
            key={id}
            className={active ? "is-active" : ""}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(target)}
          >
            <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
            <span>{id === "strategy" ? strategy : label}</span>
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
            <th scope="col">RANK</th>
            <th scope="col">TICKER</th>
            <th scope="col" className="company-column">COMPANY</th>
            <th scope="col">VERDICT</th>
            <th scope="col" className="number-cell">SCORE</th>
            <th scope="col" className="number-cell">PRICE</th>
            <th scope="col" className="number-cell delta-column">Δ PREV</th>
            <th scope="col"><span className="sr-only">상세</span></th>
          </tr>
        </thead>
        <tbody>
          {recommendations.map((item) => {
            const transition = transitions?.get(item.symbol);
            return (
            <tr
              key={`${item.run_id}:${item.signal_id || item.symbol}`}
              className={item.symbol === selectedSymbol ? "is-selected" : ""}
              onClick={() => onPreview(item.symbol)}
              onDoubleClick={() => onOpenDetail(item.symbol)}
            >
              <td>{String(item.recommendation_rank).padStart(2, "0")}</td>
              <td className="ticker-cell">
                <button
                  type="button"
                  className="row-select-button"
                  aria-pressed={item.symbol === selectedSymbol}
                  aria-label={`${item.symbol} 미리보기`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPreview(item.symbol);
                  }}
                >
                  {item.symbol}
                </button>
              </td>
              <td className="company-column">{item.company_name || "—"}</td>
              <td className={`verdict-cell ${verdictClass(item.verdict)}`}>{item.verdict || "—"}</td>
              <td className="number-cell score-cell">{formatNumber(item.score)}</td>
              <td className="number-cell muted-number">{formatPrice(item.screening_price)}</td>
              <td className={`number-cell delta-column ${Number(transition?.scoreDelta) >= 0 ? "is-positive" : "is-negative"}`}>
                {transition?.status === "NEW" ? "NEW" : transition?.status === "RE-ENTRY" ? "RE-ENTRY" : formatSigned(transition?.scoreDelta)}
              </td>
              <td className="row-action-cell">
                <button type="button" onClick={() => onOpenDetail(item.symbol)} aria-label={`${item.symbol} 전체 상세 보기`}>
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
            <button type="button" onClick={() => onOpenDetail(item.symbol)}>
              <span className="mobile-rank">{String(item.recommendation_rank).padStart(2, "0")}</span>
              <span className="mobile-security">
                <strong>{item.symbol}</strong>
                <span className={verdictClass(item.verdict)}>{item.verdict || "—"}</span>
              </span>
              <span className="mobile-numbers">
                <strong>{formatNumber(item.score)}</strong>
                <span>{transition?.status === "NEW" ? "NEW" : transition?.status === "RE-ENTRY" ? "RE-ENTRY" : formatSigned(transition?.scoreDelta)}</span>
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
  const latestTimeline = timeline?.entries?.find((entry) => entry.recommendation) || null;
  const factItems = [
    { label: "RSI14", value: hasValue(detail.timing?.rsi14) ? formatNumber(detail.timing.rsi14, 1) : null },
    { label: "HEAT", value: HEAT_LABELS[detail.timing?.heat] || detail.timing?.heat, tone: detail.timing?.heat === "high" ? "amber" : null },
    { label: "WARNING", value: detail.timing?.warning, tone: detail.timing?.warning ? "negative" : null },
    { label: "PRICE AS OF", value: detail.timing?.price_as_of },
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
    { label: "스크리닝 가격", value: formatPrice(recommendation.screening_price) },
    { label: "후보 상태", value: recommendation.candidate_state || recommendation.verdict },
    ...detail.metrics,
  ];

  if (full) {
    return (
      <article className="detail-dossier dossier-v2" aria-label={`${recommendation.symbol} 전체 상세`}>
        <header className="dossier-hero">
          <div>
            <p>{strategy || recommendation.strategy} · {STRATEGIES[strategy || recommendation.strategy]?.label || recommendation.strategy}</p>
            <h1>{recommendation.symbol}</h1>
            <span>{recommendation.company_name || "회사명 미수록"}</span>
          </div>
          <dl>
            <div><dt>RANK</dt><dd>{String(recommendation.recommendation_rank).padStart(2, "0")}</dd></div>
            <div><dt>VERDICT</dt><dd className={verdictClass(recommendation.verdict)}>{recommendation.verdict || "—"}</dd></div>
            <div><dt>SCORE</dt><dd>{formatNumber(recommendation.score)}</dd></div>
            <div><dt>PRICE</dt><dd>{formatPrice(recommendation.screening_price)}</dd></div>
            <div><dt>DATE</dt><dd>{formatDate(run?.report_date || run?.report_created_at)}</dd></div>
          </dl>
        </header>
        <FactTape items={factItems} />
        {detail.hasRichDetail ? (
          <div className="detail-source-note">
            <strong>{detail.detailProvenance ? "RECONSTRUCTED SNAPSHOT" : "STRUCTURED SNAPSHOT"}</strong>
            <p>{detail.detailProvenance
              ? "복구한 compact audit 원본값을 공개용 규칙으로 구조화했습니다. Telegram 원문을 복제한 것은 아닙니다."
              : "실행 당시 원본 수치를 공개용 규칙으로 구조화한 설명입니다. Telegram 문구를 그대로 복제한 것은 아닙니다."}</p>
          </div>
        ) : (
          <div className="archive-notice">
            <strong>ARCHIVED SIGNAL</strong>
            <p>이 실행은 순위·점수·가격·위험 플래그만 보관된 과거 신호입니다. 없는 설명을 생성하지 않고 확인 가능한 사실과 전체 등장 이력을 표시합니다.</p>
          </div>
        )}

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

        <details className="provenance-details">
          <summary>근거 출처와 실행 계보</summary>
          <dl>
            <div><dt>실행 ID</dt><dd>{run?.run_id || recommendation.run_id || "—"}</dd></div>
            <div><dt>신호 ID</dt><dd>{recommendation.signal_id || "—"}</dd></div>
            <div><dt>보고 시각</dt><dd>{formatKst(run?.report_created_at)}</dd></div>
            <div><dt>소스 SHA</dt><dd>{run?.sha || run?.commit_sha || recommendation.source_sha || "—"}</dd></div>
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
        <div><dt>SCORE</dt><dd>{formatNumber(recommendation.score)}</dd></div>
        <div><dt>VERDICT</dt><dd className={verdictClass(recommendation.verdict)}>{recommendation.verdict || "—"}</dd></div>
        <div><dt>PRICE</dt><dd>{formatPrice(recommendation.screening_price)}</dd></div>
        {recommendation.sector ? <div><dt>SECTOR</dt><dd>{recommendation.sector}</dd></div> : null}
        {recommendation.confidence ? <div><dt>CONFIDENCE</dt><dd>{humanizeConfidence(recommendation.confidence)}</dd></div> : null}
      </dl>
      <section className="detail-summary">
        <h3>SUMMARY</h3>
        <p>{detail.hasRichDetail ? detail.summary : `${formatDate(run?.report_date || run?.report_created_at)} 공식 실행 ${recommendation.recommendation_rank}위 · ${timeline?.selectedRunCount || 1}회 선정 기록`}</p>
      </section>
      <FactTape items={factItems.slice(0, 6)} />
      {!detail.hasRichDetail ? <div className="archive-notice"><strong>ARCHIVE</strong><p>과거 상세 설명은 미수록입니다. 보관된 수치와 위험 신호만 표시합니다.</p></div> : null}
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
  const backcastAvailable = (backcast?.aggregates || []).some(
    (item) => item.strategy === strategy && item.status === "RECONSTRUCTED",
  );
  const readiness = HORIZONS.map((horizon) => ({
    horizon,
    verified: getVerifiedAggregate(performance, strategy, horizon),
    reconstructed: getBackcastCell(backcast, strategy, horizon),
  }));
  const expectedSignals = strategy === "MLG" ? 10 : 5;

  function handleTabKey(event, item) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = HORIZONS.indexOf(item);
    const next = event.key === "Home" ? HORIZONS[0]
      : event.key === "End" ? HORIZONS.at(-1)
        : HORIZONS[(index + (event.key === "ArrowRight" ? 1 : -1) + HORIZONS.length) % HORIZONS.length];
    setRange(next);
    requestAnimationFrame(() => document.getElementById(`performance-tab-${strategy}-${next}`)?.focus());
  }

  return (
    <section className="performance-panel performance-panel-v2" aria-labelledby="performance-title">
      <div className="section-heading-row">
        <h2 id="performance-title">{strategy} / {benchmark} PERFORMANCE</h2>
        <span className="performance-tier">OFFICIAL ≠ RECONSTRUCTED</span>
      </div>

      <div className="performance-evidence-split" role="status">
        <section className="is-official">
          <strong>공식 검증 · {officialEvidence.level}</strong>
          <p>{officialEvidence.description} · {officialEvidence.reason}</p>
        </section>
        <section className="is-backcast">
          <strong>역산 참고치 · {backcastAvailable ? "AVAILABLE" : "PENDING"}</strong>
          <p>{backcastAvailable ? "저장소 아카이브 시각에 묶인 과거 재구성입니다. 공식 검증값으로 승격하지 않습니다." : "완전한 실행 단위 가격 쌍이 준비되면 별도 참고치로 표시합니다."}</p>
        </section>
      </div>

      <div className="readiness-grid" aria-label={`${strategy} 기간별 성과 상태`}>
        {readiness.map(({ horizon, verified, reconstructed: cell }) => {
          const mode = verified ? "VERIFIED" : cell.aggregate ? "RECONSTRUCTED" : cell.horizonStatus?.status || "PENDING";
          return (
            <button type="button" className={`readiness-card is-${mode.toLowerCase()}`} key={horizon} onClick={() => setRange(horizon)}>
              <div><strong>{horizon}</strong><span>{mode}</span></div>
              {verified || cell.aggregate ? (
                <p>{strategy} {formatPercent((verified || cell.aggregate).equal_weight_return)} · 초과 {formatPercent((verified || cell.aggregate).equal_weight_excess_return)}</p>
              ) : <p>완전한 실행 단위 관측 대기</p>}
            </button>
          );
        })}
      </div>

      <div className="performance-toolbar">
        <span>기간</span>
        <div className="range-tabs" role="tablist" aria-label="성과 기간">
          {HORIZONS.map((item) => (
            <button
              type="button"
              role="tab"
              id={`performance-tab-${strategy}-${item}`}
              aria-controls={`performance-panel-${strategy}`}
              aria-selected={range === item}
              tabIndex={range === item ? 0 : -1}
              className={range === item ? "is-active" : ""}
              onClick={() => setRange(item)}
              onKeyDown={(event) => handleTabKey(event, item)}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="performance-source-label">{source || "NO COMPLETE CELL"}</span>
      </div>

      <div id={`performance-panel-${strategy}`} role="tabpanel" aria-labelledby={`performance-tab-${strategy}-${range}`}>
        {aggregate ? (
          <>
            <dl className="performance-summary">
              <div><dt>{strategy} RETURN</dt><dd>{formatPercent(aggregate.equal_weight_return)}</dd></div>
              <div><dt>{benchmark}</dt><dd>{formatPercent(aggregate.qqq_equal_weight_return)}</dd></div>
              <div><dt>EXCESS</dt><dd>{formatPercent(aggregate.equal_weight_excess_return)}</dd></div>
              <div><dt>{benchmark} WIN RATE</dt><dd>{formatPercent(aggregate.qqq_win_rate)}</dd></div>
              <div><dt>COMPLETE RUNS</dt><dd>{selectedStatus?.complete_run_count ?? aggregate.run_count}</dd></div>
              <div><dt>SIGNALS</dt><dd>{selectedStatus?.underlying_signal_count ?? aggregate.underlying_signal_count}</dd></div>
              <div><dt>LATEST MEASURE</dt><dd>{aggregate.measurement_session_max || "—"}</dd></div>
            </dl>

            <ReturnComparisonChart points={runSeries} strategy={strategy} benchmark={benchmark} horizon={range} />

            {source === "RECONSTRUCTED" ? (
              <p className="reconstruction-note">
                <strong>RECONSTRUCTED_REPOSITORY_BOUND</strong> · trusted repository archive commit 이후 첫 정규장 시가 · FMP adjusted price · 같은 session의 {benchmark} · 실행당 {expectedSignals}종목 완전 집합만 포함 · 수수료/슬리피지 미반영
              </p>
            ) : null}

            <div className="performance-table-wrap">
              <table className="performance-run-table">
                <thead><tr><th>RUN DATE</th><th>RUN ID</th><th>{strategy}</th><th>{benchmark}</th><th>EXCESS</th><th>COVERAGE</th><th>STATE</th></tr></thead>
                <tbody>
                  {runSeries.map((item) => (
                    <tr key={`${item.run_id}:${item.report_date}`}>
                      <td>{item.report_date}</td>
                      <td>{item.run_id}</td>
                      <td>{formatPercent(item.strategy_return)}</td>
                      <td>{formatPercent(item.qqq_return)}</td>
                      <td className={Number(item.excess_return) >= 0 ? "is-positive" : "is-negative"}>{formatPercent(item.excess_return)}</td>
                      <td>{item.signal_count} / {expectedSignals}</td>
                      <td className="performance-tier">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="signals-details">
              <summary>{source === "VERIFIED" ? "검증" : "역산"} 종목 {signals.length}건</summary>
              {signals.length ? (
                <div className="signals-table-wrap">
                  <table>
                    <thead><tr><th>종목</th><th>진입일</th><th>측정일</th><th>수익률</th><th>초과</th></tr></thead>
                    <tbody>{signals.map((item) => (
                      <tr key={`${item.run_id}:${item.signal_id}:${item.horizon}`}>
                        <th scope="row">{item.symbol}</th><td>{item.entry_session}</td><td>{item.measurement_session}</td>
                        <td>{formatPercent(item.signal_return)}</td><td>{formatPercent(item.excess_return)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : null}
            </details>
          </>
        ) : (
          <div className="performance-empty">
            <p>{range}는 아직 {strategy} {expectedSignals}종목 전체와 {benchmark}의 동일 session 관측이 완성되지 않았습니다.</p>
            <small>부분 가격으로 평균을 만들지 않습니다. 다음 백필에서 완전한 실행이 생기면 자동으로 열립니다.</small>
          </div>
        )}
      </div>
    </section>
  );
}

function SelectionView({ payload, index, strategy, query, selectedRunId, selectedSymbol, onSelectSymbol, onOpenDetail, onLatest }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [range, setRange] = useState("5D");
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
  const evidence = getPerformanceState(payload.performance, payload.evidence_status);

  useEffect(() => {
    if (resolvedSelected?.symbol && resolvedSelected.symbol !== selectedSymbol) {
      onSelectSymbol(resolvedSelected.symbol);
    }
  }, [onSelectSymbol, resolvedSelected?.symbol, selectedSymbol]);

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
            <span>이 실행 ID는 현재 암호화 payload에 없으므로 최신 목록으로 바꾸지 않았습니다.</span>
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
      <section className="run-header">
        <div className="run-title-row">
          <div>
            <h1>
              <span>{strategy}</span>
              <span className="run-date">· {formatDate(currentRun.report_date || currentRun.report_created_at)}</span>
            </h1>
            <p className="strategy-descriptor">{STRATEGIES[strategy].label}</p>
          </div>
          <EvidenceBadge evidence={evidence} />
        </div>
        <p className="run-provenance">
          {isHistorical ? "HISTORICAL OFFICIAL RUN" : "LATEST OFFICIAL RUN"} · RUN {currentRun.run_id} · {currentRun.branch || "MAIN"}
        </p>
        {isHistorical ? (
          <div className="historical-banner" role="status">
            <span>과거 실행을 보고 있습니다. 최신 추천과 혼동하지 마세요.</span>
            <button type="button" onClick={onLatest}>최신 실행으로</button>
          </div>
        ) : null}
        <div className="run-tape" aria-label="실행 정보">
          <span><strong>{allRecommendations.length}</strong> OFFICIAL PICKS</span>
          <span>RUN <strong>{currentRun.run_id}</strong></span>
          <span>{currentRun.branch || "main"} · {currentRun.workflow || "official"}</span>
          <span>BENCHMARK <strong>{payload.benchmark || "QQQ"}</strong></span>
          <span className="is-evidence">OFFICIAL {evidence.level}</span>
        </div>
      </section>

      <div className="selection-content">
        <section className="table-panel" aria-labelledby="current-selection-title">
          <div className="section-heading-row table-heading">
            <h2 id="current-selection-title">{isHistorical ? "HISTORICAL SELECTION" : "CURRENT SELECTION"}</h2>
            <span className="row-hint" aria-live="polite">
              {query ? `${recommendations.length} / ${allRecommendations.length} MATCHES` : `${allRecommendations.length} OFFICIAL PICKS`}
            </span>
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
          <span>{resolvedSelected?.symbol || "ROW"} DETAILS</span>
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

      <div className="selection-performance">
        <PerformancePanel
          strategy={strategy}
          performance={payload.performance}
          backcast={payload.performance_backcast}
          evidenceStatus={payload.evidence_status}
          benchmark={payload.benchmark}
          range={range}
          setRange={setRange}
        />
      </div>
    </div>
  );
}

function OverviewView({ payload, index, lastSeen, onStrategy }) {
  const evidence = getPerformanceState(payload.performance, payload.evidence_status);
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
    const warningCount = picks.filter((item) => /주의|high|elevated/i.test(`${item.detail?.timing?.warning || ""} ${item.risk_flags || ""}`)).length;
    return {
      strategy,
      run,
      picks,
      added,
      removed,
      retained,
      rankUp,
      rankDown,
      warningCount,
      unreadRuns: seenIndex < 0 ? (run ? 1 : 0) : seenIndex,
      isRead: seenIndex === 0,
    };
  });
  const topPicks = latestRuns.flatMap(({ strategy, picks }) => picks.slice(0, 3).map((item) => ({ strategy, ...item })));
  const backcastPreview = (payload.performance_backcast?.aggregates || []).find((item) => (
    item.strategy === "MLG" && String(item.horizon).toLowerCase() === "5d" && item.status === "RECONSTRUCTED"
  )) || (payload.performance_backcast?.aggregates || [])[0] || null;
  return (
    <section className="secondary-view overview-view overview-v2">
      <header>
        <p>GENERAL / OVERVIEW</p>
        <h1>WHAT CHANGED</h1>
        <span>지난 확인 이후 달라진 종목과 순위부터 보고, 필요할 때 상세와 과거 실행으로 내려갑니다.</span>
        <EvidenceBadge evidence={evidence} />
      </header>

      <section className="since-visit" aria-labelledby="since-visit-title">
        <header><h2 id="since-visit-title">지난 방문 이후 / SINCE LAST VISIT</h2><span>{formatKst(payload.generated_at)}</span></header>
        <div className="visit-strategies">
          {latestRuns.map((item) => (
            <button type="button" className="visit-strategy" key={item.strategy} onClick={() => onStrategy(item.strategy)} disabled={!item.run}>
              <span className="visit-strategy-heading">
                <strong>{item.strategy}</strong><span>{STRATEGIES[item.strategy].label}</span>
                <small>{item.isRead ? "확인 완료" : `${item.unreadRuns} NEW RUN`}</small>
              </span>
              <dl className="visit-changes">
                <div><dt>새 진입</dt><dd className="is-added">{item.added.length ? `+ ${item.added.join(" · ")}` : "없음"}</dd></div>
                <div><dt>제외</dt><dd className="is-removed">{item.removed.length ? `− ${item.removed.join(" · ")}` : "없음"}</dd></div>
                <div><dt>유지 / 순위</dt><dd>{item.retained.length} · ↑{item.rankUp} ↓{item.rankDown}</dd></div>
              </dl>
              <span className="visit-run-meta">{formatDate(item.run?.report_date || item.run?.report_created_at)} · {item.picks.length} PICKS · 경고 {item.warningCount}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="overview-working-grid">
        <section className="latest-selection-mini">
          <header><h2>최신 상위 종목</h2><span>MLG / TENX 각각 TOP 3</span></header>
          <table className="mini-selection-table">
            <thead><tr><th>ENGINE</th><th>RANK</th><th>TICKER</th><th>COMPANY</th><th>VERDICT</th><th>SCORE</th></tr></thead>
            <tbody>{topPicks.map((item) => (
              <tr key={`${item.strategy}:${item.run_id}:${item.symbol}`}>
                <td>{item.strategy}</td><td>{String(item.recommendation_rank).padStart(2, "0")}</td><td><strong>{item.symbol}</strong></td>
                <td>{item.company_name || "—"}</td><td className={verdictClass(item.verdict)}>{item.verdict || "—"}</td><td>{formatNumber(item.score)}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>

        <section className="backcast-preview">
          <header><h2>QQQ 대비 성과</h2><span>OFFICIAL {evidence.level}</span></header>
          <div className="backcast-preview-body">
            <p>{backcastPreview ? "공식 검증과 분리된 저장소 기반 역산 참고치입니다." : "공식 검증은 보류 중이며, 저장소 기반 역산 파이프라인을 준비하고 있습니다."}</p>
            <dl>
              <div><dt>MODE</dt><dd>{backcastPreview ? "RECONSTRUCTED" : "PENDING"}</dd></div>
              <div><dt>CELL</dt><dd>{backcastPreview ? `${backcastPreview.strategy} ${String(backcastPreview.horizon).toUpperCase()}` : "—"}</dd></div>
              <div><dt>STRATEGY</dt><dd>{backcastPreview ? formatPercent(backcastPreview.equal_weight_return) : "—"}</dd></div>
              <div><dt>EXCESS</dt><dd>{backcastPreview ? formatPercent(backcastPreview.equal_weight_excess_return) : "—"}</dd></div>
            </dl>
          </div>
        </section>
      </div>
    </section>
  );
}

function ChangeSummary({ summary }) {
  if (!summary || summary.isBaseline) return <span className="history-change is-baseline">BASELINE</span>;
  return (
    <span className="history-change" aria-label={`신규 ${summary.added.length}, 제외 ${summary.removed.length}, 유지 ${summary.retained.length}`}>
      <i className="is-added">+{summary.added.length}</i>
      <i className="is-removed">−{summary.removed.length}</i>
      <i>{summary.retained.length} KEEP</i>
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
        <p>GENERAL / HISTORY</p>
        <h1>OFFICIAL RUN HISTORY</h1>
        <span>실행 ID별 공식 추천 기록과 직전 실행 대비 구성 변동입니다.</span>
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
          placeholder="Search ticker, company, run ID or date..."
          startIcon={<Search size={16} />}
          hasClear
          width="100%"
          size="lg"
        />
      </div>
      <p className="history-result-count" aria-live="polite">{filteredRuns.length} / {runs.length} RUNS</p>
      <div className="history-list-v2">
        {filteredRuns.map((run) => {
          const picks = getIndexedRunRecommendations(index, run.strategy, run.run_id);
          const summary = getIndexedRunChanges(index, run.strategy, run.run_id);
          const isLatest = latestRunIds.has(`${run.strategy}:${run.run_id}`);
          return (
            <button type="button" className="history-run" key={`${run.strategy}:${run.run_id}`} onClick={() => onStrategy(run.strategy, run.run_id)}>
              <span className="history-engine">{run.strategy}</span>
              <span className="history-date">{formatDate(run.report_date || run.report_created_at)} {isLatest ? <b>LATEST</b> : null}</span>
              <span className="history-id">RUN {run.run_id} · {picks.length} PICKS</span>
              <span className="history-symbols">
                {summary?.isBaseline ? `BASELINE · ${picks.map((item) => item.symbol).join(" · ")}` : (
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
        {!filteredRuns.length ? <div className="empty-list">조건과 일치하는 공식 실행 기록이 없습니다.</div> : null}
      </div>
    </section>
  );
}

function StandalonePerformanceView({ payload, strategy }) {
  const [range, setRange] = useState("5D");
  const evidence = getPerformanceState(payload.performance, payload.evidence_status);
  return (
    <section className="secondary-view performance-view">
      <header>
        <p>GENERAL / PERFORMANCE</p>
        <h1>{strategy} VS {payload.benchmark || "QQQ"}</h1>
        <span>공식 검증 성과와 저장소 기반 역산 참고치를 섞지 않고 같은 화면에서 비교합니다.</span>
      </header>
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
        <div><dt>HOLD</dt><dd><strong>성과 비공개</strong><span>관측 이력이나 무결성 검증이 부족하면 추천은 유지하되 성과 수치를 숨깁니다.</span></dd></div>
        <div><dt>PARTIAL</dt><dd><strong>일부 기간 공개</strong><span>검증을 통과한 기간만 공개하고 나머지 기간은 비활성화합니다.</span></dd></div>
        <div><dt>READY</dt><dd><strong>검증 완료</strong><span>보관된 관측 이력과 무결성 기준을 통과한 성과만 표시합니다.</span></dd></div>
        <div><dt>RECONSTRUCTED</dt><dd><strong>저장소 기반 역산 참고치</strong><span>공식 결과가 존재했음을 증명하는 아카이브 커밋 이후 첫 정규장 시가와 동일 구간 {benchmark || "QQQ"}로 계산합니다. VERIFIED로 승격하지 않습니다.</span></dd></div>
        <div><dt>DETAIL SOURCE</dt><dd><strong>결정 규칙 기반 구조화</strong><span>실행 원본값을 공개용 포매터로 정리합니다. 복구된 과거 상세는 compact audit에서 재구성하며 Telegram 원문과 동일하다고 주장하지 않습니다.</span></dd></div>
        <div><dt>COMPLETE RUN</dt><dd><strong>MLG 10 · TENX 5</strong><span>한 실행의 공식 추천 전 종목과 {benchmark || "QQQ"} 가격이 같은 session으로 갖춰진 경우만 평균을 공개합니다.</span></dd></div>
        <div><dt>LAST VISIT</dt><dd><strong>이 브라우저에만 저장</strong><span>마지막으로 연 최신 실행 ID만 localStorage에 남겨 신규 실행과 변동을 구분합니다. 종목 데이터나 암호문구는 저장하지 않습니다.</span></dd></div>
        <div><dt>PROVENANCE</dt><dd><strong>RUN ID + SOURCE TIME</strong><span>결과마다 실행 ID와 생성 시각을 유지합니다.</span></dd></div>
      </dl>
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
        <span>URL의 실행 ID 또는 종목이 현재 payload에 없습니다.</span>
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
  const [query, setQuery] = useState("");
  const [previewSymbols, setPreviewSymbols] = useState({});
  const [lastSeen, setLastSeen] = useState(loadLastSeenRuns);
  const index = useMemo(() => createDashboardIndex(payload), [payload]);
  const strategy = route.strategy || "MLG";
  const evidence = getPerformanceState(payload.performance, payload.evidence_status);
  const latestStrategyRun = sortRunsNewestFirst(
    payload.runs.filter((item) => item.strategy === strategy),
  )[0];
  const routeKey = serializeHashRoute(
    route.view === "selection"
      && route.runId
      && String(route.runId) === String(latestStrategyRun?.run_id)
      ? { ...route, runId: null }
      : route,
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [routeKey]);

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
    setQuery("");
    markStrategyRead(nextStrategy, runId);
    navigate({ view: "selection", strategy: nextStrategy, runId });
  }, [markStrategyRead, navigate]);

  function navigateItem(id) {
    if (id === "MLG" || id === "TENX") {
      selectStrategy(id);
      return;
    }
    if (id === "performance") {
      navigate({ view: "performance", strategy });
      return;
    }
    setQuery("");
    navigate({ view: id, strategy });
  }

  let content;
  if (route.view === "overview") {
    content = <OverviewView payload={payload} index={index} lastSeen={lastSeen} onStrategy={selectStrategy} />;
  } else if (route.view === "history") {
    content = <HistoryView payload={payload} index={index} onStrategy={selectStrategy} />;
  } else if (route.view === "performance") {
    content = <StandalonePerformanceView payload={payload} strategy={strategy} />;
  } else if (route.view === "methodology") {
    content = <MethodologyView benchmark={payload.benchmark} />;
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
        query={query}
        selectedRunId={route.runId}
        selectedSymbol={previewSymbols[strategy] || null}
        onSelectSymbol={(symbol) => setPreviewSymbols((current) => ({ ...current, [strategy]: symbol }))}
        onOpenDetail={(runId, symbol) => navigate({ view: "detail", strategy, runId, symbol })}
        onLatest={() => selectStrategy(strategy)}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <BrandHeader
        activeView={route.view}
        strategy={strategy}
        query={query}
        setQuery={setQuery}
        generatedAt={payload.generated_at}
        evidence={evidence}
        onStrategy={selectStrategy}
        onLock={onLock}
      />
      <SideNav activeView={route.view} strategy={strategy} onNavigate={navigateItem} onLock={onLock} />
      <main className="workspace" id="main-content">{content}</main>
      <MobileNav activeView={route.view} strategy={strategy} onNavigate={navigateItem} />
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

  return (
    <Theme theme={neutralTheme} mode="dark">
      {payload ? <Dashboard payload={payload} onLock={() => setPayload(null)} /> : (
        <UnlockScreen envelope={envelope} envelopeError={envelopeError} onUnlock={unlock} />
      )}
    </Theme>
  );
}
