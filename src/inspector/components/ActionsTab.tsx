import { useState, useMemo, useEffect } from "react";
import type { MondayColumn, MondayGroup, MondayItem } from "../../utils/types";
import {
  changeColumnValue,
  deleteItem,
  formatColumnValueForApi,
} from "../services/inspectorApi";
import {
  createItem as _createItem,
  createSubitem as _createSubitem,
  getWorkspaceUsers,
} from "../../services/mondayApi";
import { enqueue, onStatsChange, resetStats, retryFailed, type QueueStats } from "../services/requestQueue";

const READ_ONLY_TYPES = new Set([
  "formula", "mirror", "auto_number", "board_relation",
  "subtasks", "dependency", "creation_log", "last_updated",
  "item_id", "button",
]);

/** Extract status/dropdown labels from column settings_str */
function getColumnLabels(col: MondayColumn): string[] {
  if (!col.settings_str) return [];
  try {
    const settings = JSON.parse(col.settings_str);
    if (col.type === "status" && settings.labels) {
      return Object.values(settings.labels)
        .map((v: unknown) => {
          if (typeof v === "string") return v;
          if (v && typeof v === "object" && "label" in (v as Record<string, unknown>))
            return (v as { label: string }).label;
          return null;
        })
        .filter((v): v is string => typeof v === "string" && v !== "");
    }
    if (col.type === "dropdown" && settings.labels) {
      if (Array.isArray(settings.labels)) {
        return settings.labels.map((l: { name: string }) => l.name).filter(Boolean);
      }
    }
  } catch { /* ignore */ }
  return [];
}

interface ActionsTabProps {
  token: string;
  boardId: string | null;
  items: MondayItem[];
  columns: MondayColumn[];
  subitemColumns: MondayColumn[];
  groups: MondayGroup[];
  selectedItemIds: Set<string>;
  dispatch: React.Dispatch<import("../hooks/useInspectorStore").Action>;
  onRefresh: () => void;
}

type SubView = "create" | "bulk" | "delete" | "paste" | "health";

