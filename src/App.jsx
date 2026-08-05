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
  FileText,
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
import {
  getPerformanceState,
  getPreviousRecommendation,
  getRecommendationDetail,
  getRunRecommendations,
  getVerifiedAggregate,
  parseHashRoute,
  resolveSelectedRun,
  serializeHashRoute,
  sortRunsNewestFirst,
  summarizeRunChanges,
} from "./data/dashboard-model.js";

const STRATEGIES = Object.freeze({
  MLG: { label: "중대형 성장주", pickLabel: "10 PICKS", version: "MLG v1" },
  TENX: { label: "텐베거 유망주", pickLabel: "5 PICKS", version: "TENX" },
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

const DRIVER_GROUPS = Object.freeze({
  MLG: [
    ["growth", "성장"],
    ["valuation", "밸류에이션"],
    ["financial", "재무 건전성"],
    ["ai_sec", "AI · SEC 근거"],
  ],
  TENX: [
    ["growth", "성장"],
    ["durability", "성장 지속성"],
    ["per_share", "주당 가치"],
    ["gross_margin", "매출총이익률"],
    ["funding", "자금 조달"],
    ["monetization", "수익화"],
    ["demand", "수요"],
    ["ai", "AI 근거"],
    ["tenbagger_path", "텐베거 경로"],
  ],
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

function verdictClass(verdict) {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized.includes("관찰") || normalized === "WATCH") return "is-cyan";
  if (normalized === "FAIL") return "is-negative";
  return "is-amber";
}

function groupDrivers(strategy, drivers) {
  const groups = DRIVER_GROUPS[strategy] || [];
  const assigned = new Set();
  const result = groups.map(([key, label]) => {
    const aliases = key === "ai_sec" ? ["ai", "sec", "filing"]
      : key === "financial" ? ["financial", "cash", "debt", "quality", "margin"]
      : key === "valuation" ? ["valuation", "value", "pe", "peg", "multiple"]
      : key === "gross_margin" ? ["gross_margin", "grossmargin"]
      : key === "per_share" ? ["per_share", "pershare"]
      : key === "tenbagger_path" ? ["tenbagger", "path"]
      : [key];
    const items = drivers.filter((item, index) => {
      if (assigned.has(index)) return false;
      const code = String(item.code || "").toLowerCase();
      const matches = aliases.some((alias) => code.includes(alias));
      if (matches) assigned.add(index);
      return matches;
    });
    return { key, label, items };
  });
  const ungrouped = drivers.filter((_, index) => !assigned.has(index));
  const populated = result.filter((group) => group.items.length);
  return ungrouped.length
    ? [...populated, { key: "other", label: "기타 확인 지표", items: ungrouped }]
    : populated;
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
        <time>{formatKst(generatedAt)}</time>
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

function MetadataStrip({ strategy, totalCount, benchmark, evidence, contractVersion }) {
  const items = [
    ["공식 추천", String(totalCount)],
    ["엔진", STRATEGIES[strategy].version],
    ["성과 근거", evidence.label],
    ["기준", benchmark || "QQQ"],
    ["실행", "OFFICIAL"],
    ["계약", contractVersion],
  ];
  return (
    <dl className="metadata-strip">
      {items.map(([label, value], index) => (
        <div key={label} className={index === 2 ? `is-evidence is-${evidence.level.toLowerCase()}` : ""}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecommendationTable({ recommendations, selectedSymbol, onPreview, onOpenDetail }) {
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
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="recommendation-mobile-list" aria-label="공식 추천 목록">
        {recommendations.map((item) => (
          <li key={`mobile:${item.run_id}:${item.signal_id || item.symbol}`}>
            <button type="button" onClick={() => onOpenDetail(item.symbol)}>
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
        <div className="empty-list">현재 실행에서 검색 조건과 일치하는 종목이 없습니다.</div>
      ) : null}
    </div>
  );
}

function DetailItems({ title, items, emptyText, limit = null }) {
  const visibleItems = limit ? items.slice(0, limit) : items;
  return (
    <section className="detail-rich-section">
      <h3>{title}</h3>
      {visibleItems.length ? (
        <div className="detail-evidence">
          {visibleItems.map((item, index) => (
            <div key={`${item.label}:${item.value}:${index}`}>
              {index === 0 ? <ShieldCheck size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
              <span>
                <small>{item.label}</small>
                {item.value}
                {item.basis ? <em>{item.basis}</em> : null}
              </span>
            </div>
          ))}
          {limit && items.length > limit ? (
            <p className="detail-more-count">외 {items.length - limit}개 항목은 전체 상세에서 확인</p>
          ) : null}
        </div>
      ) : <p className="detail-empty-copy">{emptyText}</p>}
    </section>
  );
}

function DetailPanel({ recommendation, strategy, run, previousContext, onClose, onOpenFull, compact = false, full = false }) {
  if (!recommendation) {
    return <aside className="detail-panel empty-detail">종목을 선택하면 상세 근거가 표시됩니다.</aside>;
  }
  const detail = getRecommendationDetail(recommendation);
  const driverGroups = groupDrivers(strategy || recommendation.strategy, detail.drivers);
  const previous = previousContext?.recommendation || null;
  const rankDelta = previous
    ? Number(previous.recommendation_rank) - Number(recommendation.recommendation_rank)
    : null;
  const scoreDelta = previous && Number.isFinite(Number(previous.score)) && Number.isFinite(Number(recommendation.score))
    ? Number(recommendation.score) - Number(previous.score)
    : null;

  if (full) {
    return (
      <article className="detail-dossier" aria-label={`${recommendation.symbol} 전체 상세`}>
        <header className="dossier-hero">
          <div>
            <p>{STRATEGIES[strategy || recommendation.strategy]?.label || recommendation.strategy}</p>
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

        <section className="dossier-section dossier-thesis">
          <p className="dossier-index">01</p>
          <div>
            <h2>왜 뽑혔나</h2>
            <p>{detail.summary}</p>
            {detail.catalyst ? <blockquote><strong>CATALYST</strong>{detail.catalyst}</blockquote> : null}
            {!detail.hasRichDetail ? <small>엔진 상세 미제공 · legacy fallback</small> : null}
          </div>
        </section>

        <section className="dossier-section">
          <p className="dossier-index">02</p>
          <div>
            <h2>무엇을 확인해야 하나</h2>
            <DetailItems title="핵심 확인 항목" items={detail.drivers} emptyText="엔진이 추가 확인 항목을 제공하지 않았습니다." limit={3} />
          </div>
        </section>

        <section className="dossier-section dossier-risk">
          <p className="dossier-index">03</p>
          <div>
            <h2>언제 투자 논리가 무효화되나</h2>
            <DetailItems title="공개 위험 조건" items={detail.risks} emptyText="공개 위험 조건이 제공되지 않았습니다." />
          </div>
        </section>

        <section className="dossier-section dossier-driver-groups">
          <p className="dossier-index">04</p>
          <div>
            <h2>{strategy || recommendation.strategy} 평가 근거</h2>
            {driverGroups.length ? <div className="driver-band-list">
              {driverGroups.map((group) => (
                <section key={group.key} className="driver-band">
                  <h3>{group.label}</h3>
                  {group.items.map((item, index) => (
                    <div key={`${item.label}:${index}`}>
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                      <small>{item.basis}</small>
                    </div>
                  ))}
                </section>
              ))}
            </div> : <p className="detail-empty-copy">전략별 평가 근거가 제공되지 않았습니다.</p>}
          </div>
        </section>

        <section className="dossier-section dossier-score">
          <p className="dossier-index">05</p>
          <div>
            <h2>비가산 평가 차원</h2>
            <p>아래 차원은 설명용 분해이며 화면에서 재합산하거나 재순위화하지 않습니다.</p>
            {detail.scoreBreakdown ? (
              <div className="score-dimension-list">
                {detail.scoreBreakdown.dimensions.map((item) => (
                  <div key={item.code}>
                    <span>{item.label}</span>
                    <strong>{formatCompactNumber(item.value)}</strong>
                    <small>{formatCompactNumber(item.scale_min)}–{formatCompactNumber(item.scale_max)}</small>
                  </div>
                ))}
              </div>
            ) : <p className="detail-empty-copy">score dimension이 제공되지 않았습니다.</p>}
          </div>
        </section>

        <section className="dossier-section dossier-change">
          <p className="dossier-index">06</p>
          <div>
            <h2>이전 동일 종목 실행 대비</h2>
            {previous ? (
              <dl>
                <div><dt>RANK</dt><dd>{previous.recommendation_rank} → {recommendation.recommendation_rank} {rankDelta ? `(${rankDelta > 0 ? "↑" : "↓"}${Math.abs(rankDelta)})` : "(—)"}</dd></div>
                <div><dt>SCORE</dt><dd>{formatNumber(previous.score)} → {formatNumber(recommendation.score)} {scoreDelta === null ? "" : `(${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(2)})`}</dd></div>
                <div><dt>PREVIOUS RUN</dt><dd>{previousContext.run.run_id}</dd></div>
              </dl>
            ) : <p className="detail-empty-copy">이전 실행에서 동일 종목 기록이 없습니다.</p>}
          </div>
        </section>

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
    <aside className={`detail-panel ${compact ? "is-compact" : ""}`} aria-label={`${recommendation.symbol} 미리보기`} aria-live="polite">
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
        <div><dt>SECTOR</dt><dd>{recommendation.sector || "—"}</dd></div>
        <div><dt>CONFIDENCE</dt><dd>{recommendation.confidence || "—"}</dd></div>
      </dl>
      <section className="detail-summary">
        <h3>SUMMARY</h3>
        <p>{detail.summary}</p>
        {!detail.hasRichDetail ? <small>LEGACY DETAIL FALLBACK</small> : null}
      </section>
      <DetailItems
        title="TOP DRIVERS"
        items={detail.catalyst ? [{ label: "CATALYST", value: detail.catalyst }, ...detail.drivers] : detail.drivers}
        emptyText="추가 선정 근거가 제공되지 않았습니다."
        limit={2}
      />
      <DetailItems title="PUBLIC RISK" items={detail.risks} emptyText="공개 위험 조건이 제공되지 않았습니다." limit={1} />
      {onOpenFull ? (
        <button type="button" className="detail-open-full" onClick={onOpenFull}>
          전체 상세 보기 <ChevronRight size={17} aria-hidden="true" />
        </button>
      ) : null}
    </aside>
  );
}

function PerformancePanel({ strategy, performance, evidenceStatus, range, setRange, benchmark = "QQQ" }) {
  const evidence = getPerformanceState(performance, evidenceStatus);
  const horizons = useMemo(() => ["5D", "10D", "20D"], []);
  const aggregateByHorizon = useMemo(() => new Map(
    horizons
      .map((item) => [item, getVerifiedAggregate(performance, strategy, item)])
      .filter(([, aggregate]) => Boolean(aggregate)),
  ), [horizons, performance, strategy]);
  const availableRanges = useMemo(
    () => horizons.filter((item) => aggregateByHorizon.has(item)),
    [aggregateByHorizon, horizons],
  );

  useEffect(() => {
    if (evidence.level !== "HOLD" && !aggregateByHorizon.has(range) && availableRanges.length) {
      setRange(availableRanges[0]);
    }
  }, [aggregateByHorizon, availableRanges, evidence.level, range, setRange]);

  const aggregate = aggregateByHorizon.get(range);
  const canPublish = evidence.level !== "HOLD" && Boolean(aggregate);
  const selectedHorizonStatus = evidence.horizonStatuses.find(
    (item) => item.strategy === strategy && String(item.horizon).toUpperCase() === range,
  );
  const runSeries = canPublish ? (performance?.run_series || []).filter(
    (item) => item.strategy === strategy
      && String(item.horizon).toUpperCase() === range
      && item.status === "VERIFIED",
  ) : [];
  const signals = canPublish ? (performance?.signals || []).filter(
    (item) => item.strategy === strategy
      && String(item.horizon).toUpperCase() === range
      && item.status === "VERIFIED",
  ) : [];
  const maxSeriesMagnitude = Math.max(
    0.0001,
    ...runSeries.map((item) => Math.abs(Number(item.excess_return))),
  );

  const readiness = horizons.map((horizon) => {
    const status = evidence.horizonStatuses.find(
      (item) => item.strategy === strategy && String(item.horizon).toUpperCase() === horizon,
    );
    return { horizon, status, aggregate: aggregateByHorizon.get(horizon) };
  });

  return (
    <section className="performance-panel" aria-labelledby="performance-title">
      <div className="section-heading-row">
        <h2 id="performance-title">BENCHMARK PERFORMANCE</h2>
        {canPublish ? (
          <div className="legend" aria-label="성과 비교 범례">
            <span><i className="legend-line is-amber" />{strategy}</span>
            <span><i className="legend-line is-cyan" />{benchmark}</span>
          </div>
        ) : null}
      </div>
      <div className={`evidence-panel is-${evidence.level.toLowerCase()}`} role="status">
        <EvidenceBadge evidence={evidence} />
        <p>{evidence.description}</p>
        <details>
          <summary>검증 방법과 상태 코드</summary>
          <code>{evidence.reason}{evidence.evaluatedAt ? ` · ${formatKst(evidence.evaluatedAt)}` : ""}</code>
        </details>
      </div>

      <div className="readiness-grid" aria-label={`${strategy} 기간별 검증 준비 상태`}>
        {readiness.map(({ horizon, status, aggregate: horizonAggregate }) => (
          <section className={`readiness-card is-${String(status?.status || "hold").toLowerCase()}`} key={horizon}>
            <div><strong>{horizon}</strong><span>{status?.status === "VERIFIED" ? "검증 완료" : "검증 대기"}</span></div>
            {evidence.level !== "HOLD" && horizonAggregate ? (
              <p>{strategy} {formatPercent(horizonAggregate.equal_weight_return)} · 초과 {formatPercent(horizonAggregate.equal_weight_excess_return)}</p>
            ) : (
              <p>관측 이력과 무결성 검증이 완료될 때 공개합니다.</p>
            )}
          </section>
        ))}
      </div>

      {evidence.level === "HOLD" ? (
        <div className="performance-empty">
          <p>검증 완료 전까지 성과 수치와 차트를 공개하지 않습니다.</p>
          <small>추천 목록은 공식 실행 결과이며, 성과 근거의 공개 준비 상태와 별개입니다.</small>
        </div>
      ) : (
        <>
          <div className="range-tabs" role="tablist" aria-label="성과 기간">
            {availableRanges.map((item) => (
              <button
                type="button"
                role="tab"
                id={`performance-tab-${strategy}-${item}`}
                aria-controls={`performance-panel-${strategy}`}
                aria-selected={range === item}
                tabIndex={range === item ? 0 : -1}
                className={range === item ? "is-active" : ""}
                onClick={() => setRange(item)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !availableRanges.length) return;
                  event.preventDefault();
                  const index = Math.max(0, availableRanges.indexOf(range));
                  const offset = event.key === "ArrowRight" ? 1 : -1;
                  const next = availableRanges[(index + offset + availableRanges.length) % availableRanges.length];
                  setRange(next);
                  requestAnimationFrame(() => document.getElementById(`performance-tab-${strategy}-${next}`)?.focus());
                }}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          {canPublish ? (
            <div id={`performance-panel-${strategy}`} role="tabpanel" aria-labelledby={`performance-tab-${strategy}-${range}`}>
              <dl className="performance-summary">
                <div><dt>{strategy} RETURN</dt><dd>{formatPercent(aggregate.equal_weight_return)}</dd></div>
                <div><dt>{benchmark}</dt><dd>{formatPercent(aggregate.qqq_equal_weight_return)}</dd></div>
                <div><dt>EXCESS</dt><dd>{formatPercent(aggregate.equal_weight_excess_return)}</dd></div>
                <div><dt>{benchmark} WIN RATE</dt><dd>{formatPercent(aggregate.qqq_win_rate)}</dd></div>
                <div><dt>COMPLETE RUNS</dt><dd>{selectedHorizonStatus?.complete_run_count ?? aggregate.run_count}</dd></div>
                <div><dt>SIGNALS</dt><dd>{selectedHorizonStatus?.underlying_signal_count ?? aggregate.count}</dd></div>
                <div><dt>LATEST MEASURE</dt><dd>{aggregate.measurement_session_max || "—"}</dd></div>
              </dl>

              <section className="performance-timeline" aria-labelledby={`timeline-title-${strategy}`}>
                <header>
                  <h3 id={`timeline-title-${strategy}`}>VERIFIED RUN EXCESS</h3>
                  <span>{runSeries.length} RUNS</span>
                </header>
                {runSeries.length ? runSeries.map((item) => (
                  <div className="timeline-row" key={`${item.run_id}:${item.report_date}`}>
                    <time dateTime={item.report_date}>{item.report_date}</time>
                    <div className="timeline-track" aria-hidden="true">
                      <i
                        className={Number(item.excess_return) >= 0 ? "is-positive" : "is-negative"}
                        style={{ width: `${Math.max(4, Math.abs(Number(item.excess_return)) / maxSeriesMagnitude * 100)}%` }}
                      />
                    </div>
                    <strong>{formatPercent(item.excess_return)}</strong>
                  </div>
                )) : <p className="detail-empty-copy">검증된 실행별 시계열이 아직 제공되지 않았습니다.</p>}
              </section>

              <details className="signals-details">
                <summary>검증 신호 {signals.length}건 보기</summary>
                {signals.length ? (
                  <div className="signals-table-wrap">
                    <table>
                      <thead><tr><th>종목</th><th>진입일</th><th>측정일</th><th>수익률</th><th>초과</th></tr></thead>
                      <tbody>{signals.map((item) => (
                        <tr key={`${item.run_id}:${item.signal_id}`}>
                          <th scope="row">{item.symbol}</th>
                          <td>{item.entry_session}</td>
                          <td>{item.measurement_session}</td>
                          <td>{formatPercent(item.signal_return)}</td>
                          <td>{formatPercent(item.excess_return)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p>검증된 개별 신호가 아직 제공되지 않았습니다.</p>}
              </details>
            </div>
          ) : <div className="performance-empty"><p>현재 전략에 검증 완료된 관측 기간이 없습니다.</p></div>}
        </>
      )}
    </section>
  );
}

function SelectionView({ payload, strategy, query, selectedRunId, selectedSymbol, onSelectSymbol, onOpenDetail, onLatest }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [range, setRange] = useState("5D");
  const tabletDetailTriggerRef = useRef(null);
  const tabletDrawerRef = useRef(null);
  const { latestRun, currentRun, requestedRunMissing } = useMemo(
    () => resolveSelectedRun(payload.runs, strategy, selectedRunId),
    [payload.runs, selectedRunId, strategy],
  );
  const allRecommendations = useMemo(
    () => currentRun ? getRunRecommendations(payload.recommendations, strategy, currentRun.run_id) : [],
    [currentRun, payload.recommendations, strategy],
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
  const previousContext = useMemo(
    () => getPreviousRecommendation(payload.runs, payload.recommendations, currentRun, resolvedSelected?.symbol),
    [currentRun, payload.recommendations, payload.runs, resolvedSelected?.symbol],
  );
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
        <MetadataStrip
          strategy={strategy}
          totalCount={allRecommendations.length}
          benchmark={payload.benchmark}
          evidence={evidence}
          contractVersion={payload.contract_version}
        />
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
            onPreview={onSelectSymbol}
            onOpenDetail={(symbol) => onOpenDetail(currentRun.run_id, symbol)}
          />
        </section>
        <div className="desktop-detail">
          <DetailPanel
            recommendation={resolvedSelected}
            strategy={strategy}
            run={currentRun}
            previousContext={previousContext}
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
                previousContext={previousContext}
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
          evidenceStatus={payload.evidence_status}
          benchmark={payload.benchmark}
          range={range}
          setRange={setRange}
        />
      </div>
    </div>
  );
}

function OverviewView({ payload, onStrategy }) {
  const evidence = getPerformanceState(payload.performance, payload.evidence_status);
  const latestRuns = Object.keys(STRATEGIES).map((strategy) => {
    const run = sortRunsNewestFirst(payload.runs.filter((item) => item.strategy === strategy))[0];
    return {
      strategy,
      run,
      count: run ? getRunRecommendations(payload.recommendations, strategy, run.run_id).length : 0,
    };
  });
  return (
    <section className="secondary-view overview-view">
      <header>
        <p>GENERAL / OVERVIEW</p>
        <h1>OFFICIAL SCREENERS</h1>
        <span>두 엔진의 공식 순위와 점수는 서로 합산하거나 재정렬하지 않습니다.</span>
        <EvidenceBadge evidence={evidence} />
      </header>
      <div className="overview-list">
        {latestRuns.map(({ strategy, run, count }) => (
          <button type="button" key={strategy} onClick={() => onStrategy(strategy)} disabled={!run}>
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
        <div><dt>EVIDENCE</dt><dd>{evidence.label}</dd></div>
        <div><dt>LAST SYNC</dt><dd>{formatKst(payload.generated_at)}</dd></div>
      </dl>
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

function HistoryView({ payload, onStrategy }) {
  const [filter, setFilter] = useState("ALL");
  const [historyQuery, setHistoryQuery] = useState("");
  const runs = useMemo(() => sortRunsNewestFirst(payload.runs), [payload.runs]);
  const latestRunIds = useMemo(() => new Set(
    Object.keys(STRATEGIES)
      .map((strategy) => runs.find((run) => run.strategy === strategy))
      .filter(Boolean)
      .map((run) => `${run.strategy}:${run.run_id}`),
  ), [runs]);
  const filteredRuns = runs.filter((run) => {
    if (filter !== "ALL" && run.strategy !== filter) return false;
    const haystack = `${run.strategy} ${run.run_id} ${run.report_created_at} ${run.report_date || ""}`.toUpperCase();
    return haystack.includes(historyQuery.trim().toUpperCase());
  });

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
          placeholder="Search run ID or date..."
          startIcon={<Search size={16} />}
          hasClear
          width="100%"
          size="lg"
        />
      </div>
      <p className="history-result-count" aria-live="polite">{filteredRuns.length} / {runs.length} RUNS</p>
      <div className="history-list">
        {filteredRuns.map((run) => {
          const picks = getRunRecommendations(payload.recommendations, run.strategy, run.run_id);
          const summary = summarizeRunChanges(payload.runs, payload.recommendations, run);
          const isLatest = latestRunIds.has(`${run.strategy}:${run.run_id}`);
          return (
            <button type="button" key={`${run.strategy}:${run.run_id}`} onClick={() => onStrategy(run.strategy, run.run_id)}>
              <span className="history-engine">{run.strategy}</span>
              <span>{formatKst(run.report_created_at)}</span>
              <span>RUN {run.run_id}</span>
              <span>{picks.length} PICKS {isLatest ? <b>LATEST</b> : null}</span>
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
        <h1>{evidence.level === "HOLD" ? `${strategy} PERFORMANCE ON HOLD` : `${strategy} VS ${payload.benchmark || "QQQ"}`}</h1>
        <span>공식 추천 이후 동일 기간 성과 비교이며, 검증된 관측 구간만 공개합니다.</span>
      </header>
      <PerformancePanel
        strategy={strategy}
        performance={payload.performance}
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
        <div><dt>PROVENANCE</dt><dd><strong>RUN ID + SOURCE TIME</strong><span>결과마다 실행 ID와 생성 시각을 유지합니다.</span></dd></div>
      </dl>
    </section>
  );
}

function FullDetailView({ payload, route, onBack }) {
  const run = payload.runs.find(
    (item) => item.strategy === route.strategy && String(item.run_id) === String(route.runId),
  );
  const recommendation = payload.recommendations.find(
    (item) => item.strategy === route.strategy
      && String(item.run_id) === String(route.runId)
      && item.symbol === route.symbol,
  );
  const previousContext = getPreviousRecommendation(
    payload.runs,
    payload.recommendations,
    run,
    recommendation?.symbol,
  );

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
        previousContext={previousContext}
        full
      />
    </section>
  );
}

function Dashboard({ payload, onLock }) {
  const [route, navigate] = useHashRoute();
  const [query, setQuery] = useState("");
  const [previewSymbols, setPreviewSymbols] = useState({});
  const scrollPositionsRef = useRef(new Map());
  const previousRouteKeyRef = useRef(null);
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
    const previousRouteKey = previousRouteKeyRef.current;
    if (previousRouteKey) scrollPositionsRef.current.set(previousRouteKey, window.scrollY);
    const targetScroll = scrollPositionsRef.current.get(routeKey) ?? 0;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: targetScroll, left: 0, behavior: "auto" });
    });
    previousRouteKeyRef.current = routeKey;
    return () => cancelAnimationFrame(frame);
  }, [routeKey]);

  const selectStrategy = useCallback((nextStrategy, runId = null) => {
    setQuery("");
    navigate({ view: "selection", strategy: nextStrategy, runId });
  }, [navigate]);

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
    content = <OverviewView payload={payload} onStrategy={selectStrategy} />;
  } else if (route.view === "history") {
    content = <HistoryView payload={payload} onStrategy={selectStrategy} />;
  } else if (route.view === "performance") {
    content = <StandalonePerformanceView payload={payload} strategy={strategy} />;
  } else if (route.view === "methodology") {
    content = <MethodologyView benchmark={payload.benchmark} />;
  } else if (route.view === "detail") {
    content = (
      <FullDetailView
        payload={payload}
        route={route}
        onBack={() => navigate({ view: "selection", strategy, runId: route.runId })}
      />
    );
  } else {
    content = (
      <SelectionView
        payload={payload}
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
