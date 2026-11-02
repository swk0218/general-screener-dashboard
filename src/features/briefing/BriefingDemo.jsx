import { useState } from "react";
import ready from "./fixtures/ready.json";
import stale from "./fixtures/stale.json";
import quarantined from "./fixtures/quarantined.json";
import missing from "./fixtures/missing.json";
import noChange from "./fixtures/no_change.json";
import failure from "./fixtures/failure.json";
import { BriefingView } from "./BriefingView.jsx";
const scenarios = Object.freeze({
  ready,
  stale,
  quarantined,
  missing,
  no_change: noChange,
  failure
});
const scenarioLabels = Object.freeze({
  ready: "변화가 있는 날",
  stale: "시장 자료가 오래된 날",
  quarantined: "시장 자료 확인 보류",
  missing: "시장 자료가 없는 날",
  no_change: "주요 변화가 없는 날",
  failure: "브리핑을 만들지 못한 날"
});
export function BriefingDemo() {
  const [scenario, setScenario] = useState("ready");
  const toolbar = <label className="brief-scenario">상황별 미리보기<select value={scenario} onChange={event => setScenario(event.target.value)}>{Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
  return <BriefingView data={scenarios[scenario]} toolbar={toolbar} />;
}
