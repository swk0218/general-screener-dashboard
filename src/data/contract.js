const STRATEGIES = new Set(["MLG", "TENX"]);
const HORIZONS = new Set(["5d", "10d", "20d"]);
const PERFORMANCE_STATUSES = new Set(["PENDING", "PARTIAL", "READY", "HOLD"]);
const HORIZON_STATUSES = new Set(["VERIFIED", "PENDING", "HOLD"]);
const BACKCAST_HORIZON_STATUSES = new Set(["RECONSTRUCTED", "PENDING", "HOLD"]);
const PERFORMANCE_VIEW = "run_equal_weight";
const BACKCAST_TIER = "RECONSTRUCTED_REPOSITORY_BOUND";

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

function requireOptionalText(value, path) {
  if (value === null || value === undefined) return;
  requireText(value, path);
}

function requireStrategy(value, path) {
  if (!STRATEGIES.has(value)) fail(path, "must be MLG or TENX");
}

function requireOptionalFinite(value, path) {
  if (value !== null && value !== undefined && !Number.isFinite(Number(value))) {
    fail(path, "must be finite or null");
  }
}

function requireFinite(value, path) {
  if (!Number.isFinite(Number(value))) fail(path, "must be finite");
}

function requireNonnegativeInteger(value, path) {
  if (!Number.isInteger(Number(value)) || Number(value) < 0) {
    fail(path, "must be a non-negative integer");
  }
}

function requireClose(actual, expected, path, message) {
  const tolerance = 1e-10 * Math.max(1, Math.abs(Number(actual)), Math.abs(Number(expected)));
  if (Math.abs(Number(actual) - Number(expected)) > tolerance) fail(path, message);
}

function mean(values, path) {
  if (!values.length) fail(path, "cannot be calculated from an empty series");
  return values.reduce((total, value) => total + Number(value), 0) / values.length;
}

function requireUnitInterval(value, path) {
  requireFinite(value, path);
  if (Number(value) < 0 || Number(value) > 1) {
    fail(path, "must be between 0 and 1");
  }
}

function performanceEvidenceStatus(status, reasonCode) {
  if (status === "READY") return "PASS";
  if (status === "PARTIAL") return "HOLD: PARTIAL_HORIZON_MATRIX";
  if (status === "PENDING") return "HOLD: HORIZON_OBSERVATIONS_PENDING";
  return `HOLD: ${reasonCode}`;
}

function requireOptionalIsoDate(value, path) {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail(path, "must be an ISO date or null");
  }
}

function requireIsoDate(value, path) {
  requireOptionalIsoDate(value, path);
  if (value === null || value === undefined) fail(path, "must be an ISO date");
}

function requireOptionalIsoTimestamp(value, path) {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    fail(path, "must be an ISO timestamp or null");
  }
}

function requireIdentity(value, path) {
  if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
    fail(path, "must be a non-empty string or number");
  }
}

function requireLowerHex(value, length, path) {
  if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    fail(path, `must be ${length} lowercase hexadecimal characters`);
  }
}

function requireExactKeys(value, allowedKeys, path) {
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length) fail(path, `contains unsupported field ${unexpected[0]}`);
}

