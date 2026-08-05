import assert from "node:assert/strict";
import test from "node:test";

import {
  getEvidenceState,
  getPerformanceState,
  getPreviousRecommendation,
  getRecommendationDetail,
  getVerifiedAggregate,
  parseHashRoute,
  resolveSelectedRun,
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
      drivers: [{ code: "growth", label: "성장성", value: "91점", format: "text", basis: "deterministic_public_formatter" }],
      risks: [{ code: "primary_risk", label: "이벤트", category: "fundamental", basis: "deterministic_public_formatter" }],
      timing: { rsi14: 55, heat: "medium", warning: null, price_as_of: "2026-08-06" },
      score_breakdown: {
        score_name: "production_score",
        total: 91,
        aggregation: "strategy_native_non_additive",
        dimensions: [{ code: "growth", label: "성장", value: 0.91, scale_min: 0, scale_max: 1 }],
      },
    },
  });
  assert.equal(rich.hasRichDetail, true);
  assert.equal(rich.drivers[0].label, "성장성");
  assert.equal(rich.catalyst, "실적 개선");

  const legacy = getRecommendationDetail({
    risk_flags: "first=one|second=two|third=three|fourth=four|fifth=five",
  });
  assert.equal(legacy.hasRichDetail, false);
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
