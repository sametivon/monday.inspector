import { useState, useMemo } from "react";
import { executeRawQuery } from "../services/inspectorApi";
import { copyToClipboard, downloadFile } from "../services/export";

interface QueryTabProps {
  token: string;
  boardId: string | null;
}

interface QueryTemplate {
  name: string;
  query: string;
  variables: string;
}

function getTemplates(boardId: string | null): QueryTemplate[] {
  const bid = boardId ?? "BOARD_ID";
  return [
    {
      name: "All items with columns",
      query: `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    name
    items_page(limit: 100) {
      cursor
      items {
        id
        name
        group { id title }
        column_values { id text value type }
      }
    }
  }
  complexity { before after query }
}`,
      variables: `{ "boardId": "${bid}" }`,
    },
    {
      name: "Items by group",
      query: `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    groups {
      id
      title
      items_page(limit: 100) {
        items { id name }
      }
    }
  }
  complexity { before after query }
}`,
      variables: `{ "boardId": "${bid}" }`,
    },
    {
      name: "Subitems for item",
      query: `query ($itemId: [ID!]!) {
  items(ids: $itemId) {
    id
    name
    subitems {
      id
      name
      column_values { id text value type }
    }
  }
  complexity { before after query }
}`,
      variables: `{ "itemId": "ITEM_ID" }`,
    },
    {
      name: "Board structure",
      query: `query ($boardId: [ID!]!) {
  boards(ids: $boardId) {
    name
    description
    columns { id title type settings_str }
    groups { id title }
    owner { id name }
  }
  complexity { before after query }
}`,
      variables: `{ "boardId": "${bid}" }`,
    },
    {
      name: "Workspace users",
      query: `query {
  users(limit: 100) {
    id
    name
    email
    enabled
    is_admin
  }
  complexity { before after query }
}`,
      variables: "{}",
    },
    {
      name: "Account info",
      query: `query {
  me {
    id
    name
    email
    account {
      id
      name
      plan { max_users period tier version }
    }
  }
  complexity { before after query }
}`,
      variables: "{}",
    },
  ];
}

/**
 * Walk the result tree depth-first to find the first array of objects.
 * Returns { path, rows, columns } or null.
 */
