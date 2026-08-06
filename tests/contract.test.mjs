import assert from "node:assert/strict";
import test from "node:test";
import { assertDashboardPayload } from "../src/data/contract.js";

function validPayload() {
  return {
    contract_version: "general_screener_v1",
    generated_at: "2026-08-05T02:45:36Z",
    benchmark: "QQQ",
    evidence_status: "HOLD: PRICE_OBSERVATION_ARCHIVE_PENDING",
    runs: [{ strategy: "MLG", run_id: "run-1", report_created_at: "2026-08-05T02:45:36Z" }],
    recommendations: [{
      strategy: "MLG",
      run_id: "run-1",
      symbol: "TEST",
      recommendation_rank: 1,
      score: 88.79,
      screening_price: 211.94,
      risk_flags: "event_risk_status=available",
    }],
    performance: { aggregates: [], signals: [] },
  };
}

function validDetail() {
  return {
    contract_version: "recommendation_detail_v1",
    status: "complete",
    thesis: { summary: "검증된 선택 근거", catalyst: "성장률 확인" },
    drivers: [{ code: "quality", label: "QUALITY", value: "84점", format: "text", basis: "deterministic_public_formatter" }],
    risks: [{ code: "primary_risk", label: "EVENT", category: "fundamental", basis: "deterministic_public_formatter" }],
    timing: { rsi14: 55.2, heat: "medium", warning: null, price_as_of: "2026-08-06" },
    score_breakdown: {
      score_name: "production_score",
      total: 88.79,
      aggregation: "strategy_native_non_additive",
      dimensions: [{ code: "quality", label: "QUALITY", value: 0.84, scale_min: 0, scale_max: 1 }],
    },
  };
}

test("accepts the dashboard v1 contract", () => {
  const payload = validPayload();
  assert.equal(assertDashboardPayload(payload), payload);
});

test("rejects recommendations that do not reference a run", () => {
  const payload = validPayload();
  payload.recommendations[0].run_id = "missing";
  assert.throws(() => assertDashboardPayload(payload), /existing run/);
});

test("rejects malformed performance aggregates", () => {
  const payload = validPayload();
  payload.performance.aggregates = {};
  assert.throws(() => assertDashboardPayload(payload), /must be an array/);
});

test("rejects object risk flags before encryption", () => {
  const payload = validPayload();
  payload.recommendations[0].risk_flags = { status: "available" };
  assert.throws(() => assertDashboardPayload(payload), /must be a string or null/);
});

test("accepts optional rich recommendation detail", () => {
  const payload = validPayload();
  payload.recommendations[0].detail = validDetail();
  assert.equal(assertDashboardPayload(payload), payload);
});

test("accepts an explicit structured-reconstruction provenance", () => {
  const payload = validPayload();
  payload.recommendations[0].detail = validDetail();
  payload.recommendations[0].detail_provenance = {
    method: "deterministic_structured_reconstruction",
    source_kind: "compact_audit_snapshot",
    original_telegram_text_used: false,
  };
  assert.equal(assertDashboardPayload(payload), payload);
});

test("rejects reconstruction provenance that claims original Telegram text", () => {
  const payload = validPayload();
  payload.recommendations[0].detail = validDetail();
  payload.recommendations[0].detail_provenance = {
    method: "deterministic_structured_reconstruction",
    source_kind: "compact_audit_snapshot",
    original_telegram_text_used: true,
  };
  assert.throws(() => assertDashboardPayload(payload), /must be false/);
});

test("rejects malformed rich recommendation detail", () => {
  const payload = validPayload();
  payload.recommendations[0].detail = {
    contract_version: "recommendation_detail_v1",
    status: "partial",
  };
  assert.throws(() => assertDashboardPayload(payload), /complete or legacy_unavailable/);
});

function exactPerformanceFixture() {
  const signals = ["TEST", "TESTB"].map((symbol, index) => ({
    strategy: "MLG",
    run_id: "run-1",
    signal_id: index + 101,
    symbol,
    horizon: "5d",
    signal_return: index ? 0.06 : 0.08,
    qqq_return: 0.03,
    excess_return: index ? 0.03 : 0.05,
    entry_session: "2026-07-29",
    measurement_session: "2026-08-05",
    status: "VERIFIED",
  }));
  return {
    status: "PARTIAL",
    reason_code: "TEN_DAY_PENDING",
    evaluated_at: "2026-08-06T00:00:00Z",
    evidence_status: "HOLD: PARTIAL_HORIZON_MATRIX",
    portfolio_view: "run_equal_weight",
    horizon_statuses: ["MLG", "TENX"].flatMap((strategy) => ["5d", "10d", "20d"].map((horizon) => ({
      strategy,
      horizon,
      status: strategy === "MLG" && horizon === "5d" ? "VERIFIED" : "PENDING",
      complete_run_count: strategy === "MLG" && horizon === "5d" ? 1 : null,
      underlying_signal_count: strategy === "MLG" && horizon === "5d" ? signals.length : null,
      measurement_session_max: strategy === "MLG" && horizon === "5d" ? "2026-08-05" : null,
      reason_code: strategy === "MLG" && horizon === "5d" ? "COMPLETE_RUNS_AVAILABLE" : "COMPLETE_RUN_PENDING",
    }))),
    aggregates: [{
      strategy: "MLG",
      horizon: "5d",
      equal_weight_return: 0.07,
      qqq_equal_weight_return: 0.03,
      equal_weight_excess_return: 0.04,
      count: 1,
      run_count: 1,
      underlying_signal_count: signals.length,
      portfolio_view: "run_equal_weight",
      qqq_win_rate: 1,
      positive_rate: 1,
      measurement_session_max: "2026-08-05",
      status: "VERIFIED",
    }],
    run_series: [{
      strategy: "MLG",
      run_id: "run-1",
      report_date: "2026-07-29",
      horizon: "5d",
      strategy_return: 0.07,
      qqq_return: 0.03,
      excess_return: 0.04,
      signal_count: signals.length,
      status: "VERIFIED",
    }],
    signals,
  };
}

