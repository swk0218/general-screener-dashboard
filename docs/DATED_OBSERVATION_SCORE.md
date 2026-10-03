# Numeric observation delivery

OBSERVATION_COMPUTED is an explicit dated, score-only contract. It requires
observation_only=true, controller_evaluated=false, evidence_ready=false, no emitted
events, no active controllers, valid calculation time and gauge20–79. Existing
hold/stale/live guards remain. Extreme continues to mean an actual emitted event.

The UI keeps the numeric score of the latest common input day visible and labels
the expected market day, missing latest inputs and delayed receipt. Old observations
are dated observations, never relabeled live alerts. Source-status refresh alone
does not compute the model. Presence of encrypted market-radar.enc.json enables the
optional loader; authentication and the strict contract still fail closed.

October 3 local QA used an encrypted actual October1 observation (43/100) with
a TEST_ONLY password, plus synthetic Screener responses. Nothing from that local
test was published. 1440/390/360px route/overflow/console/storage/lock checks passed.
75 unit tests, encrypted operating payload validation and build checks passed.

Existing production backup remains backup/production-before-radar-beta-20261003
at 9d1797be6bf9265662ce118e9f94bf8ae2f5be58. Revert the numeric frontend commit
and remove only the optional encrypted Radar asset via versioned change to rollback.
Do not modify public/data/payload.enc.json or MLG/TENX producer workflows.

Numeric public deployment remains pending the existing-key private publisher
integration. A separate manual publication does not constitute daily numeric refresh.

Observation display constraint: native Context80/CNN feature values and scores are unchanged. Gauge43 uses the original sealed UI-v1 annual ECDF no-emission branch, not a new fit, percentile, cap or model threshold. Because no controller evaluation is performed, this observation cannot determine would_emit, quota, cooldown, confirmation or active hold state. The 20–79 observation range expresses no actual issued event; it does not assert that an operationally evaluated controller would be silent. Only a genuinely emitted operational event may enter Extreme under the original display mapping. Observational false event/active fields are explicitly marked controller_evaluated=false and are not controller-state evidence.
