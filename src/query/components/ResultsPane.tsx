import { useMemo, useState } from "react";
import type { RawQueryResult } from "../../services/mondayApi";

type ViewMode = "table" | "json";

interface Props {
  running: boolean;
  error: string | null;
  result: RawQueryResult | null;
  currentQuery: string;
}

/**
 * Right pane: result presentation.
 *
 * Tries to surface a meaningful "table" view by walking the GraphQL response
 * for the deepest array of objects (typically items / boards / users) and
 * rendering its rows. Falls back to a JSON tree if the shape is unusual.
 */
export function ResultsPane({ running, error, result, currentQuery }: Props) {
  const [view, setView] = useState<ViewMode>("table");

  const { rows, columnKeys } = useMemo(() => extractTable(result?.data), [result]);

  // ── Empty / running / quick-start states ────────────────────────────
  if (running) {
    return (
      <div className="qi-result-body">
        <div className="qi-empty">
          <div className="qi-empty-icon">⏳</div>
          <div className="qi-empty-title">Running…</div>
          <div className="qi-empty-desc">
            Talking to monday.com. Big queries can take a few seconds.
          </div>
        </div>
      </div>
    );
  }

  if (!result && !error) {
    return (
      <div className="qi-result-body">
        <Quickstart />
      </div>
    );
  }

  return (
    <div className="qi-results-wrap">
      <div className="qi-result-toolbar">
        <button
          className={`qi-result-tab ${view === "table" ? "active" : ""}`}
          onClick={() => setView("table")}
          disabled={rows.length === 0}
          title={rows.length === 0 ? "No table-shaped data found" : ""}
        >
          Table
          {rows.length > 0 && (
            <span style={{ marginLeft: 6, opacity: 0.65 }}>
              {rows.length.toLocaleString()}
            </span>
          )}
        </button>
        <button
          className={`qi-result-tab ${view === "json" ? "active" : ""}`}
          onClick={() => setView("json")}
        >
          JSON
        </button>
        <div style={{ flex: 1 }} />
        <button
          className="qi-btn qi-btn-sm qi-btn-ghost"
          onClick={() => {
            if (!result) return;
            const blob = new Blob([JSON.stringify(result, null, 2)], {
              type: "application/json",
            });
            triggerDownload(blob, "query-result.json");
          }}
        >
          Download JSON
        </button>
        {rows.length > 0 && (
          <button
            className="qi-btn qi-btn-sm qi-btn-ghost"
            onClick={() => triggerDownload(rowsToCsvBlob(columnKeys, rows), "query-result.csv")}
          >
            Download CSV
          </button>
        )}
      </div>

      <div className="qi-result-body">
        {error && <ErrorBlock error={error} query={currentQuery} />}

        {view === "table" && rows.length > 0 && (
          <div className="qi-table-wrap">
            <table className="qi-table">
              <thead>
                <tr>
                  {columnKeys.map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {columnKeys.map((key) => (
                      <td key={key}>{renderCell(row[key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "table" && rows.length === 0 && !error && (
          <div className="qi-empty">
            <div className="qi-empty-icon">📦</div>
            <div className="qi-empty-title">No table-shaped data</div>
            <div className="qi-empty-desc">
              The response didn&apos;t contain a list of objects we could turn
              into rows. Try the JSON view to inspect it directly.
            </div>
          </div>
        )}

        {view === "json" && result && (
          <pre className="qi-json">
            {JSON.stringify(result.data ?? null, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ErrorBlock({ error, query: _query }: { error: string; query: string }) {
  return (
    <div
      className="qi-json"
      style={{
        background: "hsl(0 84% 97%)",
        borderColor: "hsl(0 84% 88%)",
        color: "hsl(0 70% 35%)",
        marginBottom: 14,
      }}
    >
      {error}
    </div>
  );
}

function Quickstart() {
  return (
    <div className="qi-empty">
      <div className="qi-empty-icon">⚡</div>
      <div className="qi-empty-title">Run your first query</div>
      <div className="qi-empty-desc">
        Pick a template on the left, or write your own query in the editor.
        Press <strong>⌘ / Ctrl + Enter</strong> to run.
      </div>
      <div className="qi-quickstart-list">
        <div className="qi-quickstart-item">
          <div className="qi-quickstart-num">1</div>
          <div className="qi-quickstart-text">
            Pick <strong>List all my boards</strong> on the left to verify your
            token works.
          </div>
        </div>
        <div className="qi-quickstart-item">
          <div className="qi-quickstart-num">2</div>
          <div className="qi-quickstart-text">
            Copy a board ID from the result, then open{" "}
            <strong>Get a board&apos;s full schema</strong>.
          </div>
        </div>
        <div className="qi-quickstart-item">
          <div className="qi-quickstart-num">3</div>
          <div className="qi-quickstart-text">
            Save useful queries with the <strong>💾 Save</strong> button — they
            persist locally and show up in the Saved tab.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Walk a GraphQL response and find the deepest `{ ... }[]` we can flatten
 * into a table. Returns rows + a stable union of keys.
 */
function extractTable(data: unknown): {
  rows: Record<string, unknown>[];
  columnKeys: string[];
} {
  const arr = findDeepestArrayOfObjects(data);
  if (!arr) return { rows: [], columnKeys: [] };

  const keys = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const item of arr) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const r = item as Record<string, unknown>;
      rows.push(r);
      Object.keys(r).forEach((k) => keys.add(k));
    }
  }
  // Stable ordering: id, name first if present, then alphabetical
  const all = Array.from(keys);
  const head: string[] = [];
  for (const pri of ["id", "name", "title"]) {
    if (all.includes(pri)) {
      head.push(pri);
      all.splice(all.indexOf(pri), 1);
    }
  }
  return { rows, columnKeys: [...head, ...all.sort()] };
}

function findDeepestArrayOfObjects(node: unknown): unknown[] | null {
  let best: unknown[] | null = null;
  const walk = (val: unknown) => {
    if (Array.isArray(val)) {
      if (val.length > 0 && val.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
        if (!best || val.length > best.length) best = val;
      }
      val.forEach(walk);
      return;
    }
    if (val && typeof val === "object") {
      Object.values(val as Record<string, unknown>).forEach(walk);
    }
  };
  walk(node);
  return best;
}

function renderCell(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function rowsToCsvBlob(keys: string[], rows: Record<string, unknown>[]): Blob {
  const escape = (v: unknown) => {
    const s = renderCell(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.join(",")];
  for (const r of rows) lines.push(keys.map((k) => escape(r[k])).join(","));
  return new Blob([lines.join("\n")], { type: "text/csv" });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