function backcastFixture() {
  const signals = Array.from({ length: 10 }, (_, index) => ({
    strategy: "MLG",
    run_id: "run-1",
    signal_id: `signal-${index + 1}`,
    symbol: `T${index + 1}`,
    horizon: "5d",
    signal_return: 0.01 + index / 1000,
    qqq_return: 0.008,
    excess_return: 0.002 + index / 1000,
    entry_session: "2026-07-29",
    measurement_session: "2026-08-05",
    status: "RECONSTRUCTED",
  }));
  return {
    status: "PARTIAL",
    reason_code: "RECONSTRUCTED_HORIZON_MATRIX_PARTIAL",
    evaluated_at: "2026-08-06T00:00:00Z",
    evidence_status: "RECONSTRUCTED_REPOSITORY_BOUND",
    evidence_tier: "RECONSTRUCTED_REPOSITORY_BOUND",
    benchmark: "QQQ",
    portfolio_view: "run_equal_weight",
    horizon_statuses: ["MLG", "TENX"].flatMap((strategy) => ["5d", "10d", "20d"].map((horizon) => ({
      strategy,
      horizon,
      status: strategy === "MLG" && horizon === "5d" ? "RECONSTRUCTED" : "PENDING",
      complete_run_count: strategy === "MLG" && horizon === "5d" ? 1 : null,
      underlying_signal_count: strategy === "MLG" && horizon === "5d" ? 10 : null,
      measurement_session_max: strategy === "MLG" && horizon === "5d" ? "2026-08-05" : null,
      reason_code: strategy === "MLG" && horizon === "5d" ? "COMPLETE_RECONSTRUCTED_RUNS" : "COMPLETE_RUN_PENDING",
    }))),
    aggregates: [{
      strategy: "MLG",
      horizon: "5d",
      status: "RECONSTRUCTED",
      equal_weight_return: 0.0145,
      qqq_equal_weight_return: 0.008,
      equal_weight_excess_return: 0.0065,
      count: 1,
      run_count: 1,
      underlying_signal_count: 10,
      portfolio_view: "run_equal_weight",
      qqq_win_rate: 1,
      positive_rate: 1,
      measurement_session_max: "2026-08-05",
    }],
    run_series: [{
      strategy: "MLG",
      run_id: "run-1",
      report_date: "2026-07-28",
      horizon: "5d",
      strategy_return: 0.0145,
      qqq_return: 0.008,
      excess_return: 0.0065,
      signal_count: 10,
      entry_session: "2026-07-29",
      measurement_session: "2026-08-05",
      status: "RECONSTRUCTED",
      provenance: {
        evidence_tier: "RECONSTRUCTED_REPOSITORY_BOUND",
        availability_source: "trusted_repository_archive_commit",
        archive_commit_sha: "a".repeat(40),
        archive_committed_at: "2026-07-28T22:00:00Z",
        source_head_sha: "b".repeat(40),
        source_workflow_path: ".github/workflows/run_mlg_weekly.yml",
        source_workflow_sha256: "c".repeat(64),
        entry_policy_version: "first_regular_open_after_trusted_archive_commit_v1",
        proof_policy_version: "repository_bound_backcast_v1",
        strategy: "MLG",
        run_id: "run-1",
      },
    }],
    signals,
    methodology: {},
  };
}

test("accepts the full exact publisher performance contract", () => {
  const payload = validPayload();
  payload.performance = exactPerformanceFixture();
  payload.evidence_status = payload.performance.evidence_status;
  assert.equal(assertDashboardPayload(payload), payload);
});

test("accepts reconstructed performance only in the separate repository-bound tier", () => {
  const payload = validPayload();
  payload.performance_backcast = backcastFixture();
  assert.equal(assertDashboardPayload(payload), payload);
});

