const STRATEGIES = new Set(["MLG", "TENX"]);
const HORIZONS = new Set(["5d", "10d", "20d"]);

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}

function requireObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
}

function requireText(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "must be a non-empty string");
  }
}

function requireStrategy(value, path) {
  if (!STRATEGIES.has(value)) fail(path, "must be MLG or TENX");
}

function requireOptionalFinite(value, path) {
  if (value !== null && value !== undefined && !Number.isFinite(Number(value))) {
    fail(path, "must be finite or null");
  }
}

export function assertDashboardPayload(payload) {
  requireObject(payload, "payload");
  if (payload.contract_version !== "general_screener_v1") {
    fail("contract_version", "unsupported contract");
  }
  requireText(payload.generated_at, "generated_at");
  requireText(payload.benchmark, "benchmark");
  requireText(payload.evidence_status, "evidence_status");
  if (!Array.isArray(payload.runs)) fail("runs", "must be an array");
  if (!Array.isArray(payload.recommendations)) fail("recommendations", "must be an array");

  const runKeys = new Set();
  payload.runs.forEach((run, index) => {
    const path = `runs[${index}]`;
    requireObject(run, path);
    requireStrategy(run.strategy, `${path}.strategy`);
    if (!["string", "number"].includes(typeof run.run_id) || String(run.run_id).trim() === "") {
      fail(`${path}.run_id`, "must be a non-empty string or number");
    }
    requireText(run.report_created_at, `${path}.report_created_at`);
    const key = `${run.strategy}:${run.run_id}`;
    if (runKeys.has(key)) fail(path, "duplicates a run key");
    runKeys.add(key);
  });

  payload.recommendations.forEach((item, index) => {
    const path = `recommendations[${index}]`;
    requireObject(item, path);
    requireStrategy(item.strategy, `${path}.strategy`);
    requireText(item.symbol, `${path}.symbol`);
    if (!Number.isInteger(Number(item.recommendation_rank)) || Number(item.recommendation_rank) < 1) {
      fail(`${path}.recommendation_rank`, "must be a positive integer");
    }
    if (!runKeys.has(`${item.strategy}:${item.run_id}`)) {
      fail(`${path}.run_id`, "must reference an existing run");
    }
    requireOptionalFinite(item.score, `${path}.score`);
    requireOptionalFinite(item.screening_price, `${path}.screening_price`);
    if (item.risk_flags !== null && item.risk_flags !== undefined && typeof item.risk_flags !== "string") {
      fail(`${path}.risk_flags`, "must be a string or null");
    }
  });

  if (payload.performance !== undefined) {
    requireObject(payload.performance, "performance");
    if (!Array.isArray(payload.performance.aggregates)) fail("performance.aggregates", "must be an array");
    if (!Array.isArray(payload.performance.signals)) fail("performance.signals", "must be an array");
    payload.performance.aggregates.forEach((item, index) => {
      const path = `performance.aggregates[${index}]`;
      requireObject(item, path);
      requireStrategy(item.strategy, `${path}.strategy`);
      if (!HORIZONS.has(String(item.horizon).toLowerCase())) {
        fail(`${path}.horizon`, "must be 5d, 10d, or 20d");
      }
      requireOptionalFinite(item.equal_weight_return, `${path}.equal_weight_return`);
      requireOptionalFinite(item.qqq_equal_weight_return, `${path}.qqq_equal_weight_return`);
      requireOptionalFinite(item.equal_weight_excess_return, `${path}.equal_weight_excess_return`);
      if (!Number.isInteger(Number(item.count)) || Number(item.count) < 0) {
        fail(`${path}.count`, "must be a non-negative integer");
      }
    });
  }

  return payload;
}
