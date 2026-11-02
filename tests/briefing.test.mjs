import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { demoRequested } from "../src/features/briefing/demo-gate.js";
import { briefingClocks, formatBriefingTime, engineState, insightView } from "../src/features/briefing/briefing-model.js";

const fixture = JSON.parse(await readFile(new URL("../src/features/briefing/fixtures/ready.json", import.meta.url), "utf8"));
test("demo needs both explicit development config and the preview query", () => {
  const input = { dev: true, enabled: "true", search: "?demo=briefing" };
  assert.equal(demoRequested(input), true);
  for (const altered of [{ dev: false }, { enabled: undefined }, { search: "" }]) {
    assert.equal(demoRequested({ ...input, ...altered }), false);
  }
});
test("source freshness is independent of the briefing generation clock", () => {
  const radar = fixture.engines.Radar.current;
  assert.equal(engineState(radar, fixture.session), "기준일 일치");
  assert.equal(engineState({ ...radar, session: "2026-10-29" }, fixture.session), "이전 자료");
  assert.equal(engineState({ ...radar, status: "quarantined" }, fixture.session), "확인 보류");
});
test("prose renders code computed differences, never reranks the fixture", () => {
  const original = JSON.stringify(fixture);
  const view = insightView(fixture.insights[0], fixture.computed.facts);
  assert.match(view.fact, /\+1개/);
  assert.match(view.fact, /새 편입 2개·제외 1개/);
  assert.equal(JSON.stringify(fixture), original);
  assert.equal(fixture.score_effect, 0);
  assert.ok(fixture.demo);
});
test("generation clocks come from each result and preserve explicit timezone", () => {
  const data = structuredClone(fixture);
  data.generated_at = "2026-11-01T23:30:00Z";
  assert.equal(briefingClocks(data).generated, "2026-11-01 23:30 UTC");
  assert.equal(briefingClocks(data, "Asia/Seoul").generated, "2026-11-02 08:30 Asia/Seoul");
  assert.equal(briefingClocks(data).engines[0].asOf, fixture.engines.Radar.current.as_of);
  assert.equal(formatBriefingTime("invalid"), null);
  assert.equal(formatBriefingTime("2026-11-02T12:00:00"), null);
});
test("failed or missing result never borrows normal scenario dates", () => {
  for(const data of [{ status: "unavailable" }, { status: "disabled" }, { status: "unavailable", generated_at: fixture.generated_at }]) {
    const clocks = briefingClocks(data);
    assert.equal(clocks.generated, null);
    assert.equal(clocks.session, null);
    assert.ok(clocks.engines.every(clock => clock.asOf === null && clock.label === "자료 확인 불가"));
  }
});
test("explicit prior result is dated as previous and never a newly generated briefing", () => {
  const clocks = briefingClocks({status:"unavailable",previous_is_current:false,previous_briefing:fixture});
  assert.equal(clocks.generated,null);
  assert.equal(clocks.previousGenerated,formatBriefingTime(fixture.generated_at));
  assert.ok(clocks.engines.every(clock=>clock.label==='이전 결과'));
});
