import { useState, useEffect } from "react";

export interface ApiLogEntry {
  id: string;
  timestamp: number;
  operation: string;
  variables?: Record<string, unknown>;
  response?: unknown;
  error?: string;
  durationMs: number;
  status: "success" | "error" | "pending";
}

// Global log store (singleton, shared across inspector lifecycle)
const logEntries: ApiLogEntry[] = [];
const listeners = new Set<() => void>();

export function addLogEntry(entry: ApiLogEntry) {
  const existingIdx = logEntries.findIndex((e) => e.id === entry.id);
  if (existingIdx >= 0) {
    logEntries[existingIdx] = entry; // update in-place
  } else {
    logEntries.unshift(entry); // newest first
    if (logEntries.length > 200) logEntries.pop();
  }
  listeners.forEach((fn) => fn());
}

export function clearLogs() {
  logEntries.length = 0;
  listeners.forEach((fn) => fn());
}

function useLogEntries(): ApiLogEntry[] {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return [...logEntries];
}

export function LogsTab() {
  const entries = useLogEntries();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "error">("all");

  const toggleEntry = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = filter === "all" ? entries : entries.filter((e) => e.status === "error");

  const copyEntry = (entry: ApiLogEntry) => {
    navigator.clipboard.writeText(
      JSON.stringify({ operation: entry.operation, variables: entry.variables, error: entry.error, response: entry.response }, null, 2),
    );
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
        <select
          className="editor-select"
          style={{ width: "auto", fontSize: 11 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "error")}
        >
          <option value="all">All ({entries.length})</option>
          <option value="error">Errors ({entries.filter((e) => e.status === "error").length})</option>
        </select>
        <button className="btn-ghost" style={{ fontSize: 11, marginLeft: "auto" }} onClick={clearLogs}>
          Clear
        </button>
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <span>No API calls logged yet</span>
          <span style={{ fontSize: 11 }}>API calls will appear here as you interact with the inspector</span>
        </div>
      ) : (
        filtered.map((entry) => {
          const isExpanded = expandedIds.has(entry.id);
          const time = new Date(entry.timestamp).toLocaleTimeString();

          return (
            <div key={entry.id} className={`log-entry ${entry.status}`} onClick={() => toggleEntry(entry.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{entry.operation}</span>
                <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                  {entry.durationMs}ms
                </span>
                <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{time}</span>
                <button
                  className="btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyEntry(entry);
                  }}
                  title="Copy"
                  style={{ fontSize: 10 }}
                >
                  📋
                </button>
              </div>

              {entry.error && (
                <div style={{ fontSize: 11, color: "hsl(var(--destructive))", marginTop: 4 }}>
                  {entry.error}
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 8 }}>
                  {entry.variables && (
                    <details open>
                      <summary style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Variables</summary>
                      <pre
                        style={{
                          fontSize: 10,
                          background: "hsl(var(--muted))",
                          padding: 6,
                          borderRadius: 4,
                          overflow: "auto",
                          maxHeight: 150,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {JSON.stringify(entry.variables, null, 2)}
                      </pre>
                    </details>
                  )}
                  {entry.response !== undefined && (
                    <details>
                      <summary style={{ fontSize: 10, fontWeight: 600, marginBottom: 2, marginTop: 4 }}>Response</summary>
                      <pre
                        style={{
                          fontSize: 10,
                          background: "hsl(var(--muted))",
                          padding: 6,
                          borderRadius: 4,
                          overflow: "auto",
                          maxHeight: 150,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {JSON.stringify(entry.response, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
