import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
// Arabic font bundled into the app (works offline)
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./styles/index.css";
import "highlight.js/styles/github-dark.css";
import { initPrefs } from "./lib/prefs";
import App from "./App";

initPrefs();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
