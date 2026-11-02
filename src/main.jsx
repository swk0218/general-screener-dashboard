import React from "react";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import { App } from "./App.jsx";
import "./styles.css";
import "./styles/terminal-v2.css";
import "./styles/refinement.css";
import { demoRequested } from "./features/briefing/demo-gate.js";

if (import.meta.env.DEV && demoRequested({ dev: import.meta.env.DEV,
  enabled: import.meta.env.VITE_GPT_SHADOW_DEMO, search: window.location.search })) {
  const root = createRoot(document.getElementById("root"));
  import("./features/briefing/BriefingDemo.jsx").then(({ BriefingDemo }) => {
    root.render(<React.StrictMode><BriefingDemo /></React.StrictMode>);
  }).catch(() => root.render(<p role="alert">검토 화면을 열지 못했습니다. 새로고침해 주세요.</p>));
} else {
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
