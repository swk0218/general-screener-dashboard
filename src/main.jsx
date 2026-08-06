import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/500.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/ibm-plex-sans-kr/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { App } from "./App.jsx";
import "./styles.css";
import "./styles/terminal-v2.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