function flattenQueryResult(data: unknown): {
  path: string;
  rows: Record<string, unknown>[];
  columns: string[];
} | null {
  function walk(obj: unknown, path: string): ReturnType<typeof flattenQueryResult> {
    if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      const rows = obj as Record<string, unknown>[];
      const colSet = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row)) {
          if (typeof row[key] !== "object" || row[key] === null) {
            colSet.add(key);
          }
        }
      }
      if (colSet.size > 0) {
        return { path, rows, columns: [...colSet] };
      }
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (key === "complexity") continue; // skip complexity node
        const result = walk(val, path ? `${path}.${key}` : key);
        if (result) return result;
      }
    }
    return null;
  }
  return walk(data, "");
}

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function QueryTab({ token, boardId }: QueryTabProps) {
  const templates = useMemo(() => getTemplates(boardId), [boardId]);
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [query, setQuery] = useState(templates[0].query);
  const [variables, setVariables] = useState(templates[0].variables);
  const [result, setResult] = useState<unknown>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [complexity, setComplexity] = useState<{ before: number; after: number; query: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleTemplateChange = (idx: number) => {
    setSelectedTemplate(idx);
    setQuery(templates[idx].query);
    setVariables(templates[idx].variables);
    setResult(null);
    setErrors(null);
    setComplexity(null);
  };

  const handleRun = async () => {
    if (!token || !query.trim()) return;
    setRunning(true);
    setErrors(null);
    setResult(null);
    setComplexity(null);
    try {
      const vars = variables.trim() ? JSON.parse(variables) : undefined;
      const res = await executeRawQuery(token, query, vars);
      setResult(res.data);
      setComplexity(res.complexity ?? null);
      if (res.errors?.length) {
        setErrors(res.errors.map((e) => e.message));
      }
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setRunning(false);
    }
  };

  const flattened = useMemo(
    () => (result ? flattenQueryResult(result) : null),
    [result],
  );

  // Sort
  const sortedRows = useMemo(() => {
    if (!flattened || !sortCol) return flattened?.rows ?? [];
    const rows = [...flattened.rows];
    rows.sort((a, b) => {
      const va = cellToString(a[sortCol]);
      const vb = cellToString(b[sortCol]);
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [flattened, sortCol, sortAsc]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  // Export helpers
  const exportCSV = () => {
    if (!flattened) return;
    const escape = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    const header = flattened.columns.map(escape).join(",");
    const rows = sortedRows.map((r) =>
      flattened.columns.map((c) => escape(cellToString(r[c]))).join(","),
    );
    return [header, ...rows].join("\n");
  };

  const exportJSON = () => JSON.stringify(result, null, 2);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: 11,
    padding: "6px 8px",
    border: "1px solid hsl(var(--input))",
    borderRadius: 6,
    background: "hsl(240 10% 3.9%)",
    color: "hsl(142 76% 73%)",
    resize: "vertical",
    outline: "none",
    lineHeight: 1.5,
    tabSize: 2,
  };

  const openFullPage = () => {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("query", query);
      if (variables.trim() && variables.trim() !== "{}") params.set("variables", variables);
      const url =
        typeof chrome !== "undefined" && chrome.runtime?.getURL
          ? chrome.runtime.getURL("src/query/index.html")
          : "/src/query/index.html";
      const separator = params.toString() ? "?" : "";
      window.open(`${url}${separator}${params.toString()}`, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      {/* Template selector + open in full page */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          className="editor-select"
          style={{ flex: 1 }}
          value={selectedTemplate}
          onChange={(e) => handleTemplateChange(Number(e.target.value))}
        >
          {templates.map((t, i) => (
            <option key={i} value={i}>{t.name}</option>
          ))}
        </select>
        <button
          className="btn-primary"
          style={{ padding: "5px 9px", fontSize: 10, whiteSpace: "nowrap" }}
          onClick={openFullPage}
          title="Open the Query Inspector in a full page (more templates, saved queries, big result table)"
        >
          ↗ Full Inspector
        </button>
      </div>

      {/* Query editor */}
      <textarea
        style={{ ...inputStyle, minHeight: 120 }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleRun();
          }
          // Tab indentation
          if (e.key === "Tab") {
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            setQuery(query.substring(0, start) + "  " + query.substring(end));
            setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; }, 0);
          }
        }}
        spellCheck={false}
      />

      {/* Variables */}
      <textarea
        style={{ ...inputStyle, minHeight: 28, maxHeight: 60 }}
        value={variables}
        onChange={(e) => setVariables(e.target.value)}
        placeholder='Variables: { "boardId": "123" }'
        spellCheck={false}
      />

      {/* Run bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="btn-primary"
          style={{ padding: "6px 16px" }}
          onClick={handleRun}
          disabled={running || !token}
        >
          {running ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              Running...
            </span>
          ) : (
            "▶ Run Query"
          )}
        </button>
        <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>
          Ctrl+Enter to run
        </span>
        {complexity && (
          <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "monospace", color: "hsl(var(--muted-foreground))" }}>
            Cost: {complexity.query.toLocaleString()} pts
          </span>
        )}
      </div>

      {/* Errors */}
      {errors && (
        <div style={{
          fontSize: 11, color: "hsl(var(--destructive))",
          background: "hsl(var(--destructive) / 0.08)",
          padding: "6px 8px", borderRadius: 6,
          border: "1px solid hsl(var(--destructive) / 0.2)",
        }}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      {/* Results */}
      {result !== null && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Results toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 0", borderBottom: "1px solid hsl(var(--border))", marginBottom: 6,
          }}>
            <div style={{ display: "flex", gap: 2 }}>
              <button
                className={`btn-ghost ${viewMode === "table" ? "active" : ""}`}
                style={{
                  fontSize: 10, padding: "2px 6px",
                  background: viewMode === "table" ? "hsl(var(--primary) / 0.1)" : undefined,
                  color: viewMode === "table" ? "hsl(var(--primary))" : undefined,
                }}
                onClick={() => setViewMode("table")}
              >
                Table
              </button>
              <button
                className={`btn-ghost ${viewMode === "json" ? "active" : ""}`}
                style={{
                  fontSize: 10, padding: "2px 6px",
                  background: viewMode === "json" ? "hsl(var(--primary) / 0.1)" : undefined,
                  color: viewMode === "json" ? "hsl(var(--primary))" : undefined,
                }}
                onClick={() => setViewMode("json")}
              >
                JSON
              </button>
            </div>

            {flattened && (
              <span className="type-badge" style={{ fontSize: 9 }}>
                {flattened.rows.length} rows
              </span>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              {flattened && (
                <>
                  <button className="btn-ghost" style={{ fontSize: 9, padding: "2px 6px" }}
                    onClick={() => { const csv = exportCSV(); if (csv) copyToClipboard(csv); }}>
                    Copy CSV
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 9, padding: "2px 6px" }}
                    onClick={() => { const csv = exportCSV(); if (csv) downloadFile(csv, "query_result.csv", "text/csv"); }}>
                    ⬇ CSV
                  </button>
                </>
              )}
              <button className="btn-ghost" style={{ fontSize: 9, padding: "2px 6px" }}
                onClick={() => copyToClipboard(exportJSON())}>
                Copy JSON
              </button>
              <button className="btn-ghost" style={{ fontSize: 9, padding: "2px 6px" }}
                onClick={() => downloadFile(exportJSON(), "query_result.json", "application/json")}>
                ⬇ JSON
              </button>
            </div>
          </div>

          {/* Table view */}
          {viewMode === "table" && flattened ? (
            <div style={{ flex: 1, overflow: "auto" }}>
              <table className="schema-table" style={{ fontSize: 10 }}>
                <thead>
                  <tr>
                    {flattened.columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                      >
                        {col}
                        {sortCol === col && (
                          <span style={{ marginLeft: 3 }}>{sortAsc ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr key={i}>
                      {flattened.columns.map((col) => (
                        <td key={col} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cellToString(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : viewMode === "table" && !flattened ? (
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", padding: 8 }}>
              No tabular data found. Switch to JSON view.
            </div>
          ) : null}

          {/* JSON view */}
          {viewMode === "json" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <pre style={{
                fontSize: 10,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                background: "hsl(240 10% 3.9%)",
                color: "hsl(0 0% 83%)",
                padding: 10,
                borderRadius: 6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                lineHeight: 1.5,
                maxHeight: 400,
                overflow: "auto",
              }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Empty state with guide */}
      {result === null && !running && !errors && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{
            background: "hsl(var(--muted) / 0.5)", borderRadius: 8,
            padding: "12px 14px", fontSize: 11, lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: "hsl(var(--foreground))" }}>
              Quick Guide
            </div>
            <div style={{ color: "hsl(var(--muted-foreground))", display: "flex", flexDirection: "column", gap: 6 }}>
              <div>
                <strong style={{ color: "hsl(var(--foreground))" }}>1. Pick a template</strong> from the dropdown above, or write your own GraphQL query.
              </div>
              <div>
                <strong style={{ color: "hsl(var(--foreground))" }}>2. Edit variables</strong> — your current board ID is auto-filled. Replace <code style={{ background: "hsl(var(--muted))", padding: "1px 4px", borderRadius: 3, fontSize: 10 }}>ITEM_ID</code> with a real ID if needed.
              </div>
              <div>
                <strong style={{ color: "hsl(var(--foreground))" }}>3. Run</strong> with the button or <kbd style={{ background: "hsl(var(--muted))", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontFamily: "monospace" }}>Ctrl+Enter</kbd>
              </div>
              <div>
                <strong style={{ color: "hsl(var(--foreground))" }}>4. View results</strong> as a table or raw JSON. Export with one click.
              </div>
            </div>
            <div style={{
              marginTop: 8, paddingTop: 8,
              borderTop: "1px solid hsl(var(--border))",
              fontSize: 10, color: "hsl(var(--muted-foreground))",
            }}>
              <strong>Tip:</strong> monday.com uses GraphQL. Queries read data ({'"query"'}), mutations change data ({'"mutation"'}). The complexity cost shows how much API budget each query uses (10M pts/min).
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
