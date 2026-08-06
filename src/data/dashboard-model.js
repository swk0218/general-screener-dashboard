const STRATEGY_IDS = new Set(["MLG", "TENX"]);
const VIEW_IDS = new Set(["overview", "history", "methodology"]);
const EVIDENCE_LEVELS = new Set(["HOLD", "PARTIAL", "READY"]);
const EMPTY_LIST = Object.freeze([]);

function normalizeStrategy(value) {
  const strategy = String(value || "").toUpperCase();
  return STRATEGY_IDS.has(strategy) ? strategy : "MLG";
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return "";
  }
}

export function parseHashRoute(hash = "") {
  const path = String(hash).replace(/^#\/?/, "");
  const segments = path.split("/").filter(Boolean).map(decodeSegment);
  const [view, strategyValue, runId, symbol] = segments;

  if (view === "selection" || view === "screener") {
    return {
      view: "selection",
      strategy: normalizeStrategy(strategyValue),
      runId: runId || null,
      symbol: null,
    };
  }

  if (view === "detail" && runId && symbol) {
    return {
      view: "detail",
      strategy: normalizeStrategy(strategyValue),
      runId,
      symbol: String(symbol).toUpperCase(),
    };
  }

  if (view === "performance") {
    return {
      view: "performance",
      strategy: normalizeStrategy(strategyValue),
      runId: null,
      symbol: null,
    };
  }

  if (VIEW_IDS.has(view)) {
    return { view, strategy: "MLG", runId: null, symbol: null };
  }

  return { view: "overview", strategy: "MLG", runId: null, symbol: null };
}

export function serializeHashRoute(route) {
  const strategy = normalizeStrategy(route?.strategy);
  if (route?.view === "detail" && route.runId && route.symbol) {
    return `#/detail/${strategy}/${encodeURIComponent(route.runId)}/${encodeURIComponent(route.symbol)}`;
  }
  if (route?.view === "selection") {
    const suffix = route.runId ? `/${encodeURIComponent(route.runId)}` : "";
    return `#/selection/${strategy}${suffix}`;
  }
  if (route?.view === "performance") return `#/performance/${strategy}`;
  if (VIEW_IDS.has(route?.view)) return `#/${route.view}`;
  return "#/overview";
}

export function getEvidenceState(rawStatus) {
  const raw = String(rawStatus || "HOLD: UNKNOWN").trim();
  const [prefix, ...reasonParts] = raw.split(":");
  const level = EVIDENCE_LEVELS.has(prefix.toUpperCase()) ? prefix.toUpperCase() : "HOLD";
  const reason = reasonParts.join(":").trim() || (level === "READY" ? "VALIDATED" : "UNKNOWN");
  const copy = {
    HOLD: {
      label: "성과 근거 보류",
      description: "검증 기준을 충족할 때까지 성과 수치를 공개하지 않습니다.",
    },
    PARTIAL: {
      label: "성과 근거 일부 준비",
      description: "검증을 통과한 관측 기간만 제한적으로 공개합니다.",
    },
    READY: {
      label: "성과 근거 준비됨",
      description: "보관된 관측 이력과 무결성 검증을 통과한 성과입니다.",
    },
  }[level];

  return { raw, level, reason, ...copy };
}

export function getPerformanceState(performance, legacyEvidenceStatus) {
  const status = String(performance?.status || "").toUpperCase();
  const isExactContract = ["PENDING", "PARTIAL", "READY", "HOLD"].includes(status)
    && Array.isArray(performance?.horizon_statuses);
  if (!isExactContract) {
    const legacy = getEvidenceState(legacyEvidenceStatus);
    return {
      ...legacy,
      raw: `HOLD: LEGACY_PERFORMANCE_CONTRACT (${legacy.raw})`,
      level: "HOLD",
      reason: "LEGACY_PERFORMANCE_CONTRACT",
      label: "성과 근거 보류",
      description: "구 성과 계약은 상태별 검증 근거가 없어 수치를 공개하지 않습니다.",
      evaluatedAt: null,
      horizonStatuses: [],
      isExactContract: false,
    };
  }

  const level = status === "READY" ? "READY" : status === "PARTIAL" ? "PARTIAL" : "HOLD";
  const evidence = getEvidenceState(`${level}: ${performance.reason_code || status}`);
  return {
    ...evidence,
    raw: `${status}: ${performance.reason_code || status}`,
    evaluatedAt: performance.evaluated_at,
    horizonStatuses: performance.horizon_statuses,
    isExactContract: true,
  };
}

export function getVerifiedAggregate(performance, strategy, horizon) {
  const state = getPerformanceState(performance, "HOLD: UNKNOWN");
  if (!["READY", "PARTIAL"].includes(state.level)) return null;
  const normalizedHorizon = String(horizon).toLowerCase();
  const horizonStatus = state.horizonStatuses.find(
    (item) => item.strategy === strategy
      && String(item.horizon).toLowerCase() === normalizedHorizon
      && item.status === "VERIFIED",
  );
  if (!horizonStatus) return null;
  return (performance?.aggregates || []).find(
    (item) => item.strategy === strategy
      && String(item.horizon).toLowerCase() === normalizedHorizon
      && item.status === "VERIFIED",
  ) || null;
}

function runTimestamp(run) {
  const value = Date.parse(run?.report_created_at || run?.report_date || "");
  return Number.isFinite(value) ? value : 0;
}

export function sortRunsNewestFirst(runs) {
  return [...(runs || [])].sort((a, b) => runTimestamp(b) - runTimestamp(a));
}

export function getRunRecommendations(recommendations, strategy, runId) {
  return (recommendations || [])
    .filter((item) => item.strategy === strategy && String(item.run_id) === String(runId))
    .sort((a, b) => Number(a.recommendation_rank) - Number(b.recommendation_rank));
}

function runIndexKey(strategy, runId) {
  return `${String(strategy || "").toUpperCase()}:${String(runId)}`;
}

function recommendationIndexKey(strategy, runId, symbol) {
  return `${runIndexKey(strategy, runId)}:${String(symbol || "").toUpperCase()}`;
}

function symbolIndexKey(strategy, symbol) {
  return `${String(strategy || "").toUpperCase()}:${String(symbol || "").toUpperCase()}`;
}

function optionalNumber(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}

function makeTransition(status, run, recommendation, previousRecommendation, missingRunCount, streak) {
  const currentRank = optionalNumber(recommendation?.recommendation_rank);
  const currentScore = optionalNumber(recommendation?.score);
  const previousRank = optionalNumber(previousRecommendation?.recommendation_rank);
  const previousScore = optionalNumber(previousRecommendation?.score);
  return Object.freeze({
    status,
    strategy: run.strategy,
    symbol: recommendation?.symbol || previousRecommendation?.symbol,
    companyName: recommendation?.company_name || previousRecommendation?.company_name || null,
    runId: String(run.run_id),
    reportCreatedAt: run.report_created_at,
    reportDate: run.report_date || null,
    recommendation: recommendation || null,
    previousRunId: previousRecommendation ? String(previousRecommendation.run_id) : null,
    currentRank,
    currentScore,
    previousRank,
    previousScore,
    rankDelta: currentRank === null || previousRank === null ? null : previousRank - currentRank,
    scoreDelta: currentScore === null || previousScore === null ? null : currentScore - previousScore,
    missingRunCount,
    streak,
  });
}

/**
 * Builds the lookup tables used by the dashboard once per decrypted payload.
 * Map keys use `STRATEGY:RUN_ID` and `STRATEGY:RUN_ID:SYMBOL` respectively.
 */
export function createDashboardIndex(payload = {}) {
  const runs = Object.freeze(sortRunsNewestFirst(payload.runs || []));
  const recommendations = payload.recommendations || [];
  const runsByStrategy = new Map();
  const runByKey = new Map();
  const recommendationsByRun = new Map();
  const recommendationByRunSymbol = new Map();
  const runChangesByKey = new Map();
  const symbolTimelineByStrategySymbol = new Map();
  const historySearchTextByRun = new Map();

  STRATEGY_IDS.forEach((strategy) => runsByStrategy.set(strategy, []));
  runs.forEach((run) => {
    const key = runIndexKey(run.strategy, run.run_id);
    runByKey.set(key, run);
    recommendationsByRun.set(key, []);
    if (!runsByStrategy.has(run.strategy)) runsByStrategy.set(run.strategy, []);
    runsByStrategy.get(run.strategy).push(run);
  });

  recommendations.forEach((recommendation) => {
    const key = runIndexKey(recommendation.strategy, recommendation.run_id);
    if (!recommendationsByRun.has(key)) recommendationsByRun.set(key, []);
    recommendationsByRun.get(key).push(recommendation);
    recommendationByRunSymbol.set(
      recommendationIndexKey(recommendation.strategy, recommendation.run_id, recommendation.symbol),
      recommendation,
    );
  });

  runsByStrategy.forEach((strategyRuns, strategy) => {
    const frozenRuns = Object.freeze([...strategyRuns]);
    runsByStrategy.set(strategy, frozenRuns);
    const chronologicalRuns = [...frozenRuns].reverse();
    let previousRecommendations = new Map();
    const lastSeen = new Map();
    const streakBySymbol = new Map();
    const timelineEventsBySymbol = new Map();

    chronologicalRuns.forEach((run, runIndex) => {
      const key = runIndexKey(strategy, run.run_id);
      const sortedRecommendations = Object.freeze(
        [...(recommendationsByRun.get(key) || [])]
          .sort((a, b) => Number(a.recommendation_rank) - Number(b.recommendation_rank)),
      );
      recommendationsByRun.set(key, sortedRecommendations);
      const currentRecommendations = new Map(
        sortedRecommendations.map((recommendation) => [String(recommendation.symbol).toUpperCase(), recommendation]),
      );
      const added = [];
      const removed = [];
      const retained = [];
      const newSymbols = [];
      const reenteredSymbols = [];
      const transitions = [];

      sortedRecommendations.forEach((recommendation) => {
        const symbol = String(recommendation.symbol).toUpperCase();
        const immediatePrevious = previousRecommendations.get(symbol) || null;
        const priorAppearance = lastSeen.get(symbol) || null;
        const status = immediatePrevious ? "RETAINED" : priorAppearance ? "RE-ENTRY" : "NEW";
        const missingRunCount = priorAppearance ? Math.max(0, runIndex - priorAppearance.runIndex - 1) : 0;
        const streak = immediatePrevious ? (streakBySymbol.get(symbol) || 0) + 1 : 1;
        const transition = makeTransition(
          status,
          run,
          recommendation,
          immediatePrevious || priorAppearance?.recommendation || null,
          missingRunCount,
          streak,
        );
        transitions.push(transition);
        if (!timelineEventsBySymbol.has(symbol)) timelineEventsBySymbol.set(symbol, []);
        timelineEventsBySymbol.get(symbol).push(transition);
        if (status === "RETAINED") retained.push(symbol);
        else {
          added.push(symbol);
          if (status === "NEW") newSymbols.push(symbol);
          else reenteredSymbols.push(symbol);
        }
        streakBySymbol.set(symbol, streak);
        lastSeen.set(symbol, { runIndex, recommendation });
      });

      [...previousRecommendations.entries()]
        .filter(([symbol]) => !currentRecommendations.has(symbol))
        .sort(([, left], [, right]) => Number(left.recommendation_rank) - Number(right.recommendation_rank))
        .forEach(([symbol, previousRecommendation]) => {
          const transition = makeTransition(
            "EXIT",
            run,
            null,
            previousRecommendation,
            1,
            streakBySymbol.get(symbol) || 0,
          );
          removed.push(symbol);
          transitions.push(transition);
          if (!timelineEventsBySymbol.has(symbol)) timelineEventsBySymbol.set(symbol, []);
          timelineEventsBySymbol.get(symbol).push(transition);
          streakBySymbol.set(symbol, 0);
        });

      runChangesByKey.set(key, Object.freeze({
        previousRunId: runIndex ? String(chronologicalRuns[runIndex - 1].run_id) : null,
        added: Object.freeze(added),
        removed: Object.freeze(removed),
        retained: Object.freeze(retained),
        newSymbols: Object.freeze(newSymbols),
        reenteredSymbols: Object.freeze(reenteredSymbols),
        transitions: Object.freeze(transitions),
        isBaseline: runIndex === 0,
      }));
      previousRecommendations = currentRecommendations;
    });

    timelineEventsBySymbol.forEach((events, symbol) => {
      const selectedEvents = events.filter((event) => event.status !== "EXIT");
      const newestRun = frozenRuns[0] || null;
      const newestRecommendation = newestRun
        ? recommendationByRunSymbol.get(recommendationIndexKey(strategy, newestRun.run_id, symbol))
        : null;
      symbolTimelineByStrategySymbol.set(symbolIndexKey(strategy, symbol), Object.freeze({
        strategy,
        symbol,
        totalRunCount: frozenRuns.length,
        selectedRunCount: selectedEvents.length,
        currentStreak: newestRecommendation ? (selectedEvents.at(-1)?.streak || 0) : 0,
        maxStreak: selectedEvents.reduce((maximum, event) => Math.max(maximum, event.streak), 0),
        firstSeenRunId: selectedEvents.length ? selectedEvents[0].runId : null,
        latestSeenRunId: selectedEvents.length ? selectedEvents.at(-1).runId : null,
        entries: Object.freeze([...events].reverse()),
      }));
    });
  });

  recommendationsByRun.forEach((items, key) => {
    if (!Object.isFrozen(items)) recommendationsByRun.set(key, Object.freeze([...items]));
  });
  runs.forEach((run) => {
    const key = runIndexKey(run.strategy, run.run_id);
    const recommendationText = (recommendationsByRun.get(key) || []).flatMap((item) => (
      [item.symbol, item.company_name || ""]
    ));
    const transitionText = (runChangesByKey.get(key)?.transitions || []).flatMap((item) => (
      [item.symbol, item.companyName || "", item.status]
    ));
    historySearchTextByRun.set(key, [
      run.strategy,
      run.run_id,
      run.report_created_at,
      run.report_date || "",
      ...recommendationText,
      ...transitionText,
    ].join(" ").toUpperCase());
  });

  return Object.freeze({
    runs,
    runsByStrategy,
    runByKey,
    recommendationsByRun,
    recommendationByRunSymbol,
    runChangesByKey,
    symbolTimelineByStrategySymbol,
    historySearchTextByRun,
  });
}

export function getIndexedRunRecommendations(index, strategy, runId) {
  return index?.recommendationsByRun?.get(runIndexKey(strategy, runId)) || EMPTY_LIST;
}

export function getIndexedRecommendation(index, strategy, runId, symbol) {
  return index?.recommendationByRunSymbol?.get(recommendationIndexKey(strategy, runId, symbol)) || null;
}

export function getIndexedRunChanges(index, strategy, runId) {
  return index?.runChangesByKey?.get(runIndexKey(strategy, runId)) || null;
}

export function getSymbolTimeline(index, strategy, symbol) {
  return index?.symbolTimelineByStrategySymbol?.get(symbolIndexKey(strategy, symbol)) || Object.freeze({
    strategy: String(strategy || "").toUpperCase(),
    symbol: String(symbol || "").toUpperCase(),
    totalRunCount: index?.runsByStrategy?.get(String(strategy || "").toUpperCase())?.length || 0,
    selectedRunCount: 0,
    currentStreak: 0,
    maxStreak: 0,
    firstSeenRunId: null,
    latestSeenRunId: null,
    entries: EMPTY_LIST,
  });
}

export function searchHistoryRuns(index, { strategy = "ALL", query = "" } = {}) {
  if (!index?.runs) return EMPTY_LIST;
  const normalizedStrategy = String(strategy || "ALL").toUpperCase();
  const terms = String(query || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (normalizedStrategy === "ALL" && !terms.length) return index.runs;
  return index.runs.filter((run) => {
    if (normalizedStrategy !== "ALL" && run.strategy !== normalizedStrategy) return false;
    if (!terms.length) return true;
    const haystack = index.historySearchTextByRun.get(runIndexKey(run.strategy, run.run_id)) || "";
    return terms.every((term) => haystack.includes(term));
  });
}

export function resolveSelectedRun(runs, strategy, runId) {
  const strategyRuns = sortRunsNewestFirst((runs || []).filter((item) => item.strategy === strategy));
  const latestRun = strategyRuns[0] || null;
  if (runId === null || runId === undefined) {
    return { latestRun, currentRun: latestRun, requestedRunMissing: false };
  }
  const currentRun = strategyRuns.find((item) => String(item.run_id) === String(runId)) || null;
  return {
    latestRun,
    currentRun,
    requestedRunMissing: Boolean(latestRun && !currentRun),
  };
}

export function summarizeRunChanges(runs, recommendations, run) {
  if (!run) return null;
  const sameStrategy = sortRunsNewestFirst((runs || []).filter((item) => item.strategy === run.strategy));
  const currentIndex = sameStrategy.findIndex((item) => String(item.run_id) === String(run.run_id));
  const previousRun = currentIndex >= 0 ? sameStrategy[currentIndex + 1] : null;
  const currentSymbols = new Set(
    getRunRecommendations(recommendations, run.strategy, run.run_id).map((item) => item.symbol),
  );

  if (!previousRun) {
    return {
      previousRunId: null,
      added: [...currentSymbols],
      removed: [],
      retained: [],
      isBaseline: true,
    };
  }

  const previousSymbols = new Set(
    getRunRecommendations(recommendations, previousRun.strategy, previousRun.run_id).map((item) => item.symbol),
  );
  return {
    previousRunId: String(previousRun.run_id),
    added: [...currentSymbols].filter((symbol) => !previousSymbols.has(symbol)),
    removed: [...previousSymbols].filter((symbol) => !currentSymbols.has(symbol)),
    retained: [...currentSymbols].filter((symbol) => previousSymbols.has(symbol)),
    isBaseline: false,
  };
}

export function getPreviousRecommendation(runs, recommendations, currentRun, symbol) {
  if (!currentRun || !symbol) return null;
  const sameStrategy = sortRunsNewestFirst((runs || []).filter((item) => item.strategy === currentRun.strategy));
  const currentIndex = sameStrategy.findIndex((item) => String(item.run_id) === String(currentRun.run_id));
  if (currentIndex < 0) return null;
  for (let index = currentIndex + 1; index < sameStrategy.length; index += 1) {
    const previous = (recommendations || []).find(
      (item) => item.strategy === currentRun.strategy
        && String(item.run_id) === String(sameStrategy[index].run_id)
        && item.symbol === symbol,
    );
    if (previous) return { run: sameStrategy[index], recommendation: previous };
  }
  return null;
}

export function parseLegacyRiskFlags(raw) {
  if (!raw) return [];
  return String(raw)
    .split("|")
    .map((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 0) return { label: "NOTE", value: entry.trim(), tone: "neutral" };
      return {
        label: entry.slice(0, separator).trim().replaceAll("_", " ").toUpperCase(),
        value: entry.slice(separator + 1).trim(),
        tone: "neutral",
      };
    })
    .filter((item) => item.value);
}

function cleanEvidenceValue(value) {
  const text = String(value || "").trim();
  if (!text || /증거 신호\s*0개/.test(text)) return null;
  const segments = text.split("|").map((segment) => segment.trim()).filter(Boolean);
  const useful = segments.filter((segment) => !/\bN\/A\b/i.test(segment) && segment !== "—");
  return useful.length ? useful.join(" | ") : null;
}

export function getRecommendationDetail(recommendation) {
  if (!recommendation) return null;
  const rich = recommendation.detail && typeof recommendation.detail === "object"
    ? recommendation.detail
    : {};
  const isComplete = rich.contract_version === "recommendation_detail_v1" && rich.status === "complete";
  if (!isComplete) {
    return {
      summary: "추가 상세 설명이 제공되지 않았습니다. 공식 필드와 위험 플래그를 확인하세요.",
      catalyst: null,
      drivers: [],
      risks: parseLegacyRiskFlags(recommendation.risk_flags),
      metrics: [],
      timing: null,
      scoreBreakdown: null,
      detailProvenance: null,
      hasRichDetail: false,
    };
  }

  const drivers = (rich.drivers || []).map((item) => ({
    label: item.label,
    value: cleanEvidenceValue(item.value),
    basis: item.basis === "deterministic_public_formatter" ? "공식 엔진 공개 포맷" : null,
    code: item.code,
    format: item.format,
  })).filter((item) => item.value);
  const risks = (rich.risks || []).map((item) => ({
    label: item.label,
    value: item.category,
    basis: item.basis === "deterministic_public_label"
      ? "공식 엔진 공개 라벨"
      : item.basis === "deterministic_public_formatter" ? "공식 엔진 공개 포맷" : null,
    code: item.code,
  }));
  const timingMetrics = [
    ["RSI14", rich.timing?.rsi14],
    ["HEAT", rich.timing?.heat],
    ["WARNING", rich.timing?.warning],
    ["PRICE AS OF", rich.timing?.price_as_of],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: String(value), basis: "TIMING" }));
  const scoreMetrics = [
    rich.score_breakdown?.total !== null && rich.score_breakdown?.total !== undefined ? {
      label: rich.score_breakdown.score_name,
      value: String(rich.score_breakdown.total),
      basis: "전략 고유 비가산 점수",
    } : null,
    ...(rich.score_breakdown?.dimensions || []).map((item) => ({
      label: item.label,
      value: String(item.value),
      basis: `${item.scale_min}–${item.scale_max}`,
      code: item.code,
    })),
  ].filter(Boolean);
  return {
    summary: rich.thesis.summary || "공개 가능한 선정 요약이 아직 제공되지 않았습니다.",
    catalyst: rich.thesis.catalyst,
    drivers,
    risks,
    metrics: [...timingMetrics, ...scoreMetrics],
    timing: rich.timing,
    scoreBreakdown: rich.score_breakdown,
    detailProvenance: recommendation.detail_provenance || null,
    hasRichDetail: true,
  };
}
