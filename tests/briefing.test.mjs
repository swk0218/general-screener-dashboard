import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { demoRequested } from "../src/features/briefing/demo-gate.js";
import { engineState, insightView } from "../src/features/briefing/briefing-model.js";

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