export function ActionsTab({
  token,
  boardId,
  items,
  columns,
  subitemColumns,
  groups,
  selectedItemIds,
  dispatch,
  onRefresh,
}: ActionsTabProps) {
  const [view, setView] = useState<SubView>("create");

  const tabs: { id: SubView; label: string; icon: string }[] = [
    { id: "create", label: "Create", icon: "+" },
    { id: "bulk", label: "Bulk Update", icon: "⟳" },
    { id: "delete", label: "Delete", icon: "🗑" },
    { id: "paste", label: "Paste", icon: "📋" },
    { id: "health", label: "Health", icon: "💊" },
  ];

  return (
    <div>
      {/* Sub-view toggle */}
      <div style={{ display: "flex", gap: 2, marginBottom: 10, borderBottom: "1px solid hsl(var(--border))", paddingBottom: 6 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`btn-ghost ${view === t.id ? "active" : ""}`}
            style={{
              fontSize: 10,
              padding: "4px 8px",
              borderRadius: 6,
              fontWeight: view === t.id ? 600 : 400,
              background: view === t.id ? "hsl(var(--primary) / 0.1)" : "transparent",
              color: view === t.id ? "hsl(var(--primary))" : undefined,
              transition: "all 0.15s",
            }}
            onClick={() => setView(t.id)}
          >
            <span style={{ marginRight: 3 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {view === "create" && (
        <CreateView token={token} boardId={boardId} columns={columns} subitemColumns={subitemColumns} groups={groups} onRefresh={onRefresh} items={items} />
      )}
      {view === "bulk" && (
        <BulkUpdateView token={token} boardId={boardId} items={items} columns={columns} subitemColumns={subitemColumns} selectedItemIds={selectedItemIds} />
      )}
      {view === "delete" && (
        <DeleteView token={token} items={items} selectedItemIds={selectedItemIds} dispatch={dispatch} onRefresh={onRefresh} />
      )}
      {view === "paste" && (
        <PasteView token={token} boardId={boardId} columns={columns} groups={groups} items={items} onRefresh={onRefresh} />
      )}
      {view === "health" && (
        <HealthView items={items} columns={columns} />
      )}
    </div>
  );
}

// ── Smart Column Input ──────────────────────────────────────────────

function SmartColumnInput({
  col,
  value,
  onChange,
  users,
}: {
  col: MondayColumn;
  value: string;
  onChange: (val: string) => void;
  users: { id: number; name: string; email?: string }[];
}) {
  const labels = getColumnLabels(col);
  const isSelect = (col.type === "status" || col.type === "dropdown") && labels.length > 0;

  const inputStyle: React.CSSProperties = {
    width: "100%", fontSize: 11, padding: "5px 8px",
    border: "1px solid hsl(var(--input))", borderRadius: 6,
    background: "hsl(var(--background))", color: "hsl(var(--foreground))",
    outline: "none",
  };

  // Status / Dropdown
  if (isSelect) {
    return (
      <select
        className="editor-select"
        style={{ flex: 1, minWidth: 0 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— select —</option>
        {labels.map((label) => (
          <option key={label} value={label}>{label}</option>
        ))}
      </select>
    );
  }

  // Checkbox
  if (col.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        style={{ accentColor: "hsl(var(--primary))" }}
      />
    );
  }

  // Date
  if (col.type === "date") {
    return (
      <input
        type="date"
        style={{ ...inputStyle, flex: 1 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Timeline — two date pickers
  if (col.type === "timeline") {
    const parts = value.split(" - ");
    const from = parts[0] || "";
    const to = parts[1] || "";
    return (
      <div style={{ display: "flex", gap: 4, flex: 1, alignItems: "center" }}>
        <input
          type="date"
          style={{ ...inputStyle, flex: 1, fontSize: 10, padding: "3px 4px" }}
          value={from}
          onChange={(e) => onChange(`${e.target.value} - ${to}`)}
          title="Start date"
        />
        <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>→</span>
        <input
          type="date"
          style={{ ...inputStyle, flex: 1, fontSize: 10, padding: "3px 4px" }}
          value={to}
          onChange={(e) => onChange(`${from} - ${e.target.value}`)}
          title="End date"
        />
      </div>
    );
  }

  // People — dropdown of workspace users
  if (col.type === "people" || col.type === "person") {
    return (
      <select
        className="editor-select"
        style={{ flex: 1, minWidth: 0 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— select person —</option>
        {users.map((u) => (
          <option key={u.id} value={u.name}>{u.name}{u.email ? ` (${u.email})` : ""}</option>
        ))}
      </select>
    );
  }

  // Numbers
  if (col.type === "numbers") {
    return (
      <input
        type="number"
        step="any"
        style={{ ...inputStyle, flex: 1 }}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Rating
  if (col.type === "rating") {
    return (
      <select
        className="editor-select"
        style={{ flex: 1, minWidth: 0 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— rating —</option>
        {[1, 2, 3, 4, 5].map((r) => (
          <option key={r} value={String(r)}>{"★".repeat(r)}{"☆".repeat(5 - r)} ({r})</option>
        ))}
      </select>
    );
  }

  // Email
  if (col.type === "email") {
    return (
      <input
        type="email"
        style={{ ...inputStyle, flex: 1 }}
        placeholder="email@example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Phone
  if (col.type === "phone") {
    return (
      <input
        type="tel"
        style={{ ...inputStyle, flex: 1 }}
        placeholder="+1 555-0123"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Link
  if (col.type === "link") {
    return (
      <input
        type="url"
        style={{ ...inputStyle, flex: 1 }}
        placeholder="https://..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Long text
  if (col.type === "long_text") {
    return (
      <textarea
        style={{ ...inputStyle, flex: 1, minHeight: 32, resize: "vertical", fontFamily: "inherit" }}
        placeholder={col.title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Default — text
  return (
    <input
      style={{ ...inputStyle, flex: 1 }}
      placeholder={col.type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── CREATE VIEW ──────────────────────────────────────────────────────

function CreateView({
  token, boardId, columns, subitemColumns, groups, onRefresh, items,
}: {
  token: string; boardId: string | null; columns: MondayColumn[]; subitemColumns: MondayColumn[]; groups: MondayGroup[]; onRefresh: () => void; items: MondayItem[];
}) {
  const [itemName, setItemName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [mode, setMode] = useState<"item" | "subitem">("item");
  const [parentId, setParentId] = useState("");
  const [colValues, setColValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "creating" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<{ id: number; name: string; email?: string }[]>([]);

  // Load workspace users for people columns
  useEffect(() => {
    if (token) {
      getWorkspaceUsers(token).then(setUsers).catch(() => {});
    }
  }, [token]);

  // Use subitem columns when in subitem mode
  const activeColumns = mode === "subitem" ? subitemColumns : columns;
  const writableColumns = useMemo(
    () => activeColumns.filter((c) => !READ_ONLY_TYPES.has(c.type) && c.id !== "name"),
    [activeColumns],
  );

  // Reset column values when mode changes
  useEffect(() => {
    setColValues({});
  }, [mode]);

  const handleCreate = async () => {
    if (!boardId || !itemName.trim()) return;
    setStatus("creating");
    setError("");
    try {
      const formatted: Record<string, unknown> = {};
      for (const col of writableColumns) {
        const val = colValues[col.id]?.trim();
        if (!val) continue;
        const fv = await formatColumnValueForApi(token, col.type, val, col);
        if (fv != null) formatted[col.id] = fv;
      }

      if (mode === "subitem" && parentId) {
        await _createSubitem(token, parentId, itemName.trim(), formatted);
      } else {
        await _createItem(token, boardId, groupId || undefined, itemName.trim(), formatted);
      }
      setStatus("done");
      setItemName("");
      setColValues({});
      onRefresh();
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Mode toggle */}
      <div className="card" style={{ padding: "8px 10px", display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
          <input type="radio" checked={mode === "item"} onChange={() => setMode("item")} style={{ accentColor: "hsl(var(--primary))" }} />
          <span style={{ fontWeight: mode === "item" ? 600 : 400 }}>Item</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
          <input type="radio" checked={mode === "subitem"} onChange={() => setMode("subitem")} style={{ accentColor: "hsl(var(--primary))" }} />
          <span style={{ fontWeight: mode === "subitem" ? 600 : 400 }}>Subitem</span>
        </label>
      </div>

      {/* Name */}
      <input
        className="editor-input"
        placeholder={mode === "subitem" ? "Subitem name..." : "Item name..."}
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
      />

      {/* Group or Parent */}
      {mode === "item" ? (
        <select className="editor-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
      ) : (
        <select className="editor-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Select parent item...</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name} ({i.id})</option>
          ))}
        </select>
      )}

      {/* Column values */}
      <div className="section-header" style={{ marginTop: 2 }}>
        <span>Column Values</span>
        <span className="type-badge" style={{ fontSize: 9 }}>
          {mode === "subitem" ? "subitem" : "parent"} · {writableColumns.length} cols
        </span>
      </div>
      <div style={{ maxHeight: 220, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {writableColumns.length === 0 && (
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", padding: 8, textAlign: "center" }}>
            {mode === "subitem" ? "No subitem columns available. Make sure the board has subitems configured." : "No writable columns found."}
          </div>
        )}
        {writableColumns.map((col) => (
          <div key={col.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label
              style={{
                fontSize: 10, width: 85, flexShrink: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: "hsl(var(--muted-foreground))", fontWeight: 500,
              }}
              title={`${col.title} (${col.type})`}
            >
              {col.title}
            </label>
            <SmartColumnInput
              col={col}
              value={colValues[col.id] ?? ""}
              onChange={(val) => setColValues((p) => ({ ...p, [col.id]: val }))}
              users={users}
            />
          </div>
        ))}
      </div>

      <button
        className="btn-primary"
        style={{ padding: "7px 12px", fontSize: 11, marginTop: 2 }}
        disabled={!itemName.trim() || status === "creating"}
        onClick={handleCreate}
      >
        {status === "creating" ? "Creating..." : `Create ${mode === "subitem" ? "subitem" : "item"}`}
      </button>

      {status === "done" && (
        <div className="status-message success">✓ Created successfully!</div>
      )}
      {status === "error" && (
        <div className="status-message error">✗ {error}</div>
      )}
    </div>
  );
}

// ── BULK UPDATE VIEW ─────────────────────────────────────────────────

function BulkUpdateView({
  token, boardId, items, columns, subitemColumns, selectedItemIds,
}: {
  token: string; boardId: string | null; items: MondayItem[]; columns: MondayColumn[]; subitemColumns: MondayColumn[]; selectedItemIds: Set<string>;
}) {
  const [columnId, setColumnId] = useState("");
  const [value, setValue] = useState("");
  const [progress, setProgress] = useState({ total: 0, done: 0, failed: 0 });
  const [running, setRunning] = useState(false);
  const [queueStats, setQueueStats] = useState<QueueStats>({ pending: 0, running: 0, succeeded: 0, failed: 0 });
  const [users, setUsers] = useState<{ id: number; name: string; email?: string }[]>([]);
  const [targetType, setTargetType] = useState<"items" | "subitems">("items");

  useEffect(() => onStatsChange(setQueueStats), []);
  useEffect(() => {
    if (token) getWorkspaceUsers(token).then(setUsers).catch(() => {});
  }, [token]);

  const allColumns = targetType === "subitems" ? subitemColumns : columns;
  const writableColumns = useMemo(
    () => allColumns.filter((c) => !READ_ONLY_TYPES.has(c.type) && c.id !== "name"),
    [allColumns],
  );

  const selectedCol = writableColumns.find((c) => c.id === columnId);

  const selectedItems = items.filter((i) => selectedItemIds.has(i.id));

  // Collect subitems from selected items
  const selectedSubitems = useMemo(() => {
    return selectedItems.flatMap((i) => i.subitems ?? []);
  }, [selectedItems]);

  const targetItems = targetType === "subitems" ? selectedSubitems : selectedItems;

  const handleBulkUpdate = async () => {
    if (!boardId || !columnId || !value.trim() || targetItems.length === 0) return;
    setRunning(true);
    resetStats();

    const col = writableColumns.find((c) => c.id === columnId);
    const formatted = col
      ? await formatColumnValueForApi(token, col.type, value.trim(), col)
      : value.trim();

    if (formatted == null) {
      setRunning(false);
      return;
    }

    const total = targetItems.length;
    setProgress({ total, done: 0, failed: 0 });
    let done = 0;
    let failed = 0;

    const promises = targetItems.map((item) =>
      enqueue(() => changeColumnValue(token, boardId, item.id, columnId, formatted)).then(
        () => { done++; setProgress({ total, done, failed }); },
        () => { done++; failed++; setProgress({ total, done, failed }); },
      ),
    );

    await Promise.all(promises);
    setRunning(false);
  };

  if (selectedItems.length === 0) {
    return (
      <div className="empty-state" style={{ fontSize: 11 }}>
        <div className="empty-state-icon">☑️</div>
        <span>Select items in the Items tab first</span>
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
          Use checkboxes to select items for bulk update
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>
          {selectedItems.length} items selected
          {selectedSubitems.length > 0 && ` (${selectedSubitems.length} subitems)`}
        </span>
      </div>

      {/* Target: items or subitems */}
      {selectedSubitems.length > 0 && (
        <div className="card" style={{ padding: "6px 10px", display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
            <input type="radio" checked={targetType === "items"} onChange={() => { setTargetType("items"); setColumnId(""); setValue(""); }} style={{ accentColor: "hsl(var(--primary))" }} />
            <span style={{ fontWeight: targetType === "items" ? 600 : 400 }}>Update items ({selectedItems.length})</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
            <input type="radio" checked={targetType === "subitems"} onChange={() => { setTargetType("subitems"); setColumnId(""); setValue(""); }} style={{ accentColor: "hsl(var(--primary))" }} />
            <span style={{ fontWeight: targetType === "subitems" ? 600 : 400 }}>Update subitems ({selectedSubitems.length})</span>
          </label>
        </div>
      )}

      <select className="editor-select" value={columnId} onChange={(e) => { setColumnId(e.target.value); setValue(""); }}>
        <option value="">Select column to update...</option>
        {writableColumns.map((c) => (
          <option key={c.id} value={c.id}>{c.title} ({c.type})</option>
        ))}
      </select>

      {selectedCol ? (
        <SmartColumnInput
          col={selectedCol}
          value={value}
          onChange={setValue}
          users={users}
        />
      ) : (
        <input
          className="editor-input"
          placeholder="New value..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      <button
        className="btn-primary"
        style={{ fontSize: 11, padding: "7px 12px" }}
        disabled={!columnId || !value.trim() || running}
        onClick={handleBulkUpdate}
      >
        {running ? `Updating... ${progress.done}/${progress.total}` : `Apply to ${targetItems.length} ${targetType}`}
      </button>

      {progress.total > 0 && !running && (
        <div style={{ fontSize: 11 }}>
          <span style={{ color: "hsl(142 76% 36%)" }}>✓ {progress.done - progress.failed} succeeded</span>
          {progress.failed > 0 && (
            <>
              {" · "}
              <span style={{ color: "hsl(0 84% 60%)" }}>✗ {progress.failed} failed</span>
              {" · "}
              <button className="btn-ghost" style={{ fontSize: 10 }} onClick={() => retryFailed()}>
                Retry failed
              </button>
            </>
          )}
        </div>
      )}

      {/* Queue stats */}
      {(queueStats.running > 0 || queueStats.pending > 0) && (
        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
          Queue: {queueStats.pending} pending · {queueStats.running} running
        </div>
      )}
    </div>
  );
}

// ── DELETE VIEW ──────────────────────────────────────────────────────

function DeleteView({
  token, items, selectedItemIds, dispatch, onRefresh,
}: {
  token: string;
  items: MondayItem[];
  selectedItemIds: Set<string>;
  dispatch: React.Dispatch<import("../hooks/useInspectorStore").Action>;
  onRefresh: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0, failed: 0 });
  const [queueStats, setQueueStats] = useState<QueueStats>({ pending: 0, running: 0, succeeded: 0, failed: 0 });

  useEffect(() => onStatsChange(setQueueStats), []);

  const selectedItems = items.filter((i) => selectedItemIds.has(i.id));
  const confirmed = confirmText === "DELETE";

  if (selectedItems.length === 0) {
    return (
      <div className="empty-state" style={{ fontSize: 11 }}>
        <div className="empty-state-icon">🗑️</div>
        <span>Select items in the Items tab first</span>
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
          Use checkboxes to select items for deletion
        </span>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirmed || selectedItems.length === 0) return;
    setRunning(true);
    resetStats();

    const total = selectedItems.length;
    let done = 0;
    let failed = 0;
    setProgress({ total, done, failed });

    const promises = selectedItems.map((item) =>
      enqueue(() => deleteItem(token, item.id)).then(
        () => { done++; setProgress({ total, done, failed }); },
        () => { done++; failed++; setProgress({ total, done, failed }); },
      ),
    );

    await Promise.all(promises);
    setRunning(false);
    setConfirmText("");
    dispatch({ type: "CLEAR_SELECTION" });
    onRefresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="status-message error" style={{ fontWeight: 500 }}>
        ⚠️ This will permanently delete {selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""}. Cannot be undone.
      </div>

      <div style={{ maxHeight: 120, overflow: "auto", fontSize: 10, display: "flex", flexDirection: "column", gap: 2 }}>
        {selectedItems.map((item) => (
          <div key={item.id} style={{
            display: "flex", justifyContent: "space-between",
            padding: "4px 8px", borderRadius: 6,
            background: "hsl(0 84% 60% / 0.04)",
            border: "1px solid hsl(0 84% 60% / 0.1)",
          }}>
            <span>{item.name}</span>
            <code style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>{item.id}</code>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
        Type <strong style={{ color: "hsl(0 84% 60%)" }}>DELETE</strong> to confirm:
      </div>
      <input
        className="editor-input"
        style={{
          borderColor: confirmed ? "hsl(0 84% 60%)" : undefined,
          fontFamily: "monospace", letterSpacing: "0.05em",
        }}
        placeholder="Type DELETE..."
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        disabled={running}
      />

      <button
        className="btn-primary"
        style={{
          fontSize: 11, padding: "7px 12px",
          background: confirmed ? "hsl(0 84% 60%)" : undefined,
          opacity: confirmed && !running ? 1 : 0.5,
        }}
        disabled={!confirmed || running}
        onClick={handleDelete}
      >
        {running
          ? `Deleting... ${progress.done}/${progress.total}`
          : `Delete ${selectedItems.length} item${selectedItems.length !== 1 ? "s" : ""}`}
      </button>

      {running && progress.total > 0 && (
        <div className="progress-bar" style={{ height: 4, borderRadius: 2 }}>
          <div style={{
            width: `${(progress.done / progress.total) * 100}%`,
            height: "100%",
            background: progress.failed > 0 ? "hsl(38 92% 50%)" : "hsl(0 84% 60%)",
            borderRadius: 2,
            transition: "width 0.2s",
          }} />
        </div>
      )}

      {!running && progress.total > 0 && (
        <div style={{ fontSize: 11 }}>
          <span style={{ color: "hsl(142 76% 36%)" }}>✓ {progress.done - progress.failed} deleted</span>
          {progress.failed > 0 && (
            <>
              {" · "}
              <span style={{ color: "hsl(0 84% 60%)" }}>✗ {progress.failed} failed</span>
              {" · "}
              <button className="btn-ghost" style={{ fontSize: 10 }} onClick={() => retryFailed()}>
                Retry failed
              </button>
            </>
          )}
        </div>
      )}

      {(queueStats.running > 0 || queueStats.pending > 0) && (
        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
          Queue: {queueStats.pending} pending · {queueStats.running} running
        </div>
      )}
    </div>
  );
}

// ── PASTE VIEW ───────────────────────────────────────────────────────

function PasteView({
  token, boardId, columns, groups, items, onRefresh,
}: {
  token: string; boardId: string | null; columns: MondayColumn[]; groups: MondayGroup[]; items: MondayItem[]; onRefresh: () => void;
}) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mappings, setMappings] = useState<Record<number, string>>({});
  const [nameColIdx, setNameColIdx] = useState(0);
  const [mode, setMode] = useState<"create" | "update">("create");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [status, setStatus] = useState<{ total: number; done: number; failed: number } | null>(null);
  const [running, setRunning] = useState(false);

  const writableColumns = useMemo(
    () => columns.filter((c) => !READ_ONLY_TYPES.has(c.type) && c.id !== "name"),
    [columns],
  );

  const handleParse = () => {
    if (!rawText.trim()) return;
    const lines = rawText.trim().split("\n");
    if (lines.length < 2) return;

    const firstLine = lines[0];
    let delimiter = "\t";
    if (!firstLine.includes("\t")) {
      if (firstLine.includes("|")) delimiter = "|";
      else if (firstLine.includes(",")) delimiter = ",";
    }

    const headers = lines[0].split(delimiter).map((h) => h.trim());
    const rows = lines.slice(1).map((l) => l.split(delimiter).map((c) => c.trim()));
    setParsed({ headers, rows });

    const newMappings: Record<number, string> = {};
    headers.forEach((h, i) => {
      const match = writableColumns.find(
        (c) => c.title.toLowerCase() === h.toLowerCase(),
      );
      if (match) newMappings[i] = match.id;
    });
    setMappings(newMappings);
  };

  const handleExecute = async () => {
    if (!parsed || !boardId) return;
    setRunning(true);
    const total = parsed.rows.length;
    let done = 0;
    let failed = 0;
    setStatus({ total, done, failed });

    for (const row of parsed.rows) {
      try {
        const itemName = row[nameColIdx] ?? "";
        if (!itemName) { done++; failed++; setStatus({ total, done, failed }); continue; }

        const colVals: Record<string, unknown> = {};
        for (const [idxStr, colId] of Object.entries(mappings)) {
          const idx = Number(idxStr);
          if (idx === nameColIdx) continue;
          const val = row[idx]?.trim();
          if (!val) continue;
          const col = columns.find((c) => c.id === colId);
          if (!col) continue;
          const fv = await formatColumnValueForApi(token, col.type, val, col);
          if (fv != null) colVals[colId] = fv;
        }

        if (mode === "create") {
          await enqueue(() => _createItem(token, boardId, groupId || undefined, itemName, colVals));
        } else {
          const existing = items.find(
            (i) => i.name.toLowerCase() === itemName.toLowerCase(),
          );
          if (existing) {
            for (const [colId, fv] of Object.entries(colVals)) {
              await enqueue(() => changeColumnValue(token, boardId, existing.id, colId, fv));
            }
          } else {
            failed++;
          }
        }
        done++;
      } catch {
        done++;
        failed++;
      }
      setStatus({ total, done, failed });
    }

    setRunning(false);
    if (mode === "create") onRefresh();
  };

  if (!parsed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
          Paste tabular data (tab, comma, or pipe delimited). First row = headers.
        </div>
        <textarea
          className="editor-input"
          style={{ minHeight: 100, fontFamily: "'SF Mono', monospace", fontSize: 10, resize: "vertical" }}
          placeholder={"Name\tStatus\tDate\nItem 1\tDone\t2024-01-15\nItem 2\tWorking on it\t2024-02-01"}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
        <button
          className="btn-primary"
          style={{ fontSize: 11, padding: "7px 12px" }}
          disabled={!rawText.trim()}
          onClick={handleParse}
        >
          Parse Data
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600 }}>
          {parsed.rows.length} rows · {parsed.headers.length} columns
        </span>
        <button className="btn-ghost" style={{ fontSize: 10 }} onClick={() => setParsed(null)}>
          ← Back
        </button>
      </div>

      <div className="card" style={{ padding: "6px 10px", display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
          <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} style={{ accentColor: "hsl(var(--primary))" }} />
          <span>Create items</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer" }}>
          <input type="radio" checked={mode === "update"} onChange={() => setMode("update")} style={{ accentColor: "hsl(var(--primary))" }} />
          <span>Update existing</span>
        </label>
      </div>

      {mode === "create" && (
        <select className="editor-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
      )}

      <div style={{ fontSize: 10, fontWeight: 600 }}>Name column:</div>
      <select className="editor-select" value={nameColIdx} onChange={(e) => setNameColIdx(Number(e.target.value))}>
        {parsed.headers.map((h, i) => (
          <option key={i} value={i}>{h}</option>
        ))}
      </select>

      <div style={{ fontSize: 10, fontWeight: 600 }}>Map columns:</div>
      <div style={{ maxHeight: 120, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {parsed.headers.map((header, idx) => {
          if (idx === nameColIdx) return null;
          return (
            <div key={idx} className="mapping-row">
              <span className="col-name">{header}</span>
              <span className="arrow">→</span>
              <select
                className="editor-select"
                style={{ flex: 1, minWidth: 0 }}
                value={mappings[idx] ?? ""}
                onChange={(e) => setMappings((p) => ({ ...p, [idx]: e.target.value }))}
              >
                <option value="">Skip</option>
                {writableColumns.map((c) => (
                  <option key={c.id} value={c.id}>{c.title} ({c.type})</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      <button
        className="btn-primary"
        style={{ fontSize: 11, padding: "7px 12px" }}
        disabled={running}
        onClick={handleExecute}
      >
        {running
          ? `Processing ${status?.done ?? 0}/${status?.total ?? 0}...`
          : `${mode === "create" ? "Create" : "Update"} ${parsed.rows.length} items`}
      </button>

      {status && !running && (
        <div style={{ fontSize: 11 }}>
          <span style={{ color: "hsl(142 76% 36%)" }}>✓ {status.done - status.failed} succeeded</span>
          {status.failed > 0 && (
            <span style={{ color: "hsl(0 84% 60%)" }}> · ✗ {status.failed} failed</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── HEALTH VIEW ──────────────────────────────────────────────────────

function HealthView({ items, columns }: { items: MondayItem[]; columns: MondayColumn[] }) {
  const report = useMemo(() => {
    const nameCount = new Map<string, MondayItem[]>();
    for (const item of items) {
      const key = item.name.toLowerCase().trim();
      if (!nameCount.has(key)) nameCount.set(key, []);
      nameCount.get(key)!.push(item);
    }
    const duplicates = [...nameCount.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([name, dupes]) => ({ name, count: dupes.length, ids: dupes.map((d) => d.id) }));

    const writableCols = columns.filter((c) => !READ_ONLY_TYPES.has(c.type) && c.id !== "name");
    const emptyCols: { title: string; empty: number; total: number }[] = [];
    for (const col of writableCols) {
      let empty = 0;
      for (const item of items) {
        const cv = item.column_values?.find((v) => v.id === col.id);
        if (!cv?.text?.trim()) empty++;
      }
      if (empty > 0) {
        emptyCols.push({ title: col.title, empty, total: items.length });
      }
    }
    emptyCols.sort((a, b) => b.empty - a.empty);

    const emptyItems = items.filter(
      (i) => !i.column_values?.some((cv) => cv.text?.trim()),
    );

    return { duplicates, emptyCols, emptyItems };
  }, [items, columns]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Duplicates */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: 6 }}>
          {report.duplicates.length > 0 ? "⚠️" : "✅"} Duplicate Names
          <span className="type-badge">{report.duplicates.length}</span>
        </div>
        {report.duplicates.length === 0 ? (
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>No duplicates found</div>
        ) : (
          <div style={{ maxHeight: 80, overflow: "auto", fontSize: 10 }}>
            {report.duplicates.map((d) => (
              <div key={d.name} style={{ padding: "3px 0" }}>
                <strong>{d.name}</strong> × {d.count}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty columns */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: 6 }}>
          {report.emptyCols.length > 0 ? "📊" : "✅"} Missing Values
          <span className="type-badge">{report.emptyCols.length}</span>
        </div>
        {report.emptyCols.length === 0 ? (
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>All columns populated</div>
        ) : (
          <div style={{ maxHeight: 100, overflow: "auto", fontSize: 10 }}>
            {report.emptyCols.map((c) => (
              <div key={c.title} style={{ padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                <span>{c.title}</span>
                <span className="type-badge" style={{ background: "hsl(0 84% 60% / 0.1)", color: "hsl(0 84% 60%)" }}>{c.empty}/{c.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty items */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: 6 }}>
          {report.emptyItems.length > 0 ? "🔴" : "✅"} Items with No Data
          <span className="type-badge">{report.emptyItems.length}</span>
        </div>
        {report.emptyItems.length === 0 ? (
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>All items have data</div>
        ) : (
          <div style={{ maxHeight: 80, overflow: "auto", fontSize: 10 }}>
            {report.emptyItems.map((i) => (
              <div key={i.id} style={{ padding: "2px 0" }}>
                {i.name} <code style={{ opacity: 0.5 }}>({i.id})</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
