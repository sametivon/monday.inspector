import React from "react";
import { createRoot } from "react-dom/client";
import { ImportPage } from "./ImportPage";
import "../globals.css";
import "../query/styles/query.css"; // shared SaaS design tokens
import "./styles/import.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ImportPage />
    </React.StrictMode>,
  );
}
