const STRATEGIES = new Set(["MLG", "TENX"]);
const HORIZONS = new Set(["5d", "10d", "20d"]);
const PERFORMANCE_STATUSES = new Set(["PENDING", "PARTIAL", "READY", "HOLD"]);
const HORIZON_STATUSES = new Set(["VERIFIED", "PENDING", "HOLD"]);
const PERFORMANCE_VIEW = "run_equal_weight";

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

  return payload;
}
