import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import { initializeLanguage } from "./i18n";
void initializeLanguage().then(() =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
