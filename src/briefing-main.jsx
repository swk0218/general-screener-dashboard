import React from "react";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import { App } from "./App.jsx";
import "./styles.css";
import "./styles/terminal-v2.css";
import "./styles/refinement.css";
import { demoRequested } from "./features/briefing/demo-gate.js";
const demo = import.meta.env.DEV && demoRequested({
  dev: import.meta.env.DEV,
  enabled: import.meta.env.VITE_GPT_SHADOW_DEMO,
  search: window.location.search
});
const feed = window.location.hash === "#/briefing" && (demo || import.meta.env.VITE_GPT_BRIEFING_ENABLED === "true");
const root = createRoot(document.getElementById("root"));
function render(View) { root.render(<React.StrictMode><View /></React.StrictMode>); }
function unavailable() { root.render(<p role="alert">검토 화면을 열지 못했습니다. 새로고침해 주세요.</p>); }
if (feed) {
  import("./features/briefing/BriefingFeed.jsx").then(module=>render(module.BriefingFeed)).catch(unavailable);
} else if (demo) {
  import("./features/briefing/BriefingDemo.jsx").then(module=>render(module.BriefingDemo)).catch(unavailable);
} else {
  render(App);
}
