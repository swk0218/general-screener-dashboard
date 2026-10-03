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
