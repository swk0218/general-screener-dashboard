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
