import React from "react";
import { createRoot } from "react-dom/client";
import { QueryPage } from "./QueryPage";
import "../globals.css";
import "./styles/query.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <QueryPage />
    </React.StrictMode>,
  );
}
