import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardIndex,
  getSelectionContext,
  getEvidenceState,
  getIndexedRecommendation,
  getIndexedRunChanges,
  getIndexedRunRecommendations,
  getPerformanceState,
  getPreviousRecommendation,
  getRecommendationDetail,
  readableTenxText,
  compactTenxFacts,
  getSymbolTimeline,
  getUnifiedPerformanceCell,
  getVerifiedAggregate,
  parseHashRoute,
  resolveSelectedRun,
  searchHistoryRuns,
  searchSecurities,
  serializeHashRoute,
  summarizeRunChanges,
} from "../src/data/dashboard-model.js";

test("compact TENX facts preserve stored points, denominator and missing-price status", () => {
  const detail = {drivers: [
    {code: "price_exposure", value: "V=0.935, α=0.25; 42GV 25.10점 / 33GY 9.61점 / 25GCV 10.27점; 가격입력 결측 사전값 적용"},
    {code: "growth", value: "연간 CAGR +372.9%; GP CAGR +378.7%"},
    {code: "cash_support", value: "운전자본·주식보상 조정 영업현금 / GP(2년 합계 참고값) +55.6%; 주주귀속현금 아님"},
  ], catalyst: "FY2: 실제 기준 FY 대비 전망비율 +418.8% — 애널리스트 전망비율이며 회사 가이던스 아님"};
  const before = structuredClone(detail);
  const facts = compactTenxFacts(detail);
  assert.deepEqual(detail, before);
  assert.deepEqual(facts.points.slice(0, 3).map(row => row.value), ["25.10점", "9.61점", "10.27점"]);
  assert.equal(facts.points[3].value, "가격 자료 부족에 따른 기본값 적용");
  assert.equal(facts.growth[0].value, "+372.9%");
  assert.equal(facts.growth[2].value, "2년 합계 +55.6%");
  assert.match(facts.growth.at(-1).label, /애널리스트 기준연도 대비/);
  assert.equal(facts.growth.at(-1).value, "다음 전망연도 +418.8%");
  assert.equal(compactTenxFacts({drivers: [{code: "price_exposure", value: "자료 없음"}]}).points[0].value, "자료 없음");
});

test("TENX display translates stored contributions and cumulative forecasts without scoring", () => {
  assert.equal(readableTenxText("V=0.935, α=0.25; 42GV 25.10점 / 33GY 9.61점 / 25GCV 10.27점; V는 비용률 없는 가격부담 계수"),
    "성장 25.10점 / 가격 9.61점 / 현금 10.27점");
  assert.equal(readableTenxText("FY2: 실제 기준 FY 대비 전망비율 +418.8% — 애널리스트 전망비율이며 회사 가이던스 아님"),
    "다음 전망연도 +418.8% — 애널리스트 기준연도 대비 예상 매출 증가율");
  assert.match(readableTenxText("V=1.000, α=0.25; 42GV 20.00점; V는 비용률 없는 가격부담 계수, G·C 원점수와 실제 기여를 구분; 가격입력 결측 사전값 적용"),
    /성장 20\.00점; 가격 자료 부족에 따른 기본값 적용$/);
});

test("TENX does not subtract scores across engine definitions; same-definition and MLG remain comparable", () => {
  for (const [strategy, oldName, expected] of [["TENX", "tenx_final_score", null], ["TENX", "tenx_score", -40], ["MLG", "legacy", -40]]) {
    const payload = {
      runs: [
        { strategy, run_id: "1", report_created_at: "2026-09-01T00:00:00Z" },
        { strategy, run_id: "2", report_created_at: "2026-09-08T00:00:00Z" },
      ],
      recommendations: [
        { strategy, run_id: "1", symbol: "EXAMPLE", recommendation_rank: 2, score: 80, detail: { score_breakdown: { score_name: oldName } } },
        { strategy, run_id: "2", symbol: "EXAMPLE", recommendation_rank: 1, score: 40, detail: { score_breakdown: { score_name: "tenx_score" } } },
      ],
    };
    const before = JSON.stringify(payload);
    const transition = getIndexedRunChanges(createDashboardIndex(payload), strategy, "2").transitions[0];
    assert.equal(transition.scoreDelta, expected);
    assert.equal(transition.rankDelta, 1);
    assert.equal(JSON.stringify(payload), before);
  }
});

