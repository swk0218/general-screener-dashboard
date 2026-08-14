import assert from "node:assert/strict";
import test from "node:test";

import { assertDashboardPayload } from "../src/data/contract.js";
import {
  createDashboardIndex,
  getIndexedRecommendation,
  getIndexedRunChanges,
  resolveSelectedRun,
  searchHistoryRuns,
  searchSecurities,
} from "../src/data/dashboard-model.js";
import {
  isQuarantinedDashboardRun,
  quarantineDashboardPayload,
} from "../src/data/payload-quarantine.js";

const DEFECTIVE_RUN_ID = "31390549097";

function legacyDetail(strategy) {
  return {
    contract_version: "recommendation_detail_v1",
    status: "legacy_unavailable",
    thesis: { summary: null, catalyst: null },
    drivers: [],
    risks: [],
    timing: { rsi14: null, heat: "unknown", warning: null, price_as_of: null },
    score_breakdown: {
      score_name: strategy === "MLG" ? "production_score" : "tenx_final_score",
      total: null,
      aggregation: "strategy_native_non_additive",
      dimensions: [],
    },
  };
}

function run(runId, reportCreatedAt, reportDate, strategy = "TENX") {
  return {
    strategy,
    run_id: runId,
    report_created_at: reportCreatedAt,
    report_date: reportDate,
    detail_coverage: {
      status: "UNAVAILABLE",
      recommendation_count: 1,
      complete_count: 0,
      legacy_unavailable_count: 1,
    },
  };
}

function recommendation(runId, symbol, strategy = "TENX") {
  return {
    strategy,
    run_id: runId,
    symbol,
    company_name: `${symbol} Corporation`,
    recommendation_rank: 1,
    score: 50,
    detail: legacyDetail(strategy),
  };
}

function horizonStatuses(completeStatus) {
  return ["MLG", "TENX"].flatMap((strategy) => (
    ["20d", "60d", "120d"].map((horizon) => {
      const isDefectiveCell = strategy === "TENX" && horizon === "20d";
      return {
        strategy,
        horizon,
        status: isDefectiveCell ? completeStatus : "PENDING",
        complete_run_count: isDefectiveCell ? 1 : null,
        underlying_signal_count: isDefectiveCell ? 5 : null,
        measurement_session_max: isDefectiveCell ? "2026-08-14" : null,
        reason_code: isDefectiveCell ? "COMPLETE_RUNS_AVAILABLE" : "COMPLETE_RUN_PENDING",
      };
    })
  ));
}

function evidenceSignals(status) {
  return Array.from({ length: 5 }, (_, index) => ({
    strategy: "TENX",
    run_id: DEFECTIVE_RUN_ID,
    signal_id: `defective-${index + 1}`,
    symbol: `BAD${index + 1}`,
    horizon: "20d",
    signal_return: 0.1,
    qqq_return: 0.04,
    excess_return: 0.06,
    entry_session: "2026-08-11",
    measurement_session: "2026-08-14",
    status,
  }));
}

function exactPerformance() {
  return {
    status: "PARTIAL",
    reason_code: "LONG_HORIZON_PENDING",
    evaluated_at: "2026-08-14T10:00:00Z",
    evidence_status: "HOLD: PARTIAL_HORIZON_MATRIX",
    portfolio_view: "run_equal_weight",
    horizon_statuses: horizonStatuses("VERIFIED"),
    aggregates: [{
      strategy: "TENX",
      horizon: "20d",
      equal_weight_return: 0.1,
      qqq_equal_weight_return: 0.04,
      equal_weight_excess_return: 0.06,
      count: 1,
      run_count: 1,
      underlying_signal_count: 5,
      portfolio_view: "run_equal_weight",
      qqq_win_rate: 1,
      positive_rate: 1,
      measurement_session_max: "2026-08-14",
      status: "VERIFIED",
    }],
    run_series: [{
      strategy: "TENX",
      run_id: DEFECTIVE_RUN_ID,
      report_date: "2026-08-10",
      horizon: "20d",
      strategy_return: 0.1,
      qqq_return: 0.04,
      excess_return: 0.06,
      signal_count: 5,
      status: "VERIFIED",
    }],
    signals: evidenceSignals("VERIFIED"),
  };
}

function backcastPerformance() {
  return {
    status: "PARTIAL",
    reason_code: "RECONSTRUCTED_HORIZON_MATRIX_PARTIAL",
    evaluated_at: "2026-08-14T10:00:00Z",
    evidence_status: "RECONSTRUCTED_REPOSITORY_BOUND",
    evidence_tier: "RECONSTRUCTED_REPOSITORY_BOUND",
    benchmark: "QQQ",
    portfolio_view: "run_equal_weight",
    horizon_statuses: horizonStatuses("RECONSTRUCTED"),
    aggregates: [{
      strategy: "TENX",
      horizon: "20d",
      status: "RECONSTRUCTED",
      equal_weight_return: 0.1,
      qqq_equal_weight_return: 0.04,
      equal_weight_excess_return: 0.06,
      count: 1,
      run_count: 1,
      underlying_signal_count: 5,
      portfolio_view: "run_equal_weight",
      qqq_win_rate: 1,
      positive_rate: 1,
      measurement_session_max: "2026-08-14",
    }],
    run_series: [{
      strategy: "TENX",
      run_id: DEFECTIVE_RUN_ID,
      report_date: "2026-08-10",
      horizon: "20d",
      strategy_return: 0.1,
      qqq_return: 0.04,
      excess_return: 0.06,
      signal_count: 5,
      entry_session: "2026-08-11",
      measurement_session: "2026-08-14",
      status: "RECONSTRUCTED",
      provenance: {
        evidence_tier: "RECONSTRUCTED_REPOSITORY_BOUND",
        availability_source: "trusted_repository_archive_commit",
        archive_commit_sha: "a".repeat(40),
        archive_committed_at: "2026-08-10T22:00:00Z",
        source_head_sha: "b".repeat(40),
        source_workflow_path: ".github/workflows/run_tenx_weekly.yml",
        source_workflow_sha256: "c".repeat(64),
        entry_policy_version: "first_regular_open_after_trusted_archive_commit_v1",
        proof_policy_version: "repository_bound_backcast_v1",
        strategy: "TENX",
        run_id: DEFECTIVE_RUN_ID,
      },
    }],
    signals: evidenceSignals("RECONSTRUCTED"),
    methodology: {},
  };
}