function validateRecommendationDetail(detail, path, strategy) {
  requireObject(detail, path);
  requireExactKeys(
    detail,
    ["contract_version", "status", "thesis", "drivers", "risks", "timing", "score_breakdown"],
    path,
  );
  if (detail.contract_version !== "recommendation_detail_v1") {
    fail(`${path}.contract_version`, "must be recommendation_detail_v1");
  }
  if (!["complete", "legacy_unavailable"].includes(detail.status)) {
    fail(`${path}.status`, "must be complete or legacy_unavailable");
  }
  requireObject(detail.thesis, `${path}.thesis`);
  requireExactKeys(detail.thesis, ["summary", "catalyst"], `${path}.thesis`);
  requireOptionalText(detail.thesis.summary, `${path}.thesis.summary`);
  requireOptionalText(detail.thesis.catalyst, `${path}.thesis.catalyst`);

  if (!Array.isArray(detail.drivers)) fail(`${path}.drivers`, "must be an array");
  const driverCodes = new Set();
  detail.drivers.forEach((driver, index) => {
    const driverPath = `${path}.drivers[${index}]`;
    requireObject(driver, driverPath);
    requireExactKeys(driver, ["code", "label", "value", "format", "basis"], driverPath);
    requireText(driver.code, `${driverPath}.code`);
    if (driverCodes.has(driver.code)) fail(`${driverPath}.code`, "must be unique");
    driverCodes.add(driver.code);
    requireText(driver.label, `${driverPath}.label`);
    requireText(driver.value, `${driverPath}.value`);
    if (driver.format !== "text") fail(`${driverPath}.format`, "must be text");
    if (driver.basis !== "deterministic_public_formatter") {
      fail(`${driverPath}.basis`, "must be deterministic_public_formatter");
    }
  });

  if (!Array.isArray(detail.risks)) fail(`${path}.risks`, "must be an array");
  if (detail.risks.length > 5) fail(`${path}.risks`, "must contain at most 5 items");
  const riskCodes = new Set();
  detail.risks.forEach((risk, index) => {
    const riskPath = `${path}.risks[${index}]`;
    requireObject(risk, riskPath);
    requireExactKeys(risk, ["code", "label", "category", "basis"], riskPath);
    requireText(risk.code, `${riskPath}.code`);
    if (riskCodes.has(risk.code)) fail(`${riskPath}.code`, "must be unique");
    riskCodes.add(risk.code);
    requireText(risk.label, `${riskPath}.label`);
    requireText(risk.category, `${riskPath}.category`);
    const expectedBasis = strategy === "MLG" ? "deterministic_public_formatter" : "deterministic_public_label";
    if (risk.basis !== expectedBasis) {
      fail(`${riskPath}.basis`, `must be ${expectedBasis}`);
    }
  });

  requireObject(detail.timing, `${path}.timing`);
  requireExactKeys(detail.timing, ["rsi14", "heat", "warning", "price_as_of"], `${path}.timing`);
  requireOptionalFinite(detail.timing.rsi14, `${path}.timing.rsi14`);
  if (detail.timing.rsi14 !== null && detail.timing.rsi14 !== undefined
    && (Number(detail.timing.rsi14) < 0 || Number(detail.timing.rsi14) > 100)) {
    fail(`${path}.timing.rsi14`, "must be between 0 and 100");
  }
  if (!["low", "medium", "high", "unknown"].includes(detail.timing.heat)) {
    fail(`${path}.timing.heat`, "must be low, medium, high, or unknown");
  }
  requireOptionalText(detail.timing.warning, `${path}.timing.warning`);
  if (detail.timing.warning !== null && detail.timing.warning !== undefined
    && detail.timing.warning !== "단기 과열 주의") {
    fail(`${path}.timing.warning`, "must be 단기 과열 주의 or null");
  }
  requireOptionalIsoDate(detail.timing.price_as_of, `${path}.timing.price_as_of`);

  requireObject(detail.score_breakdown, `${path}.score_breakdown`);
  requireExactKeys(
    detail.score_breakdown,
    ["score_name", "total", "aggregation", "dimensions"],
    `${path}.score_breakdown`,
  );
  requireText(detail.score_breakdown.score_name, `${path}.score_breakdown.score_name`);
  const expectedScoreName = strategy === "MLG" ? "production_score" : "tenx_final_score";
  if (detail.score_breakdown.score_name !== expectedScoreName) {
    fail(`${path}.score_breakdown.score_name`, `must be ${expectedScoreName}`);
  }
  requireOptionalFinite(detail.score_breakdown.total, `${path}.score_breakdown.total`);
  if (detail.score_breakdown.aggregation !== "strategy_native_non_additive") {
    fail(`${path}.score_breakdown.aggregation`, "must be strategy_native_non_additive");
  }
  if (!Array.isArray(detail.score_breakdown.dimensions)) {
    fail(`${path}.score_breakdown.dimensions`, "must be an array");
  }
  const dimensionCodes = new Set();
  detail.score_breakdown.dimensions.forEach((dimension, index) => {
    const dimensionPath = `${path}.score_breakdown.dimensions[${index}]`;
    requireObject(dimension, dimensionPath);
    requireExactKeys(dimension, ["code", "label", "value", "scale_min", "scale_max"], dimensionPath);
    requireText(dimension.code, `${dimensionPath}.code`);
    if (dimensionCodes.has(dimension.code)) fail(`${dimensionPath}.code`, "must be unique");
    dimensionCodes.add(dimension.code);
    requireText(dimension.label, `${dimensionPath}.label`);
    requireFinite(dimension.value, `${dimensionPath}.value`);
    requireFinite(dimension.scale_min, `${dimensionPath}.scale_min`);
    requireFinite(dimension.scale_max, `${dimensionPath}.scale_max`);
    if (Number(dimension.scale_min) !== 0 || Number(dimension.scale_max) !== 1) {
      fail(dimensionPath, "scale must be exactly 0..1");
    }
    if (Number(dimension.value) < 0 || Number(dimension.value) > 1) {
      fail(`${dimensionPath}.value`, "must be between 0 and 1");
    }
  });

  if (detail.status === "legacy_unavailable") {
    if (detail.thesis.summary !== null || detail.thesis.catalyst !== null
      || detail.drivers.length || detail.risks.length
      || detail.timing.rsi14 !== null || detail.timing.heat !== "unknown"
      || detail.timing.warning !== null || detail.timing.price_as_of !== null
      || detail.score_breakdown.total !== null || detail.score_breakdown.dimensions.length) {
      fail(path, "legacy_unavailable must not contain synthesized detail");
    }
  }
}

