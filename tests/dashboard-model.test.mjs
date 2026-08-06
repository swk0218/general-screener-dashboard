import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardIndex,
  getEvidenceState,
  getIndexedRecommendation,
  getIndexedRunChanges,
  getIndexedRunRecommendations,
  getPerformanceState,
  getPreviousRecommendation,
  getRecommendationDetail,
  getSymbolTimeline,
  getVerifiedAggregate,
  parseHashRoute,
  resolveSelectedRun,
  searchHistoryRuns,
  serializeHashRoute,
  summarizeRunChanges,
} from "../src/data/dashboard-model.js";

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
