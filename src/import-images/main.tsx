import React from "react";
import { createRoot } from "react-dom/client";
import { ImageImportPage } from "./ImageImportPage";
import "../globals.css";
import "../query/styles/query.css"; // shared SaaS design tokens (qi-*)
import "../import/styles/import.css"; // shared importer shell + cards
import "./styles/image-import.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ImageImportPage />
    </React.StrictMode>,
  );
}