function validatePerformanceBackcast(backcast, benchmark) {
  const path = "performance_backcast";
  requireObject(backcast, path);
  requireExactKeys(backcast, [
    "status", "reason_code", "evaluated_at", "evidence_status", "evidence_tier",
    "benchmark", "portfolio_view", "horizon_statuses", "aggregates", "run_series",
    "signals", "methodology",
  ], path);
  if (!PERFORMANCE_STATUSES.has(backcast.status)) fail(`${path}.status`, "must be PENDING, PARTIAL, READY, or HOLD");
  requireText(backcast.reason_code, `${path}.reason_code`);
  requireOptionalIsoTimestamp(backcast.evaluated_at, `${path}.evaluated_at`);
  if (backcast.evidence_status !== BACKCAST_TIER || backcast.evidence_tier !== BACKCAST_TIER) {
    fail(path, `evidence status and tier must be ${BACKCAST_TIER}`);
  }
  if (backcast.benchmark !== benchmark || backcast.benchmark !== "QQQ") {
    fail(`${path}.benchmark`, "must match the fixed QQQ dashboard benchmark");
  }
  if (backcast.portfolio_view !== PERFORMANCE_VIEW) fail(`${path}.portfolio_view`, `must be ${PERFORMANCE_VIEW}`);
  ["horizon_statuses", "aggregates", "run_series", "signals"].forEach((field) => {
    if (!Array.isArray(backcast[field])) fail(`${path}.${field}`, "must be an array");
  });
  requireObject(backcast.methodology, `${path}.methodology`);

  const expectedCells = new Set(
    ["MLG", "TENX"].flatMap((strategy) => ["5d", "10d", "20d"].map((horizon) => `${strategy}:${horizon}`)),
  );
  const horizonCells = new Set();
  const horizonByCell = new Map();
  backcast.horizon_statuses.forEach((item, index) => {
    const itemPath = `${path}.horizon_statuses[${index}]`;
    requireObject(item, itemPath);
    requireExactKeys(item, [
      "strategy", "horizon", "status", "complete_run_count", "underlying_signal_count",
      "measurement_session_max", "reason_code",
    ], itemPath);
    requireStrategy(item.strategy, `${itemPath}.strategy`);
    const horizon = String(item.horizon).toLowerCase();
    if (!HORIZONS.has(horizon)) fail(`${itemPath}.horizon`, "must be 5d, 10d, or 20d");
    if (!BACKCAST_HORIZON_STATUSES.has(item.status)) fail(`${itemPath}.status`, "must be RECONSTRUCTED, PENDING, or HOLD");
    if (item.status === "RECONSTRUCTED") {
      requireNonnegativeInteger(item.complete_run_count, `${itemPath}.complete_run_count`);
      requireNonnegativeInteger(item.underlying_signal_count, `${itemPath}.underlying_signal_count`);
      if (Number(item.complete_run_count) < 1 || Number(item.underlying_signal_count) < 1) {
        fail(itemPath, "RECONSTRUCTED coverage must contain at least one complete run and signal");
      }
      requireIsoDate(item.measurement_session_max, `${itemPath}.measurement_session_max`);
    } else if (item.complete_run_count !== null || item.underlying_signal_count !== null || item.measurement_session_max !== null) {
      fail(itemPath, "PENDING or HOLD coverage fields must be null");
    }
    requireText(item.reason_code, `${itemPath}.reason_code`);
    const key = `${item.strategy}:${horizon}`;
    if (horizonCells.has(key)) fail(itemPath, "duplicates a strategy and horizon");
    horizonCells.add(key);
    horizonByCell.set(key, item);
  });
  if (horizonCells.size !== expectedCells.size || [...expectedCells].some((key) => !horizonCells.has(key))) {
    fail(`${path}.horizon_statuses`, "must cover all 6 strategy and horizon pairs exactly once");
  }

  const aggregateCells = new Set();
  const aggregateByCell = new Map();
  backcast.aggregates.forEach((item, index) => {
    const itemPath = `${path}.aggregates[${index}]`;
    requireObject(item, itemPath);
    requireExactKeys(item, [
      "strategy", "horizon", "status", "equal_weight_return", "qqq_equal_weight_return",
      "equal_weight_excess_return", "count", "run_count", "underlying_signal_count",
      "portfolio_view", "qqq_win_rate", "positive_rate", "measurement_session_max",
    ], itemPath);
    requireStrategy(item.strategy, `${itemPath}.strategy`);
    const horizon = String(item.horizon).toLowerCase();
    if (!HORIZONS.has(horizon)) fail(`${itemPath}.horizon`, "must be 5d, 10d, or 20d");
    if (item.status !== "RECONSTRUCTED") fail(`${itemPath}.status`, "must be RECONSTRUCTED");
    ["equal_weight_return", "qqq_equal_weight_return", "equal_weight_excess_return"].forEach((field) => requireFinite(item[field], `${itemPath}.${field}`));
    ["count", "run_count", "underlying_signal_count"].forEach((field) => requireNonnegativeInteger(item[field], `${itemPath}.${field}`));
    if (Number(item.run_count) < 1 || Number(item.underlying_signal_count) < 1) {
      fail(itemPath, "RECONSTRUCTED aggregate must contain at least one complete run and signal");
    }
    if (Number(item.count) !== Number(item.run_count)) fail(itemPath, "count must equal run_count");
    const expectedSignalsPerRun = item.strategy === "MLG" ? 10 : 5;
    if (Number(item.underlying_signal_count) !== Number(item.run_count) * expectedSignalsPerRun) {
      fail(itemPath, `underlying_signal_count must contain only complete ${item.strategy} runs`);
    }
    if (item.portfolio_view !== PERFORMANCE_VIEW) fail(`${itemPath}.portfolio_view`, `must be ${PERFORMANCE_VIEW}`);
    requireUnitInterval(item.qqq_win_rate, `${itemPath}.qqq_win_rate`);
    requireUnitInterval(item.positive_rate, `${itemPath}.positive_rate`);
    requireIsoDate(item.measurement_session_max, `${itemPath}.measurement_session_max`);
    const key = `${item.strategy}:${horizon}`;
    if (aggregateCells.has(key)) fail(itemPath, "duplicates a strategy and horizon");
    aggregateCells.add(key);
    aggregateByCell.set(key, item);
  });

  const runKeys = new Set();
  backcast.run_series.forEach((item, index) => {
    const itemPath = `${path}.run_series[${index}]`;
    requireObject(item, itemPath);
    requireExactKeys(item, [
      "strategy", "run_id", "report_date", "horizon", "strategy_return", "qqq_return",
      "excess_return", "signal_count", "entry_session", "measurement_session", "status", "provenance",
    ], itemPath);
    requireStrategy(item.strategy, `${itemPath}.strategy`);
    requireIdentity(item.run_id, `${itemPath}.run_id`);
    requireIsoDate(item.report_date, `${itemPath}.report_date`);
    if (!HORIZONS.has(String(item.horizon).toLowerCase())) fail(`${itemPath}.horizon`, "must be 5d, 10d, or 20d");
    ["strategy_return", "qqq_return", "excess_return"].forEach((field) => requireFinite(item[field], `${itemPath}.${field}`));
    requireNonnegativeInteger(item.signal_count, `${itemPath}.signal_count`);
    const expectedSignalCount = item.strategy === "MLG" ? 10 : 5;
    if (Number(item.signal_count) !== expectedSignalCount) {
      fail(`${itemPath}.signal_count`, `must equal the complete ${item.strategy} run size ${expectedSignalCount}`);
    }
    requireIsoDate(item.entry_session, `${itemPath}.entry_session`);
    requireIsoDate(item.measurement_session, `${itemPath}.measurement_session`);
    if (item.status !== "RECONSTRUCTED") fail(`${itemPath}.status`, "must be RECONSTRUCTED");
    requireObject(item.provenance, `${itemPath}.provenance`);
    requireExactKeys(item.provenance, [
      "evidence_tier", "availability_source", "archive_commit_sha", "archive_committed_at",
      "source_head_sha", "source_workflow_path", "source_workflow_sha256",
      "entry_policy_version", "proof_policy_version", "strategy", "run_id",
    ], `${itemPath}.provenance`);
    if (item.provenance.evidence_tier !== BACKCAST_TIER) fail(`${itemPath}.provenance.evidence_tier`, `must be ${BACKCAST_TIER}`);
    if (item.provenance.availability_source !== "trusted_repository_archive_commit") {
      fail(`${itemPath}.provenance.availability_source`, "must be trusted_repository_archive_commit");
    }
    requireLowerHex(item.provenance.archive_commit_sha, 40, `${itemPath}.provenance.archive_commit_sha`);
    requireLowerHex(item.provenance.source_head_sha, 40, `${itemPath}.provenance.source_head_sha`);
    requireLowerHex(item.provenance.source_workflow_sha256, 64, `${itemPath}.provenance.source_workflow_sha256`);
    requireText(item.provenance.source_workflow_path, `${itemPath}.provenance.source_workflow_path`);
    if (!item.provenance.source_workflow_path.startsWith(".github/workflows/")
      || !item.provenance.source_workflow_path.endsWith(".yml")) {
      fail(`${itemPath}.provenance.source_workflow_path`, "must name a repository workflow YAML file");
    }
    if (item.provenance.entry_policy_version !== "first_regular_open_after_trusted_archive_commit_v1") {
      fail(`${itemPath}.provenance.entry_policy_version`, "has an unsupported entry policy");
    }
    if (item.provenance.proof_policy_version !== "repository_bound_backcast_v1") {
      fail(`${itemPath}.provenance.proof_policy_version`, "has an unsupported proof policy");
    }
    if (item.provenance.strategy !== item.strategy || String(item.provenance.run_id) !== String(item.run_id)) {
      fail(`${itemPath}.provenance`, "must match the parent strategy and run_id");
    }
    requireOptionalIsoTimestamp(item.provenance.archive_committed_at, `${itemPath}.provenance.archive_committed_at`);
    if (item.provenance.archive_committed_at === null || item.provenance.archive_committed_at === undefined) {
      fail(`${itemPath}.provenance.archive_committed_at`, "must be an ISO timestamp");
    }
    const key = `${item.strategy}:${String(item.horizon).toLowerCase()}:${item.run_id}`;
    if (runKeys.has(key)) fail(itemPath, "duplicates a strategy, horizon, and run");
    runKeys.add(key);
  });

  const signalKeys = new Set();
  backcast.signals.forEach((item, index) => {
    const itemPath = `${path}.signals[${index}]`;
    requireObject(item, itemPath);
    requireExactKeys(item, [
      "strategy", "run_id", "signal_id", "symbol", "horizon", "signal_return", "qqq_return",
      "excess_return", "entry_session", "measurement_session", "status",
    ], itemPath);
    requireStrategy(item.strategy, `${itemPath}.strategy`);
    requireIdentity(item.run_id, `${itemPath}.run_id`);
    requireIdentity(item.signal_id, `${itemPath}.signal_id`);
    requireText(item.symbol, `${itemPath}.symbol`);
    if (!HORIZONS.has(String(item.horizon).toLowerCase())) fail(`${itemPath}.horizon`, "must be 5d, 10d, or 20d");
    ["signal_return", "qqq_return", "excess_return"].forEach((field) => requireFinite(item[field], `${itemPath}.${field}`));
    requireClose(
      item.excess_return,
      Number(item.signal_return) - Number(item.qqq_return),
      `${itemPath}.excess_return`,
      "must equal signal_return minus qqq_return",
    );
    requireIsoDate(item.entry_session, `${itemPath}.entry_session`);
    requireIsoDate(item.measurement_session, `${itemPath}.measurement_session`);
    if (item.status !== "RECONSTRUCTED") fail(`${itemPath}.status`, "must be RECONSTRUCTED");
    const key = `${item.strategy}:${String(item.horizon).toLowerCase()}:${item.run_id}:${item.signal_id}`;
    if (signalKeys.has(key)) fail(itemPath, "duplicates a strategy, horizon, run, and signal");
    signalKeys.add(key);
  });

  backcast.run_series.forEach((run, index) => {
    const itemPath = `${path}.run_series[${index}]`;
    const horizon = String(run.horizon).toLowerCase();
    const signals = backcast.signals.filter((signal) => (
      signal.strategy === run.strategy
      && String(signal.horizon).toLowerCase() === horizon
      && String(signal.run_id) === String(run.run_id)
    ));
    if (signals.length !== run.signal_count) {
      fail(itemPath, "signal_count must match reconstructed signal rows");
    }
    if (signals.some((signal) => (
      signal.entry_session !== run.entry_session
      || signal.measurement_session !== run.measurement_session
    ))) {
      fail(itemPath, "entry and measurement sessions must match every reconstructed signal row");
    }
    requireClose(
      run.strategy_return,
      mean(signals.map((signal) => signal.signal_return), `${itemPath}.strategy_return`),
      `${itemPath}.strategy_return`,
      "must equal the mean reconstructed signal return",
    );
    requireClose(
      run.qqq_return,
      mean(signals.map((signal) => signal.qqq_return), `${itemPath}.qqq_return`),
      `${itemPath}.qqq_return`,
      "must equal the mean reconstructed QQQ return",
    );
    requireClose(
      run.excess_return,
      mean(signals.map((signal) => signal.excess_return), `${itemPath}.excess_return`),
      `${itemPath}.excess_return`,
      "must equal the mean reconstructed signal excess return",
    );
    requireClose(
      run.excess_return,
      Number(run.strategy_return) - Number(run.qqq_return),
      `${itemPath}.excess_return`,
      "must equal strategy_return minus qqq_return",
    );
  });

  backcast.aggregates.forEach((aggregate, index) => {
    const itemPath = `${path}.aggregates[${index}]`;
    const inCell = (item) => item.strategy === aggregate.strategy
      && String(item.horizon).toLowerCase() === String(aggregate.horizon).toLowerCase();
    const runs = backcast.run_series.filter(inCell);
    const signals = backcast.signals.filter(inCell);
    if (runs.length !== aggregate.run_count || signals.length !== aggregate.underlying_signal_count) {
      fail(itemPath, "coverage counts must match reconstructed series rows");
    }
    requireClose(
      aggregate.equal_weight_return,
      mean(runs.map((run) => run.strategy_return), `${itemPath}.equal_weight_return`),
      `${itemPath}.equal_weight_return`,
      "must equal the mean reconstructed run return",
    );
    requireClose(
      aggregate.qqq_equal_weight_return,
      mean(runs.map((run) => run.qqq_return), `${itemPath}.qqq_equal_weight_return`),
      `${itemPath}.qqq_equal_weight_return`,
      "must equal the mean reconstructed run QQQ return",
    );
    requireClose(
      aggregate.equal_weight_excess_return,
      mean(runs.map((run) => run.excess_return), `${itemPath}.equal_weight_excess_return`),
      `${itemPath}.equal_weight_excess_return`,
      "must equal the mean reconstructed run excess return",
    );
    requireClose(
      aggregate.equal_weight_excess_return,
      Number(aggregate.equal_weight_return) - Number(aggregate.qqq_equal_weight_return),
      `${itemPath}.equal_weight_excess_return`,
      "must equal equal_weight_return minus qqq_equal_weight_return",
    );
    requireClose(
      aggregate.qqq_win_rate,
      mean(runs.map((run) => Number(run.excess_return) > 0 ? 1 : 0), `${itemPath}.qqq_win_rate`),
      `${itemPath}.qqq_win_rate`,
      "must equal the reconstructed run QQQ win rate",
    );
    requireClose(
      aggregate.positive_rate,
      mean(runs.map((run) => Number(run.strategy_return) > 0 ? 1 : 0), `${itemPath}.positive_rate`),
      `${itemPath}.positive_rate`,
      "must equal the reconstructed positive run rate",
    );
    const measurementSessionMax = signals.map((signal) => signal.measurement_session).sort().at(-1);
    if (aggregate.measurement_session_max !== measurementSessionMax) {
      fail(`${itemPath}.measurement_session_max`, "must match reconstructed signal coverage");
    }
  });

  backcast.horizon_statuses.forEach((status, index) => {
    const itemPath = `${path}.horizon_statuses[${index}]`;
    const horizon = String(status.horizon).toLowerCase();
    const key = `${status.strategy}:${horizon}`;
    const aggregate = aggregateByCell.get(key);
    const inCell = (item) => item.strategy === status.strategy
      && String(item.horizon).toLowerCase() === horizon;
    const runs = backcast.run_series.filter(inCell);
    const signals = backcast.signals.filter(inCell);
    if (status.status === "RECONSTRUCTED") {
      if (!aggregate) fail(itemPath, "RECONSTRUCTED coverage requires exactly one aggregate");
      if (runs.length !== status.complete_run_count || signals.length !== status.underlying_signal_count) {
        fail(itemPath, "coverage counts must match reconstructed series rows");
      }
      const measurementSessionMax = signals.map((signal) => signal.measurement_session).sort().at(-1);
      if (status.measurement_session_max !== measurementSessionMax
        || status.measurement_session_max !== aggregate.measurement_session_max) {
        fail(`${itemPath}.measurement_session_max`, "must match aggregate and signal coverage");
      }
    } else if (aggregate || runs.length || signals.length) {
      fail(itemPath, "PENDING or HOLD coverage must not contain reconstructed rows");
    }
  });

  const reconstructedCount = [...horizonByCell.values()].filter((item) => item.status === "RECONSTRUCTED").length;
  const expectedStatus = reconstructedCount === expectedCells.size
    ? "READY"
    : reconstructedCount > 0
      ? "PARTIAL"
      : [...horizonByCell.values()].some((item) => item.status === "HOLD")
        ? "HOLD"
        : "PENDING";
  if (backcast.status !== expectedStatus) {
    fail(`${path}.status`, `must be ${expectedStatus} for the reconstructed horizon matrix`);
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
    requireIdentity(run.run_id, `${path}.run_id`);
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
    if (item.detail !== undefined) {
      validateRecommendationDetail(item.detail, `${path}.detail`, item.strategy);
    }
    if (item.detail_provenance !== undefined) {
      requireObject(item.detail_provenance, `${path}.detail_provenance`);
      requireExactKeys(item.detail_provenance, [
        "method", "source_kind", "original_telegram_text_used",
      ], `${path}.detail_provenance`);
      if (item.detail_provenance.method !== "deterministic_structured_reconstruction") {
        fail(`${path}.detail_provenance.method`, "must be deterministic_structured_reconstruction");
      }
      if (item.detail_provenance.source_kind !== "compact_audit_snapshot") {
        fail(`${path}.detail_provenance.source_kind`, "must be compact_audit_snapshot");
      }
      if (item.detail_provenance.original_telegram_text_used !== false) {
        fail(`${path}.detail_provenance.original_telegram_text_used`, "must be false");
      }
      if (item.detail?.status !== "complete") {
        fail(`${path}.detail_provenance`, "requires complete structured detail");
      }
    }
  });

  if (payload.performance !== undefined) {
    requireObject(payload.performance, "performance");
    if (!Array.isArray(payload.performance.aggregates)) fail("performance.aggregates", "must be an array");
    if (!Array.isArray(payload.performance.signals)) fail("performance.signals", "must be an array");
    const hasExactStatus = payload.performance.status !== undefined;
    if (hasExactStatus) {
      requireExactKeys(payload.performance, [
        "status", "reason_code", "evaluated_at", "evidence_status", "portfolio_view",
        "horizon_statuses", "aggregates", "run_series", "signals",
      ], "performance");
      if (!PERFORMANCE_STATUSES.has(payload.performance.status)) {
        fail("performance.status", "must be PENDING, PARTIAL, READY, or HOLD");
      }
      requireText(payload.performance.reason_code, "performance.reason_code");
      requireOptionalIsoTimestamp(payload.performance.evaluated_at, "performance.evaluated_at");
      requireText(payload.performance.evidence_status, "performance.evidence_status");
      const expectedEvidenceStatus = performanceEvidenceStatus(
        payload.performance.status,
        payload.performance.reason_code,
      );
      if (payload.performance.evidence_status !== expectedEvidenceStatus) {
        fail("performance.evidence_status", `must be ${expectedEvidenceStatus}`);
      }
      if (payload.evidence_status !== payload.performance.evidence_status) {
        fail("evidence_status", "must match performance.evidence_status");
      }
      if (payload.performance.portfolio_view !== PERFORMANCE_VIEW) {
        fail("performance.portfolio_view", `must be ${PERFORMANCE_VIEW}`);
      }
      if (!Array.isArray(payload.performance.horizon_statuses)) {
        fail("performance.horizon_statuses", "must be an array");
      }
      if (!Array.isArray(payload.performance.run_series)) fail("performance.run_series", "must be an array");
      const expectedHorizonKeys = new Set(
        ["MLG", "TENX"].flatMap((strategy) => (
          ["5d", "10d", "20d"].map((horizon) => `${strategy}:${horizon}`)
        )),
      );
      const horizonKeys = new Set();
      payload.performance.horizon_statuses.forEach((item, index) => {
        const path = `performance.horizon_statuses[${index}]`;
        requireObject(item, path);
        requireExactKeys(item, [
          "strategy", "horizon", "status", "complete_run_count", "underlying_signal_count",
          "measurement_session_max", "reason_code",
        ], path);
        requireStrategy(item.strategy, `${path}.strategy`);
        if (!HORIZONS.has(String(item.horizon).toLowerCase())) fail(`${path}.horizon`, "must be 5d, 10d, or 20d");
        if (!HORIZON_STATUSES.has(item.status)) fail(`${path}.status`, "must be VERIFIED, PENDING, or HOLD");
        if (item.status === "VERIFIED") {
          requireNonnegativeInteger(item.complete_run_count, `${path}.complete_run_count`);
          requireNonnegativeInteger(item.underlying_signal_count, `${path}.underlying_signal_count`);
          requireIsoDate(item.measurement_session_max, `${path}.measurement_session_max`);
        } else if (item.complete_run_count !== null || item.underlying_signal_count !== null
          || item.measurement_session_max !== null) {
          fail(path, "PENDING or HOLD coverage fields must be null");
        }
        requireText(item.reason_code, `${path}.reason_code`);
        const key = `${item.strategy}:${String(item.horizon).toLowerCase()}`;
        if (horizonKeys.has(key)) fail(path, "duplicates a strategy and horizon");
        horizonKeys.add(key);
      });
      if (horizonKeys.size !== expectedHorizonKeys.size
        || [...expectedHorizonKeys].some((key) => !horizonKeys.has(key))) {
        fail("performance.horizon_statuses", "must cover all 6 strategy and horizon pairs exactly once");
      }

      const runSeriesKeys = new Set();
      payload.performance.run_series.forEach((item, index) => {
        const path = `performance.run_series[${index}]`;
        requireObject(item, path);
        requireExactKeys(item, [
          "strategy", "run_id", "report_date", "horizon", "strategy_return", "qqq_return",
          "excess_return", "signal_count", "status",
        ], path);
        requireStrategy(item.strategy, `${path}.strategy`);
        requireIdentity(item.run_id, `${path}.run_id`);
        requireIsoDate(item.report_date, `${path}.report_date`);
        if (!HORIZONS.has(String(item.horizon).toLowerCase())) fail(`${path}.horizon`, "must be 5d, 10d, or 20d");
        requireFinite(item.strategy_return, `${path}.strategy_return`);
        requireFinite(item.qqq_return, `${path}.qqq_return`);
        requireFinite(item.excess_return, `${path}.excess_return`);
        requireNonnegativeInteger(item.signal_count, `${path}.signal_count`);
        if (item.status !== "VERIFIED") fail(`${path}.status`, "must be VERIFIED");
        const horizonKey = `${item.strategy}:${String(item.horizon).toLowerCase()}`;
        const horizonStatus = payload.performance.horizon_statuses.find(
          (candidate) => `${candidate.strategy}:${String(candidate.horizon).toLowerCase()}` === horizonKey,
        );
        if (horizonStatus?.status !== "VERIFIED") fail(path, "requires a matching VERIFIED horizon status");
        const key = `${horizonKey}:${item.run_id}`;
        if (runSeriesKeys.has(key)) fail(path, "duplicates a strategy, horizon, and run");
        runSeriesKeys.add(key);
      });

      const signalKeys = new Set();
      payload.performance.signals.forEach((item, index) => {
        const path = `performance.signals[${index}]`;
        requireObject(item, path);
        requireExactKeys(item, [
          "strategy", "run_id", "signal_id", "symbol", "horizon", "signal_return", "qqq_return",
          "excess_return", "entry_session", "measurement_session", "status",
        ], path);
        requireStrategy(item.strategy, `${path}.strategy`);
        requireIdentity(item.run_id, `${path}.run_id`);
        requireIdentity(item.signal_id, `${path}.signal_id`);
        requireText(item.symbol, `${path}.symbol`);
        if (!HORIZONS.has(String(item.horizon).toLowerCase())) fail(`${path}.horizon`, "must be 5d, 10d, or 20d");
        requireFinite(item.signal_return, `${path}.signal_return`);
        requireFinite(item.qqq_return, `${path}.qqq_return`);
        requireFinite(item.excess_return, `${path}.excess_return`);
        requireIsoDate(item.entry_session, `${path}.entry_session`);
        requireIsoDate(item.measurement_session, `${path}.measurement_session`);
        if (item.status !== "VERIFIED") fail(`${path}.status`, "must be VERIFIED");
        const horizonKey = `${item.strategy}:${String(item.horizon).toLowerCase()}`;
        const horizonStatus = payload.performance.horizon_statuses.find(
          (candidate) => `${candidate.strategy}:${String(candidate.horizon).toLowerCase()}` === horizonKey,
        );
        if (horizonStatus?.status !== "VERIFIED") fail(path, "requires a matching VERIFIED horizon status");
        const key = `${horizonKey}:${item.run_id}:${item.signal_id}`;
        if (signalKeys.has(key)) fail(path, "duplicates a strategy, horizon, run, and signal");
        signalKeys.add(key);
      });
    }
    const aggregateKeys = new Set();
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
      requireNonnegativeInteger(item.count, `${path}.count`);
      if (hasExactStatus) {
        requireExactKeys(item, [
          "strategy", "horizon", "equal_weight_return", "qqq_equal_weight_return",
          "equal_weight_excess_return", "count", "run_count", "underlying_signal_count",
          "portfolio_view", "qqq_win_rate", "positive_rate", "measurement_session_max", "status",
        ], path);
        if (item.status !== "VERIFIED") fail(`${path}.status`, "must be VERIFIED");
        requireFinite(item.equal_weight_return, `${path}.equal_weight_return`);
        requireFinite(item.qqq_equal_weight_return, `${path}.qqq_equal_weight_return`);
        requireFinite(item.equal_weight_excess_return, `${path}.equal_weight_excess_return`);
        requireNonnegativeInteger(item.run_count, `${path}.run_count`);
        requireNonnegativeInteger(item.underlying_signal_count, `${path}.underlying_signal_count`);
        if (Number(item.count) !== Number(item.run_count)) {
          fail(path, "count must equal run_count for run-equal performance");
        }
        if (item.portfolio_view !== PERFORMANCE_VIEW) {
          fail(`${path}.portfolio_view`, `must be ${PERFORMANCE_VIEW}`);
        }
        requireUnitInterval(item.qqq_win_rate, `${path}.qqq_win_rate`);
        requireUnitInterval(item.positive_rate, `${path}.positive_rate`);
        requireIsoDate(item.measurement_session_max, `${path}.measurement_session_max`);
        const key = `${item.strategy}:${String(item.horizon).toLowerCase()}`;
        if (aggregateKeys.has(key)) fail(path, "duplicates a strategy and horizon");
        aggregateKeys.add(key);
        const horizonStatus = payload.performance.horizon_statuses.find(
          (candidate) => `${candidate.strategy}:${String(candidate.horizon).toLowerCase()}` === key,
        );
        if (horizonStatus?.status !== "VERIFIED") {
          fail(path, "requires a matching VERIFIED horizon status");
        }
        if (Number(item.run_count) !== Number(horizonStatus.complete_run_count)
          || Number(item.underlying_signal_count) !== Number(horizonStatus.underlying_signal_count)
          || item.measurement_session_max !== horizonStatus.measurement_session_max) {
          fail(path, "must match the VERIFIED horizon coverage");
        }
      }
    });

    if (hasExactStatus) {
      payload.performance.aggregates.forEach((aggregate, index) => {
        const path = `performance.aggregates[${index}]`;
        const inCell = (item) => item.strategy === aggregate.strategy
          && String(item.horizon).toLowerCase() === String(aggregate.horizon).toLowerCase();
        const runSeries = payload.performance.run_series.filter(inCell);
        const signals = payload.performance.signals.filter(inCell);
        if (runSeries.length !== aggregate.run_count) {
          fail(path, "run_count must equal the number of VERIFIED run_series rows");
        }
        if (signals.length !== aggregate.underlying_signal_count) {
          fail(path, "underlying_signal_count must equal the number of VERIFIED signal rows");
        }
        const maxMeasurementSession = signals.reduce(
          (latest, signal) => (!latest || signal.measurement_session > latest ? signal.measurement_session : latest),
          null,
        );
        if (maxMeasurementSession !== aggregate.measurement_session_max) {
          fail(path, "measurement_session_max must match the verified signal series");
        }
        runSeries.forEach((runSeriesItem) => {
          const runSignals = signals.filter((signal) => String(signal.run_id) === String(runSeriesItem.run_id));
          if (runSignals.length !== runSeriesItem.signal_count) {
            fail(path, "each run_series signal_count must match its verified signal rows");
          }
        });
      });
    }
  }

  if (payload.performance_backcast !== undefined) {
    validatePerformanceBackcast(payload.performance_backcast, payload.benchmark);
  }

  return payload;
}