test("round-trips screener and full detail hash routes", () => {
  const historical = { view: "selection", strategy: "TENX", runId: "run / 2" };
  assert.match(serializeHashRoute(historical), /^#\/selection\/TENX/);
  assert.deepEqual(parseHashRoute(serializeHashRoute(historical)), {
    view: "selection",
    strategy: "TENX",
    runId: "run / 2",
    symbol: null,
  });

  const detail = { view: "detail", strategy: "MLG", runId: "run-1", symbol: "BRK.B" };
  assert.deepEqual(parseHashRoute(serializeHashRoute(detail)), detail);
});

test("round-trips every methodology section and defaults invalid sections closed", () => {
  for (const section of ["mlg", "tenx", "performance", "operations"]) {
    assert.deepEqual(parseHashRoute(serializeHashRoute({ view: "methodology", section })), {
      view: "methodology",
      strategy: "MLG",
      runId: null,
      symbol: null,
      section,
    });
  }
  assert.equal(parseHashRoute("#/methodology/unknown").section, "mlg");
});

test("fails unknown evidence states closed and preserves READY/PARTIAL", () => {
  assert.equal(getEvidenceState("UNKNOWN: SOURCE").level, "HOLD");
  assert.equal(getEvidenceState("HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING").reason, "PRICE_OBSERVATION_ARCHIVE_PENDING");
  assert.equal(getEvidenceState("PARTIAL: 5D_ONLY").level, "PARTIAL");
  assert.equal(getEvidenceState("READY: VALIDATED").level, "READY");
});

test("keeps legacy performance contracts on HOLD and exposes VERIFIED exact aggregates only", () => {
  const legacy = { aggregates: [{ strategy: "MLG", horizon: "5d", status: "VERIFIED" }] };
  assert.equal(getPerformanceState(legacy, "READY: LEGACY").level, "HOLD");
  assert.equal(getVerifiedAggregate(legacy, "MLG", "5D"), null);

  const exact = {
    status: "PARTIAL",
    reason_code: "TEN_DAY_PENDING",
    evaluated_at: "2026-08-06T00:00:00Z",
    horizon_statuses: [
      { strategy: "MLG", horizon: "5d", status: "VERIFIED" },
      { strategy: "MLG", horizon: "10d", status: "PENDING" },
    ],
    aggregates: [
      { strategy: "MLG", horizon: "5d", status: "VERIFIED", equal_weight_return: 0.1 },
      { strategy: "MLG", horizon: "10d", status: "VERIFIED", equal_weight_return: 0.2 },
    ],
  };
  assert.equal(getVerifiedAggregate(exact, "MLG", "5D")?.equal_weight_return, 0.1);
  assert.equal(getVerifiedAggregate(exact, "MLG", "10D"), null);
});


test("unifies 11 reconstructed and 2 verified MLG runs into one 13-run benchmark", () => {
  const reconstructedRuns = Array.from({ length: 11 }, (_, index) => ({
    strategy: "MLG",
    run_id: "legacy-" + index,
    report_date: "2026-07-" + String(index + 1).padStart(2, "0"),
    horizon: "20d",
    strategy_return: 0.01,
    qqq_return: 0.005,
    excess_return: 0.005,
    signal_count: 10,
    status: "RECONSTRUCTED",
  }));
  const verifiedRuns = Array.from({ length: 2 }, (_, index) => ({
    strategy: "MLG",
    run_id: "verified-" + index,
    report_date: "2026-08-0" + (index + 1),
    horizon: "20d",
    strategy_return: 0.10,
    qqq_return: 0.02,
    excess_return: 0.08,
    signal_count: 10,
    status: "VERIFIED",
  }));
  const performance = {
    status: "PARTIAL",
    horizon_statuses: [{ strategy: "MLG", horizon: "20d", status: "VERIFIED" }],
    aggregates: [{
      strategy: "MLG",
      horizon: "20d",
      status: "VERIFIED",
      portfolio_view: "run_equal_weight",
    }],
    run_series: verifiedRuns,
    signals: [],
  };
  const backcast = {
    horizon_statuses: [{ strategy: "MLG", horizon: "20d", status: "RECONSTRUCTED" }],
    aggregates: [{
      strategy: "MLG",
      horizon: "20d",
      status: "RECONSTRUCTED",
      portfolio_view: "run_equal_weight",
    }],
    run_series: reconstructedRuns,
    signals: [],
  };

  const cell = getUnifiedPerformanceCell(performance, backcast, "MLG", "20D");
  assert.equal(cell.source, "MIXED");
  assert.equal(cell.runSeries.length, 13);
  assert.equal(cell.aggregate.run_count, 13);
  assert.equal(cell.aggregate.underlying_signal_count, 130);
  assert.equal(cell.horizonStatus.complete_run_count, 13);
  assert.ok(Math.abs(cell.aggregate.equal_weight_return - (0.31 / 13)) < 1e-12);
});

test("TENX benchmark ignores reconstructed pre-TENX2 history and starts empty", () => {
  const oldBackcast = {
    horizon_statuses: [{ strategy: "TENX", horizon: "20d", status: "RECONSTRUCTED" }],
    aggregates: [{ strategy: "TENX", horizon: "20d", status: "RECONSTRUCTED" }],
    run_series: [{
      strategy: "TENX",
      run_id: "old-engine",
      report_date: "2026-07-01",
      horizon: "20d",
      strategy_return: 0.30,
      qqq_return: 0.01,
      excess_return: 0.29,
      signal_count: 5,
      status: "RECONSTRUCTED",
    }],
    signals: [],
  };
  const pending = {
    status: "PENDING",
    horizon_statuses: [{ strategy: "TENX", horizon: "20d", status: "PENDING" }],
    aggregates: [],
    run_series: [],
    signals: [],
  };
  assert.equal(
    getUnifiedPerformanceCell(pending, oldBackcast, "TENX", "20D").aggregate,
    null,
  );

  const tenx2Run = {
    strategy: "TENX",
    run_id: "tenx2",
    report_date: "2026-09-08",
    horizon: "20d",
    strategy_return: 0.08,
    qqq_return: 0.02,
    excess_return: 0.06,
    signal_count: 5,
    status: "VERIFIED",
  };
  const measured = {
    status: "PARTIAL",
    horizon_statuses: [{ strategy: "TENX", horizon: "20d", status: "VERIFIED" }],
    aggregates: [{
      strategy: "TENX",
      horizon: "20d",
      status: "VERIFIED",
      portfolio_view: "run_equal_weight",
    }],
    run_series: [tenx2Run],
    signals: [],
  };
  const cell = getUnifiedPerformanceCell(measured, oldBackcast, "TENX", "20D");
  assert.equal(cell.source, "VERIFIED");
  assert.deepEqual(cell.runSeries.map((row) => row.run_id), ["tenx2"]);
  assert.equal(cell.aggregate.run_count, 1);
});


test("summarizes additions, exits, and retained symbols against the prior run", () => {
  const runs = [
    { strategy: "MLG", run_id: "new", report_created_at: "2026-08-06T00:00:00Z" },
    { strategy: "MLG", run_id: "old", report_created_at: "2026-08-05T00:00:00Z" },
  ];
  const recommendations = [
    { strategy: "MLG", run_id: "new", symbol: "AAA", recommendation_rank: 1 },
    { strategy: "MLG", run_id: "new", symbol: "BBB", recommendation_rank: 2 },
    { strategy: "MLG", run_id: "old", symbol: "BBB", recommendation_rank: 1 },
    { strategy: "MLG", run_id: "old", symbol: "CCC", recommendation_rank: 2 },
  ];

  assert.deepEqual(summarizeRunChanges(runs, recommendations, runs[0]), {
    previousRunId: "old",
    added: ["AAA"],
    removed: ["CCC"],
    retained: ["BBB"],
    isBaseline: false,
  });
});

test("does not silently replace a stale historical run route with the latest run", () => {
  const runs = [
    { strategy: "MLG", run_id: "latest", report_created_at: "2026-08-06T00:00:00Z" },
    { strategy: "MLG", run_id: "older", report_created_at: "2026-08-05T00:00:00Z" },
  ];
  assert.deepEqual(resolveSelectedRun(runs, "MLG", "removed-run"), {
    latestRun: runs[0],
    currentRun: null,
    requestedRunMissing: true,
  });
  assert.deepEqual(resolveSelectedRun(runs, "MLG", null), {
    latestRun: runs[0],
    currentRun: runs[0],
    requestedRunMissing: false,
  });
});

test("uses rich optional detail and falls back to every legacy risk flag", () => {
  const rich = getRecommendationDetail({
    detail: {
      contract_version: "recommendation_detail_v1",
      status: "complete",
      thesis: { summary: "공식 상세 설명", catalyst: "실적 개선" },
      drivers: [
        { code: "growth", label: "성장성", value: "91점", format: "text", basis: "deterministic_public_formatter" },
        { code: "margin", label: "마진", value: "N/A | YoY N/A", format: "text", basis: "deterministic_public_formatter" },
        { code: "visibility", label: "가시성", value: "높음 (증거 신호 0개)", format: "text", basis: "deterministic_public_formatter" },
        { code: "funding", label: "재무", value: "자금자립 | D/E N/A", format: "text", basis: "deterministic_public_formatter" },
      ],
      risks: [{ code: "primary_risk", label: "이벤트", category: "fundamental", basis: "deterministic_public_formatter" }],
      timing: { rsi14: 55, heat: "medium", warning: null, price_as_of: "2026-08-06" },
      score_breakdown: {
        score_name: "production_score",
        total: 91,
        aggregation: "strategy_native_non_additive",
        dimensions: [{ code: "growth", label: "성장", value: 0.91, scale_min: 0, scale_max: 1 }],
      },
    },
    detail_provenance: {
      method: "deterministic_structured_reconstruction",
      source_kind: "compact_audit_snapshot",
      original_telegram_text_used: false,
    },
  });
  assert.equal(rich.hasRichDetail, true);
  assert.equal(rich.drivers.length, 2);
  assert.equal(rich.drivers[1].value, "자금자립");
  assert.equal(rich.drivers[0].label, "성장성");
  assert.equal(rich.catalyst, "실적 개선");
  assert.equal(rich.detailProvenance.source_kind, "compact_audit_snapshot");

  const legacy = getRecommendationDetail({
    risk_flags: "first=one|second=two|third=three|fourth=four|fifth=five",
  });
  assert.equal(legacy.hasRichDetail, false);
  assert.equal(legacy.detailProvenance, null);
  assert.equal(legacy.risks.length, 5);
  assert.equal(legacy.risks[4].value, "five");
});

test("finds the prior same-symbol recommendation without crossing strategies", () => {
  const runs = [
    { strategy: "MLG", run_id: "new", report_created_at: "2026-08-06T00:00:00Z" },
    { strategy: "MLG", run_id: "old", report_created_at: "2026-08-05T00:00:00Z" },
    { strategy: "TENX", run_id: "other", report_created_at: "2026-08-04T00:00:00Z" },
  ];
  const recommendations = [
    { strategy: "MLG", run_id: "old", symbol: "AAA", recommendation_rank: 3 },
    { strategy: "TENX", run_id: "other", symbol: "AAA", recommendation_rank: 1 },
  ];
  assert.equal(getPreviousRecommendation(runs, recommendations, runs[0], "AAA")?.recommendation.recommendation_rank, 3);
});

function indexedHistoryFixture() {
  const runs = [
    { strategy: "MLG", run_id: "run-5", report_created_at: "2026-08-05T00:00:00Z", report_date: "2026-08-05" },
    { strategy: "MLG", run_id: "run-3", report_created_at: "2026-08-03T00:00:00Z", report_date: "2026-08-03" },
    { strategy: "TENX", run_id: "tenx-1", report_created_at: "2026-08-02T12:00:00Z", report_date: "2026-08-02" },
    { strategy: "MLG", run_id: "run-1", report_created_at: "2026-08-01T00:00:00Z", report_date: "2026-08-01" },
    { strategy: "MLG", run_id: "run-4", report_created_at: "2026-08-04T00:00:00Z", report_date: "2026-08-04" },
    { strategy: "MLG", run_id: "run-2", report_created_at: "2026-08-02T00:00:00Z", report_date: "2026-08-02" },
  ];
  const recommendations = [
    { strategy: "MLG", run_id: "run-1", symbol: "AAA", company_name: "Alpha Analytics", recommendation_rank: 4, score: 50 },
    { strategy: "MLG", run_id: "run-2", symbol: "AAA", company_name: "Alpha Analytics", recommendation_rank: 3, score: 55 },
    { strategy: "MLG", run_id: "run-3", symbol: "BBB", company_name: "Beta Systems", recommendation_rank: 1, score: 70 },
    { strategy: "MLG", run_id: "run-4", symbol: "BBB", company_name: "Beta Systems", recommendation_rank: 2, score: 72 },
    { strategy: "MLG", run_id: "run-5", symbol: "AAA", company_name: "Alpha Analytics", recommendation_rank: 1, score: 80 },
    { strategy: "TENX", run_id: "tenx-1", symbol: "AAA", company_name: "Alpha Analytics", recommendation_rank: 1, score: 90 },
  ];
  return { runs, recommendations };
}

test("builds stable dashboard lookup tables once without mutating payload order", () => {
  const payload = indexedHistoryFixture();
  const originalRunOrder = payload.runs.map((run) => run.run_id);
  const index = createDashboardIndex(payload);

  assert.deepEqual(payload.runs.map((run) => run.run_id), originalRunOrder);
  assert.deepEqual(index.runsByStrategy.get("MLG").map((run) => run.run_id), [
    "run-5", "run-4", "run-3", "run-2", "run-1",
  ]);
  assert.equal(index.runByKey.get("MLG:run-3")?.report_date, "2026-08-03");
  assert.deepEqual(getIndexedRunRecommendations(index, "MLG", "run-2").map((item) => item.symbol), ["AAA"]);
  assert.equal(getIndexedRecommendation(index, "mlg", "run-5", "aaa")?.score, 80);
  assert.equal(getIndexedRecommendation(index, "MLG", "missing", "AAA"), null);
});

test("classifies actual run changes as NEW, RETAINED, EXIT, and RE-ENTRY", () => {
  const index = createDashboardIndex(indexedHistoryFixture());
  const baseline = getIndexedRunChanges(index, "MLG", "run-1");
  assert.deepEqual(baseline.added, ["AAA"]);
  assert.deepEqual(baseline.newSymbols, ["AAA"]);
  assert.equal(baseline.transitions[0].status, "NEW");

  const retained = getIndexedRunChanges(index, "MLG", "run-2");
  assert.deepEqual(retained.retained, ["AAA"]);
  assert.equal(retained.transitions[0].status, "RETAINED");
  assert.equal(retained.transitions[0].rankDelta, 1);
  assert.equal(retained.transitions[0].scoreDelta, 5);

  const exit = getIndexedRunChanges(index, "MLG", "run-3");
  assert.deepEqual(exit.added, ["BBB"]);
  assert.deepEqual(exit.removed, ["AAA"]);
  assert.deepEqual(exit.transitions.map((item) => item.status), ["NEW", "EXIT"]);

  const reentry = getIndexedRunChanges(index, "MLG", "run-5");
  assert.deepEqual(reentry.added, ["AAA"]);
  assert.deepEqual(reentry.removed, ["BBB"]);
  assert.deepEqual(reentry.reenteredSymbols, ["AAA"]);
  assert.deepEqual(reentry.newSymbols, []);
  assert.deepEqual(reentry.transitions.map((item) => item.status), ["RE-ENTRY", "EXIT"]);
  assert.equal(reentry.transitions[0].missingRunCount, 2);
});

test("builds a strategy-scoped symbol event timeline with gaps, streaks, and prior values", () => {
  const index = createDashboardIndex(indexedHistoryFixture());
  const timeline = getSymbolTimeline(index, "mlg", "aaa");

  assert.equal(timeline.totalRunCount, 5);
  assert.equal(timeline.selectedRunCount, 3);
  assert.equal(timeline.currentStreak, 1);
  assert.equal(timeline.maxStreak, 2);
  assert.equal(timeline.firstSeenRunId, "run-1");
  assert.equal(timeline.latestSeenRunId, "run-5");
  assert.deepEqual(timeline.entries.map((item) => [item.runId, item.status]), [
    ["run-5", "RE-ENTRY"],
    ["run-3", "EXIT"],
    ["run-2", "RETAINED"],
    ["run-1", "NEW"],
  ]);
  assert.deepEqual(
    {
      missingRunCount: timeline.entries[0].missingRunCount,
      streak: timeline.entries[0].streak,
      previousRank: timeline.entries[0].previousRank,
      previousScore: timeline.entries[0].previousScore,
      rankDelta: timeline.entries[0].rankDelta,
      scoreDelta: timeline.entries[0].scoreDelta,
    },
    { missingRunCount: 2, streak: 1, previousRank: 3, previousScore: 55, rankDelta: 2, scoreDelta: 25 },
  );
  assert.equal(getSymbolTimeline(index, "TENX", "AAA").selectedRunCount, 1);
  assert.deepEqual(getSymbolTimeline(index, "MLG", "UNKNOWN").entries, []);
});

test("searches history by ticker and company, including the run where a symbol exited", () => {
  const index = createDashboardIndex(indexedHistoryFixture());

  assert.deepEqual(searchHistoryRuns(index, { query: "alpha analytics" }).map((run) => (
    `${run.strategy}:${run.run_id}`
  )), ["MLG:run-5", "MLG:run-3", "TENX:tenx-1", "MLG:run-2", "MLG:run-1"]);
  assert.deepEqual(searchHistoryRuns(index, { strategy: "MLG", query: "BBB EXIT" }).map((run) => run.run_id), [
    "run-5", "run-3",
  ]);
  assert.deepEqual(searchHistoryRuns(index, { strategy: "TENX", query: "AAA" }).map((run) => run.run_id), ["tenx-1"]);
  assert.deepEqual(searchHistoryRuns(index, { query: "does-not-exist" }), []);
});

test("searches securities globally and returns only the newest strategy appearance", () => {
  const index = createDashboardIndex(indexedHistoryFixture());

  assert.deepEqual(searchSecurities(index, "alpha").map((item) => (
    `${item.strategy}:${item.runId}:${item.symbol}`
  )), ["MLG:run-5:AAA", "TENX:tenx-1:AAA"]);
  assert.deepEqual(searchSecurities(index, "MLG AAA").map((item) => item.runId), ["run-5"]);
  assert.deepEqual(searchSecurities(index, "beta systems").map((item) => item.runId), ["run-4"]);
  assert.deepEqual(searchSecurities(index, ""), []);
  assert.deepEqual(searchSecurities(index, "AAA", 1).map((item) => item.strategy), ["MLG"]);
});

test("searches the newest matching historical company name when the latest name is missing", () => {
  const payload = indexedHistoryFixture();
  payload.recommendations.find((item) => item.strategy === "MLG" && item.run_id === "run-5").company_name = "";
  const index = createDashboardIndex(payload);

  assert.deepEqual(searchSecurities(index, "alpha analytics").map((item) => (
    `${item.strategy}:${item.runId}:${item.symbol}`
  )), ["TENX:tenx-1:AAA", "MLG:run-2:AAA"]);
});



test("historical selection distinguishes same-day runs and current exclusion without mutating scores", () => {
  const payload = { runs: [
    { strategy: "TENX", run_id: "morning", report_created_at: "2026-09-08T01:00:00Z" },
    { strategy: "TENX", run_id: "evening", report_created_at: "2026-09-08T12:00:00Z" },
  ], recommendations: [
    { strategy: "TENX", run_id: "morning", symbol: "OLD", recommendation_rank: 1, score: 55.54 },
    { strategy: "TENX", run_id: "morning", symbol: "KEEP", recommendation_rank: 2, score: 50 },
    { strategy: "TENX", run_id: "evening", symbol: "KEEP", recommendation_rank: 1, score: 44 },
  ] };
  const before = JSON.stringify(payload);
  const index = createDashboardIndex(payload);
  assert.equal(getSelectionContext(index, "TENX", "morning", "OLD").isHistorical, true);
  assert.equal(getSelectionContext(index, "TENX", "morning", "OLD").isCurrentlySelected, false);
  assert.equal(getSelectionContext(index, "TENX", "morning", "KEEP").isCurrentlySelected, true);
  assert.equal(getSelectionContext(index, "TENX", "evening", "KEEP").isHistorical, false);
  const old = searchSecurities(index, "OLD")[0];
  assert.equal(old.isCurrentlySelected, false);
  assert.equal(old.score, 55.54);
  assert.equal(old.reportCreatedAt, "2026-09-08T01:00:00Z");
  assert.equal(JSON.stringify(payload), before);
});
