const QUARANTINE_REASON = "QUARANTINED_DEFECTIVE_RUN";
const EXPECTED_EVIDENCE_CELLS = 6;

export const QUARANTINED_DASHBOARD_RUNS = Object.freeze([
  Object.freeze({ strategy: "TENX", runId: "31390549097" }),
]);

const quarantinedRunKeys = new Set(
  QUARANTINED_DASHBOARD_RUNS.map(({ strategy, runId }) => `${strategy}:${runId}`),
);

function runKey(item) {
  return `${String(item?.strategy || "").toUpperCase()}:${String(item?.run_id ?? "")}`;
}

function evidenceCellKey(item) {
  return `${String(item?.strategy || "").toUpperCase()}:${String(item?.horizon || "").toLowerCase()}`;
}

export function isQuarantinedDashboardRun(item) {
  return quarantinedRunKeys.has(runKey(item));
}

function coverageStatus(recommendationCount, completeCount) {
  if (recommendationCount === 0 || completeCount === 0) return "UNAVAILABLE";
  return recommendationCount === completeCount ? "COMPLETE" : "PARTIAL";
}

function rebuildCoverage(template, recommendations) {
  const completeCount = recommendations.filter((item) => item.detail?.status === "complete").length;
  const legacyUnavailableCount = recommendations.filter(
    (item) => item.detail?.status === "legacy_unavailable",
  ).length;
  return {
    ...template,
    status: coverageStatus(recommendations.length, completeCount),
    recommendation_count: recommendations.length,
    complete_count: completeCount,
    legacy_unavailable_count: legacyUnavailableCount,
  };
}

function quarantinedEvidenceCells(evidence) {
  const cells = new Set();
  for (const item of [...(evidence?.run_series || []), ...(evidence?.signals || [])]) {
    if (isQuarantinedDashboardRun(item)) cells.add(evidenceCellKey(item));
  }
  return cells;
}

function officialEvidenceStatus(status, reasonCode) {
  if (status === "READY") return "PASS";
  if (status === "PARTIAL") return "HOLD: PARTIAL_HORIZON_MATRIX";
  if (status === "PENDING") return "HOLD: HORIZON_OBSERVATIONS_PENDING";
  return `HOLD: ${reasonCode}`;
}

function matrixStatus(horizonStatuses, completeStatus) {
  const completeCount = horizonStatuses.filter((item) => item.status === completeStatus).length;
  if (completeCount === EXPECTED_EVIDENCE_CELLS) return "READY";
  if (completeCount > 0) return "PARTIAL";
  return horizonStatuses.some((item) => item.status === "HOLD") ? "HOLD" : "PENDING";
}

function quarantineEvidenceCells(evidence, { completeStatus, includeEvidenceStatus }) {
  if (!evidence || typeof evidence !== "object") return evidence;
  const cells = quarantinedEvidenceCells(evidence);
  if (!cells.size) return evidence;

  const keepUnaffectedCell = (item) => !cells.has(evidenceCellKey(item));
  const horizonStatuses = (evidence.horizon_statuses || []).map((item) => (
    cells.has(evidenceCellKey(item))
      ? {
          ...item,
          status: "HOLD",
          complete_run_count: null,
          underlying_signal_count: null,
          measurement_session_max: null,
          reason_code: QUARANTINE_REASON,
        }
      : item
  ));
  const status = matrixStatus(horizonStatuses, completeStatus);

  return {
    ...evidence,
    status,
    reason_code: QUARANTINE_REASON,
    ...(includeEvidenceStatus ? { evidence_status: officialEvidenceStatus(status, QUARANTINE_REASON) } : {}),
    horizon_statuses: horizonStatuses,
    aggregates: (evidence.aggregates || []).filter(keepUnaffectedCell),
    run_series: (evidence.run_series || []).filter(keepUnaffectedCell),
    signals: (evidence.signals || []).filter(keepUnaffectedCell),
  };
}

/**
 * Removes explicitly invalidated runs at the decrypted-data boundary.
 *
 * Any performance cell touched by a quarantined run is withheld in full rather
 * than recalculated in the browser. This keeps published engine evidence as the
 * only source of displayed performance numbers.
 */
export function quarantineDashboardPayload(payload = {}) {
  const runs = (payload.runs || []).filter((item) => !isQuarantinedDashboardRun(item));
  const recommendations = (payload.recommendations || []).filter(
    (item) => !isQuarantinedDashboardRun(item),
  );
  const performance = quarantineEvidenceCells(payload.performance, {
    completeStatus: "VERIFIED",
    includeEvidenceStatus: true,
  });
  const performanceBackcast = quarantineEvidenceCells(payload.performance_backcast, {
    completeStatus: "RECONSTRUCTED",
    includeEvidenceStatus: false,
  });
  const changed = runs.length !== (payload.runs || []).length
    || recommendations.length !== (payload.recommendations || []).length
    || performance !== payload.performance
    || performanceBackcast !== payload.performance_backcast;

  if (!changed) return payload;

  const archiveDetailCoverage = payload.archive_detail_coverage
    ? {
        ...rebuildCoverage(payload.archive_detail_coverage, recommendations),
        by_strategy: payload.archive_detail_coverage.by_strategy.map((item) => (
          rebuildCoverage(
            item,
            recommendations.filter((recommendation) => recommendation.strategy === item.strategy),
          )
        )),
      }
    : payload.archive_detail_coverage;
  const evidenceStatus = performance !== payload.performance
    ? performance.evidence_status
    : payload.evidence_status;

  return {
    ...payload,
    evidence_status: evidenceStatus,
    runs,
    recommendations,
    ...(payload.archive_detail_coverage ? { archive_detail_coverage: archiveDetailCoverage } : {}),
    ...(payload.performance ? { performance } : {}),
    ...(payload.performance_backcast ? { performance_backcast: performanceBackcast } : {}),
  };
}
