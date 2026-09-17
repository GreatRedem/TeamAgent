import React from "react";
import ReactDOM from "react-dom/client";
import { createI18n } from "./i18n/index.js";
import { AppRoot } from "./app/root.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

async function boot(): Promise<void> {
  const i18n = await createI18n();
  root!.classList.add("booted");
  ReactDOM.createRoot(root!).render(
    <React.StrictMode>
      <AppRoot i18n={i18n} />
    </React.StrictMode>,
  );
}

void boot();