function contaminatedPayload() {
  const trustedBefore = run("30874618401", "2026-08-04T12:00:00Z", "2026-08-04");
  const defective = run(DEFECTIVE_RUN_ID, "2026-08-10T13:17:12Z", "2026-08-10");
  const trustedAfter = run("31460455179", "2026-08-11T12:00:00Z", "2026-08-11");
  return {
    contract_version: "general_screener_v2",
    generated_at: "2026-08-14T10:00:00Z",
    benchmark: "QQQ",
    evidence_status: "HOLD: PARTIAL_HORIZON_MATRIX",
    runs: [trustedBefore, defective, trustedAfter],
    recommendations: [
      recommendation(trustedBefore.run_id, "DLO"),
      recommendation(defective.run_id, "LIF"),
      recommendation(trustedAfter.run_id, "DLO"),
    ],
    archive_detail_coverage: {
      contract_version: "archive_detail_coverage_v1",
      status: "UNAVAILABLE",
      recommendation_count: 3,
      complete_count: 0,
      legacy_unavailable_count: 3,
      by_strategy: [
        { strategy: "MLG", status: "UNAVAILABLE", recommendation_count: 0, complete_count: 0, legacy_unavailable_count: 0 },
        { strategy: "TENX", status: "UNAVAILABLE", recommendation_count: 3, complete_count: 0, legacy_unavailable_count: 3 },
      ],
    },
    performance: exactPerformance(),
    performance_backcast: backcastPerformance(),
  };
}

test("quarantines the defective TENX run across selection, history, detail, search, and performance evidence", () => {
  const source = contaminatedPayload();
  assert.equal(assertDashboardPayload(source), source);

  const safe = quarantineDashboardPayload(source);
  assert.equal(assertDashboardPayload(safe), safe);
  assert.equal(source.runs.some(isQuarantinedDashboardRun), true, "the source payload remains immutable");
  assert.deepEqual(safe.runs.map((item) => item.run_id), ["30874618401", "31460455179"]);
  assert.deepEqual(safe.recommendations.map((item) => item.symbol), ["DLO", "DLO"]);
  assert.equal(safe.archive_detail_coverage.recommendation_count, 2);
  assert.equal(safe.archive_detail_coverage.by_strategy.find((item) => item.strategy === "TENX").recommendation_count, 2);

  const index = createDashboardIndex(safe);
  assert.equal(index.runsByStrategy.get("TENX")[0].run_id, "31460455179");
  assert.equal(resolveSelectedRun(safe.runs, "TENX", DEFECTIVE_RUN_ID).requestedRunMissing, true);
  assert.equal(getIndexedRecommendation(index, "TENX", DEFECTIVE_RUN_ID, "LIF"), null);
  assert.deepEqual(searchHistoryRuns(index, { query: DEFECTIVE_RUN_ID }), []);
  assert.deepEqual(searchHistoryRuns(index, { query: "LIF" }), []);
  assert.deepEqual(searchSecurities(index, "LIF"), []);
  assert.deepEqual(getIndexedRunChanges(index, "TENX", "31460455179").retained, ["DLO"]);

  for (const evidence of [safe.performance, safe.performance_backcast]) {
    assert.equal(evidence.status, "HOLD");
    assert.equal(evidence.aggregates.length, 0);
    assert.equal(evidence.run_series.length, 0);
    assert.equal(evidence.signals.length, 0);
    const cell = evidence.horizon_statuses.find((item) => item.strategy === "TENX" && item.horizon === "20d");
    assert.deepEqual(
      [cell.status, cell.complete_run_count, cell.underlying_signal_count, cell.measurement_session_max, cell.reason_code],
      ["HOLD", null, null, null, "QUARANTINED_DEFECTIVE_RUN"],
    );
  }
  assert.equal(safe.evidence_status, "HOLD: QUARANTINED_DEFECTIVE_RUN");
  assert.equal(safe.performance.evidence_status, safe.evidence_status);
});

test("uses strategy plus run ID as the quarantine identity and preserves clean payload references", () => {
  const clean = { runs: [], recommendations: [] };
  assert.equal(quarantineDashboardPayload(clean), clean);
  assert.equal(isQuarantinedDashboardRun({ strategy: "MLG", run_id: DEFECTIVE_RUN_ID }), false);
  assert.equal(isQuarantinedDashboardRun({ strategy: "TENX", run_id: DEFECTIVE_RUN_ID }), true);
});
