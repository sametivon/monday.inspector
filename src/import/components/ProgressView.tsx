import type { ImportProgress } from "../../utils/types";

interface Props {
  progress: ImportProgress | null;
  running: boolean;
  error: string | null;
}

/**
 * Step-4 view. Live progress bar + counters + a per-row error list at the
 * bottom so the user knows exactly what failed and can fix the source data
 * for a re-run.
 */
export function ProgressView({ progress, running, error }: Props) {
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

      {failed.length > 0 && !running && (
        <details style={{ marginTop: 12 }} open>
          <summary
            style={{
              cursor: "pointer",
              padding: "8px 10px",
              background: "hsl(0 84% 97%)",
              border: "1px solid hsl(0 84% 88%)",
              borderRadius: "var(--qi-radius-sm)",
              color: "hsl(0 70% 35%)",
              fontSize: 12.5,
              fontWeight: 600,
              userSelect: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span>
              {failed.length} row{failed.length !== 1 ? "s" : ""} failed — click to expand
            </span>
            <button
              type="button"
              className="qi-btn qi-btn-sm"
              onClick={(e) => {
                // Don't toggle the <details> when clicking copy.
                e.preventDefault();
                e.stopPropagation();
                copyFailuresToClipboard(failed);
              }}
              title="Copy a summary of every failure (row, item, error) to the clipboard"
              style={{ marginLeft: "auto" }}
            >
              📋 Copy all errors
            </button>
          </summary>
          <div className="imp-preview-wrap" style={{ marginTop: 6 }}>
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
                        {r.error}
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
        </details>
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
