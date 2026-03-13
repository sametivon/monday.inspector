import React from "react";
import type { ImportProgress as ImportProgressType } from "../utils/types";
import { LeadCaptureCard } from "./LeadCaptureCard";
import { ReviewPrompt } from "./ReviewPrompt";
import { ErrorHelpCTA } from "./ErrorHelpCTA";

interface ImportProgressProps {
  progress: ImportProgressType;
  isRunning: boolean;
}

export const ImportProgress: React.FC<ImportProgressProps> = ({
  progress,
  isRunning,
}) => {
  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  // Split by kind for two-phase display
  const parentRows = progress.rows.filter((r) => r.kind === "parent");
  const subitemRows = progress.rows.filter((r) => r.kind === "subitem");
  const hasBothPhases = parentRows.length > 0 && subitemRows.length > 0;

  const failedRows = progress.rows.filter((r) => r.status === "error");

  const parentsDone = parentRows.filter((r) => r.status === "success" || r.status === "error").length;
  const subitemsDone = subitemRows.filter((r) => r.status === "success" || r.status === "error").length;
  const parentsSucceeded = parentRows.filter((r) => r.status === "success").length;
  const subitemsSucceeded = subitemRows.filter((r) => r.status === "success").length;

  return (
    <div className="import-progress">
      {/* ── Overall progress bar ─────────────────────────── */}
      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-text">
        {isRunning ? "Importing…" : "Import complete"} — {progress.completed}/
        {progress.total} ({pct}%)
      </p>

      {/* ── Two-phase breakdown ──────────────────────────── */}
      {hasBothPhases && (
        <div className="phase-breakdown">
          <div className="phase-row">
            <span className="phase-label">📋 Phase 1 — Parent items:</span>
            <span className="phase-count">
              {parentsSucceeded}/{parentRows.length} created
              {parentsDone < parentRows.length && isRunning && " ⏳"}
              {parentsDone === parentRows.length && " ✓"}
            </span>
          </div>
          <div className="phase-row">
            <span className="phase-label">📎 Phase 2 — Subitems:</span>
            <span className="phase-count">
              {subitemsSucceeded}/{subitemRows.length} created
              {subitemsDone < subitemRows.length && parentsDone < parentRows.length && " (waiting)"}
              {subitemsDone < subitemRows.length && parentsDone === parentRows.length && isRunning && " ⏳"}
              {subitemsDone === subitemRows.length && " ✓"}
            </span>
          </div>
        </div>
      )}

      {/* ── Summary chips ────────────────────────────────── */}
      <div className="summary-chips">
        <span className="chip success">✅ {progress.succeeded} succeeded</span>
        <span className="chip error">❌ {progress.failed} failed</span>
      </div>

      {/* ── Error details ────────────────────────────────── */}
      {failedRows.length > 0 && (
        <details className="error-details" open={!isRunning}>
          <summary>Failed rows ({failedRows.length})</summary>
          <table className="error-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {failedRows.map((r) => (
                <tr key={r.rowIndex}>
                  <td>
                    <span className={`kind-badge ${r.kind}`}>
                      {r.kind === "parent" ? "📋 Parent" : "📎 Subitem"}
                    </span>
                  </td>
                  <td>{r.itemName || r.subitemName || "—"}</td>
                  <td className="error-text">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {failedRows.length > 0 && !isRunning && <ErrorHelpCTA />}

      {!isRunning && progress.succeeded > 0 && (
        <>
          <LeadCaptureCard />
          <ReviewPrompt />
        </>
      )}
    </div>
  );
};
