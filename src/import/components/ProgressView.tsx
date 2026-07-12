import type { ImportProgress } from "../../utils/types";
import type { ImportErrorAnalysis } from "../importErrorAnalysis";

interface Props {
  progress: ImportProgress | null;
  running: boolean;
  error: string | null;
  /** Populated after a run with failures — drives the recovery banner. */
  errorAnalysis?: ImportErrorAnalysis | null;
  /** Drop the given monday column ids from the mapping and re-run. */
  onSkipColumnsAndRetry?: (columnIds: string[]) => void;
  /** Scroll the user back to the column-mapping step. */
  onJumpToMapping?: () => void;
}

/**
 * Step-4 view. Live progress bar + counters + a per-row error list at the
 * bottom so the user knows exactly what failed and can fix the source data
 * for a re-run.
 */
export function ProgressView({
  progress,
  running,
  error,
  errorAnalysis,
  onSkipColumnsAndRetry,
  onJumpToMapping,
}: Props) {
  if (!progress) {
    return (
      <div style={{ color: "hsl(var(--qi-muted-foreground))", fontSize: 13 }}>
        Waiting to start…
      </div>
    );
  }

  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  const failed = progress.rows.filter((r) => r.status === "error");

  return (
    <div className="imp-progress">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div className="imp-progress-stats">
          <div className="imp-progress-stat" style={{ color: "hsl(142 71% 32%)" }}>
            <span className="num">{progress.succeeded.toLocaleString()}</span>
            succeeded
          </div>
          <div className="imp-progress-stat" style={{ color: "hsl(0 70% 45%)" }}>
            <span className="num">{progress.failed.toLocaleString()}</span>
            failed
          </div>
          <div
            className="imp-progress-stat"
            style={{ color: "hsl(var(--qi-muted-foreground))" }}
          >
            <span className="num">{progress.total.toLocaleString()}</span>
            total
          </div>
        </div>
        <span className="qi-meta-pill">{pct}%</span>
      </div>
      <div className="imp-progress-bar">
        <div className="imp-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            background: "hsl(0 84% 97%)",
            border: "1px solid hsl(0 84% 88%)",
            borderRadius: "var(--qi-radius-sm)",
            color: "hsl(0 70% 35%)",
            fontSize: 12.5,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Smart recovery banner — names the likely-culprit columns and
          offers a one-click "skip & re-run". Only when the run is done. */}
      {failed.length > 0 && !running && (
        <div
          style={{
            marginTop: 12,
            padding: "14px 16px",
            background: "hsl(38 92% 96%)",
            border: "1px solid hsl(38 92% 78%)",
            borderRadius: "var(--qi-radius)",
            fontSize: 13,
            color: "hsl(28 80% 26%)",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            ⚠ {failed.length} of {progress.total} row
            {progress.total !== 1 ? "s" : ""} failed to import
          </div>

          {errorAnalysis && errorAnalysis.suspectColumns.length > 0 ? (
            <>
              <p style={{ margin: "0 0 10px" }}>
                These column{errorAnalysis.suspectColumns.length !== 1 ? "s" : ""}{" "}
                look like the cause —{" "}
                <strong>
                  {errorAnalysis.suspectColumns.map((c) => c.title).join(", ")}
                </strong>
                . monday.com rejected their values. You can drop{" "}
                {errorAnalysis.suspectColumns.length !== 1 ? "them" : "it"} and
                import everything else.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="qi-btn qi-btn-primary qi-btn-sm"
                  onClick={() =>
                    onSkipColumnsAndRetry?.(
                      errorAnalysis.suspectColumns.map((c) => c.id),
                    )
                  }
                >
                  Skip {errorAnalysis.suspectColumns.length} column
                  {errorAnalysis.suspectColumns.length !== 1 ? "s" : ""} &amp; re-run
                </button>
                {onJumpToMapping && (
                  <button className="qi-btn qi-btn-sm" onClick={onJumpToMapping}>
                    ↑ Back to column mapping
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 10px" }}>
                If the same error repeats across rows, a single column&apos;s
                values are probably being rejected by monday.com. You don&apos;t
                have to map every column — go back to step 3, set the problem
                column to <strong>&ldquo;— skip —&rdquo;</strong>, and run the
                import again.
              </p>
              {onJumpToMapping && (
                <button className="qi-btn qi-btn-sm" onClick={onJumpToMapping}>
                  ↑ Back to column mapping
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Failure list — always visible (not collapsed inside a <details>)
          so the user sees errors immediately as they accrue, live during
          the run AND after. Earlier collapsed/!running variants hid errors
          when the user needed them most. */}
      {failed.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              padding: "8px 10px",
              background: "hsl(0 84% 97%)",
              border: "1px solid hsl(0 84% 88%)",
              borderTopLeftRadius: "var(--qi-radius-sm)",
              borderTopRightRadius: "var(--qi-radius-sm)",
              borderBottom: "none",
              color: "hsl(0 70% 35%)",
              fontSize: 12.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span>
              {failed.length} row{failed.length !== 1 ? "s" : ""} failed
              {running ? " so far" : ""}
            </span>
            <button
              type="button"
              className="qi-btn qi-btn-sm"
              onClick={() => copyFailuresToClipboard(failed)}
              title="Copy a summary of every failure (row, item, error) to the clipboard"
            >
              📋 Copy all errors
            </button>
          </div>
          <div
            className="imp-preview-wrap"
            style={{
              maxHeight: 480,
              overflow: "auto",
              border: "1px solid hsl(0 84% 88%)",
              borderTop: "none",
              borderBottomLeftRadius: "var(--qi-radius-sm)",
              borderBottomRightRadius: "var(--qi-radius-sm)",
            }}
          >
            <table className="imp-preview-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Row</th>
                  <th>Item / subitem</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {failed.slice(0, 200).map((r) => (
                  <tr key={r.rowIndex}>
                    <td>{r.rowIndex + 1}</td>
                    <td>{r.itemName || r.subitemName || "—"}</td>
                    <td>
                      <code
                        style={{
                          display: "block",
                          fontFamily: "var(--qi-font-mono)",
                          fontSize: 11.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: "hsl(0 70% 35%)",
                        }}
                      >
                        {r.error || "(no error message returned)"}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {failed.length > 200 && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11.5,
                color: "hsl(var(--qi-muted-foreground))",
              }}
            >
              Showing first 200 of {failed.length} errors.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Build a plain-text summary of every failed row and copy it to the
 * clipboard. The user can paste this back into a bug report / chat for
 * diagnosis — much faster than screenshotting each row individually.
 */
function copyFailuresToClipboard(
  failed: ImportProgress["rows"],
): void {
  const lines = [
    `Monday.com Inspector — ${failed.length} import failure${failed.length !== 1 ? "s" : ""}`,
    "",
    "Row\tItem\tError",
    ...failed.map(
      (r) =>
        `${r.rowIndex + 1}\t${r.itemName || r.subitemName || "—"}\t${(r.error ?? "").replace(/\s+/g, " ").trim()}`,
    ),
  ];
  const text = lines.join("\n");
  // navigator.clipboard isn't available in some contexts; fall back to a
  // textarea+execCommand path so we work inside any Chrome extension page.
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* clipboard unavailable — caller already attempted the modern path */
  }
  document.body.removeChild(ta);
}