test("rejects reconstructed rows mislabeled as verified or built from partial runs", () => {
  const mislabeled = validPayload();
  mislabeled.performance_backcast = backcastFixture();
  mislabeled.performance_backcast.run_series[0].status = "VERIFIED";
  assert.throws(() => assertDashboardPayload(mislabeled), /must be RECONSTRUCTED/);

  const partial = validPayload();
  partial.performance_backcast = backcastFixture();
  partial.performance_backcast.run_series[0].signal_count = 9;
  assert.throws(() => assertDashboardPayload(partial), /complete MLG run size/);
});

test("rejects reconstructed performance that does not reconcile from signals through aggregates", () => {
  const tamperedAggregate = validPayload();
  tamperedAggregate.performance_backcast = backcastFixture();
  tamperedAggregate.performance_backcast.aggregates[0].equal_weight_return += 0.5;
  assert.throws(() => assertDashboardPayload(tamperedAggregate), /mean reconstructed run return/);

  const missingSeries = validPayload();
  missingSeries.performance_backcast = backcastFixture();
  missingSeries.performance_backcast.aggregates = [];
  missingSeries.performance_backcast.run_series = [];
  missingSeries.performance_backcast.signals = [];
  missingSeries.performance_backcast.horizon_statuses[0].complete_run_count = 0;
  missingSeries.performance_backcast.horizon_statuses[0].underlying_signal_count = 0;
  assert.throws(() => assertDashboardPayload(missingSeries), /at least one complete run and signal/);

  const tamperedSignal = validPayload();
  tamperedSignal.performance_backcast = backcastFixture();
  tamperedSignal.performance_backcast.signals[0].excess_return += 0.01;
  assert.throws(() => assertDashboardPayload(tamperedSignal), /signal_return minus qqq_return/);
});

test("rejects exact performance fields that do not match the publisher contract", () => {
  const missingView = validPayload();
  missingView.performance = exactPerformanceFixture();
  missingView.evidence_status = missingView.performance.evidence_status;
  delete missingView.performance.portfolio_view;
  assert.throws(() => assertDashboardPayload(missingView), /unsupported field|portfolio_view/);

  const missingAggregateView = validPayload();
  missingAggregateView.performance = exactPerformanceFixture();
  missingAggregateView.evidence_status = missingAggregateView.performance.evidence_status;
  delete missingAggregateView.performance.aggregates[0].portfolio_view;
  assert.throws(() => assertDashboardPayload(missingAggregateView), /portfolio_view/);

  const badAggregateCoverage = validPayload();
  badAggregateCoverage.performance = exactPerformanceFixture();
  badAggregateCoverage.evidence_status = badAggregateCoverage.performance.evidence_status;
  badAggregateCoverage.performance.aggregates[0].underlying_signal_count = 3;
  assert.throws(() => assertDashboardPayload(badAggregateCoverage), /must match the VERIFIED horizon coverage/);

  const badEvidence = validPayload();
  badEvidence.performance = exactPerformanceFixture();
  badEvidence.evidence_status = "PASS";
  assert.throws(() => assertDashboardPayload(badEvidence), /must match performance.evidence_status/);
});

test("accepts the exact legacy-unavailable detail shape", () => {
  const payload = validPayload();
  payload.recommendations[0].detail = {
    contract_version: "recommendation_detail_v1",
    status: "legacy_unavailable",
    thesis: { summary: null, catalyst: null },
    drivers: [],
    risks: [],
    timing: { rsi14: null, heat: "unknown", warning: null, price_as_of: null },
    score_breakdown: {
      score_name: "production_score",
      total: null,
      aggregation: "strategy_native_non_additive",
      dimensions: [],
    },
  };
  assert.equal(assertDashboardPayload(payload), payload);
});

test("rejects incomplete exact performance horizon coverage", () => {
  const payload = validPayload();
  payload.performance = {
    status: "HOLD",
    reason_code: "PENDING",
    evaluated_at: null,
    evidence_status: "HOLD: PENDING",
    portfolio_view: "run_equal_weight",
    horizon_statuses: [],
    aggregates: [],
    run_series: [],
    signals: [],
  };
  payload.evidence_status = payload.performance.evidence_status;
  assert.throws(() => assertDashboardPayload(payload), /all 6 strategy and horizon pairs/);
});

test("accepts fail-closed HOLD coverage with nullable observation fields", () => {
  const payload = validPayload();
  payload.performance = {
    status: "HOLD",
    reason_code: "INTEGRITY_GATE_FAILED",
    evaluated_at: null,
    evidence_status: "HOLD: INTEGRITY_GATE_FAILED",
    portfolio_view: "run_equal_weight",
    horizon_statuses: ["MLG", "TENX"].flatMap((strategy) => (
      ["5d", "10d", "20d"].map((horizon) => ({
        strategy,
        horizon,
        status: "HOLD",
        complete_run_count: null,
        underlying_signal_count: null,
        measurement_session_max: null,
        reason_code: "INTEGRITY_GATE_FAILED",
      }))
    )),
    aggregates: [],
    run_series: [],
    signals: [],
  };
  payload.evidence_status = payload.performance.evidence_status;
  assert.equal(assertDashboardPayload(payload), payload);
});
