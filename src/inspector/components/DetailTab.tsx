import { useState, useMemo } from "react";
import type { MondayColumn, MondayItem, MondayColumnValue } from "../../utils/types";
import { changeColumnValue, formatColumnValueForApi } from "../services/inspectorApi";

interface DetailTabProps {
  token: string;
  boardId: string | null;
  item: MondayItem | null;
  columns: MondayColumn[];
  subitemColumns: MondayColumn[];
}

const READ_ONLY_TYPES = new Set([
  "formula", "mirror", "auto_number", "lookup",
  "creation_log", "last_updated", "item_id",
  "subtasks", "board_relation", "dependency",
  "file", "doc", "button",
]);

function getStatusLabels(col?: MondayColumn): string[] {
  if (!col?.settings_str) return [];
  try {
    const settings = JSON.parse(col.settings_str);
    if (!settings.labels) return [];
    return Object.values(settings.labels)
      .map((v: unknown) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object" && "label" in (v as Record<string, unknown>))
          return (v as { label: string }).label;
        return null;
      })
      .filter((v): v is string => typeof v === "string" && v !== "") as string[];
  } catch {
    return [];
  }
}

function getDropdownLabels(col?: MondayColumn): string[] {
  if (!col?.settings_str) return [];
  try {
    const settings = JSON.parse(col.settings_str);
    const labels: { id: number; name: string }[] = settings.labels ?? [];
    return labels.map((l) => l.name).filter(Boolean);
  } catch {
    return [];
  }
}

function getCheckboxState(cv: MondayColumnValue): boolean {
  try {
    if (cv.value) {
      const parsed = JSON.parse(cv.value);
      return parsed.checked === "true" || parsed.checked === true;
    }
  } catch { /* ignore */ }
  return cv.text?.toLowerCase() === "v" || cv.text?.toLowerCase() === "true";
}

function getDateValue(cv: MondayColumnValue): string {
  try {
    if (cv.value) {
      const parsed = JSON.parse(cv.value);
      return parsed.date ?? "";
    }
  } catch { /* ignore */ }
  return cv.text ?? "";
}

function getLinkValue(cv: MondayColumnValue): { url: string; text: string } {
  try {
    if (cv.value) {
      const parsed = JSON.parse(cv.value);
      return { url: parsed.url ?? "", text: parsed.text ?? "" };
    }
  } catch { /* ignore */ }
  return { url: cv.text ?? "", text: "" };
}

export function DetailTab({
  token,
  boardId,
  item,
  columns,
  subitemColumns,
}: DetailTabProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editValue2, setEditValue2] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, "success" | "error" | null>>({});

  // Build maps: parentColMap and subitemColMap
  const parentColMap = useMemo(() => {
    const map = new Map<string, MondayColumn>();
    for (const c of columns) map.set(c.id, c);
    return map;
  }, [columns]);

  const subitemColMap = useMemo(() => {
    const map = new Map<string, MondayColumn>();
    for (const c of subitemColumns) map.set(c.id, c);
    return map;
  }, [subitemColumns]);

  if (!item) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">👆</div>
        <span>Select an item from the Items tab</span>
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
          Click on any item to see its details
        </span>
      </div>
    );
  }

  // Determine if this item is a subitem by checking if its column_values match subitem columns
  const isSubitem = item.column_values?.some((cv) => subitemColMap.has(cv.id) && !parentColMap.has(cv.id)) ?? false;
  // Merge both for lookup
  const mergedMap = new Map([...parentColMap, ...subitemColMap]);

  const getColumn = (id: string) => mergedMap.get(id);

  // Determine which level a column value belongs to
  const getLevel = (cvId: string): "parent" | "subitem" | "unknown" => {
    if (parentColMap.has(cvId) && !subitemColMap.has(cvId)) return "parent";
    if (subitemColMap.has(cvId) && !parentColMap.has(cvId)) return "subitem";
    if (isSubitem && subitemColMap.has(cvId)) return "subitem";
    if (!isSubitem && parentColMap.has(cvId)) return "parent";
    return "unknown";
  };

  const handleEdit = (cv: MondayColumnValue) => {
    const col = getColumn(cv.id);
    setEditingField(cv.id);
    setSaveStatus((prev) => ({ ...prev, [cv.id]: null }));

    if (col?.type === "checkbox") {
      setEditValue(getCheckboxState(cv) ? "true" : "false");
    } else if (col?.type === "date") {
      setEditValue(getDateValue(cv));
    } else if (col?.type === "link") {
      const link = getLinkValue(cv);
      setEditValue(link.url);
      setEditValue2(link.text);
    } else {
      setEditValue(cv.text || "");
    }
  };

  const handleSave = async (cv: MondayColumnValue) => {
    if (!boardId || !token) return;
    setSaving(true);
    try {
      const col = getColumn(cv.id);
      const colType = col?.type ?? "text";
      let valueToSend: unknown;

      if (colType === "checkbox") {
        valueToSend = { checked: editValue === "true" ? "true" : "false" };
      } else if (colType === "link") {
        valueToSend = { url: editValue, text: editValue2 || editValue };
      } else {
        const formatted = await formatColumnValueForApi(token, colType, editValue, col);
        valueToSend = formatted ?? editValue;
      }

      await changeColumnValue(token, boardId, item.id, cv.id, valueToSend);
      setSaveStatus((prev) => ({ ...prev, [cv.id]: "success" }));
      setEditingField(null);
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [cv.id]: null })), 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [cv.id]: "error" }));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue("");
    setEditValue2("");
  };

  const handleCheckboxToggle = async (cv: MondayColumnValue) => {
    if (!boardId || !token) return;
    const current = getCheckboxState(cv);
    setSaving(true);
    try {
      await changeColumnValue(token, boardId, item.id, cv.id, {
        checked: current ? "false" : "true",
      });
      setSaveStatus((prev) => ({ ...prev, [cv.id]: "success" }));
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [cv.id]: null })), 2000);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [cv.id]: "error" }));
    } finally {
      setSaving(false);
    }
  };

  const copyValue = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderEditor = (cv: MondayColumnValue, col?: MondayColumn) => {
    const colType = col?.type ?? "text";

    if (colType === "status" || colType === "color") {
      const labels = getStatusLabels(col);
      return (
        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
          <select className="editor-select" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus>
            <option value="">— Select —</option>
            {labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
          <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
        </div>
      );
    }

    if (colType === "dropdown") {
      const labels = getDropdownLabels(col);
      return (
        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
          <select className="editor-select" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus>
            <option value="">— Select —</option>
            {labels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
          <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
        </div>
      );
    }

    if (colType === "date") {
      return (
        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
          <input className="editor-input" type="date" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
          <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
          <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
        </div>
      );
    }

    if (colType === "link") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 3 }}>
          <input className="editor-input" placeholder="URL" value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus />
          <input className="editor-input" placeholder="Display text" value={editValue2} onChange={(e) => setEditValue2(e.target.value)} />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
            <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      );
    }

    if (colType === "numbers") {
      return (
        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
          <input className="editor-input" type="number" step="any" value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(cv); if (e.key === "Escape") handleCancel(); }}
            autoFocus />
          <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
          <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
        </div>
      );
    }

    if (colType === "long_text") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 3 }}>
          <textarea className="editor-input" style={{ minHeight: 60, resize: "vertical" }} value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
            autoFocus />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
            <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
        <input className="editor-input" value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(cv); if (e.key === "Escape") handleCancel(); }}
          autoFocus />
        <button className="btn-primary" onClick={() => handleSave(cv)} disabled={saving}>{saving ? "..." : "Save"}</button>
        <button className="btn-ghost" onClick={handleCancel}>Cancel</button>
      </div>
    );
  };

  return (
    <div>
      {/* Item header */}
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{item.name}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          <span className="type-badge">ID: {item.id}</span>
          {item.group && <span className="type-badge">Group: {item.group.title}</span>}
          <span className="type-badge" style={{
            background: isSubitem ? "hsl(200 80% 50% / 0.1)" : "hsl(var(--primary) / 0.1)",
            color: isSubitem ? "hsl(200 80% 40%)" : "hsl(var(--primary))",
          }}>
            {isSubitem ? "↳ Subitem" : "Parent Item"}
          </span>
        </div>
      </div>

      {/* Column values */}
      {item.column_values && item.column_values.length > 0 ? (
        item.column_values.map((cv) => {
          const col = getColumn(cv.id);
          const colType = col?.type ?? "";
          const isReadOnly = READ_ONLY_TYPES.has(colType);
          const isEditing = editingField === cv.id;
          const isCheckbox = colType === "checkbox";
          const status = saveStatus[cv.id];
          const level = getLevel(cv.id);

          return (
            <div key={cv.id} className="detail-field">
              <div className="detail-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>{col?.title ?? cv.id}</span>
                <span className="type-badge" style={{ fontSize: 9 }}>{colType || "unknown"}</span>
                <span className="type-badge" style={{
                  fontSize: 8,
                  background: level === "subitem" ? "hsl(200 80% 50% / 0.1)" : "hsl(142 76% 46% / 0.1)",
                  color: level === "subitem" ? "hsl(200 80% 40%)" : "hsl(142 76% 36%)",
                }}>
                  {level === "subitem" ? "sub" : level === "parent" ? "parent" : "—"}
                </span>
                {status === "success" && (
                  <span style={{ color: "hsl(142 76% 46%)", fontSize: 9 }}>✓ saved</span>
                )}
                {status === "error" && (
                  <span style={{ color: "hsl(var(--destructive))", fontSize: 9 }}>✗ failed</span>
                )}
              </div>

              {isEditing ? (
                renderEditor(cv, col)
              ) : (
                <div className="detail-value" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {isCheckbox && !isReadOnly ? (
                    <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={getCheckboxState(cv)}
                        onChange={() => handleCheckboxToggle(cv)}
                        disabled={saving}
                        style={{ cursor: "pointer", accentColor: "hsl(var(--primary))" }}
                      />
                      <span>{getCheckboxState(cv) ? "Checked" : "Unchecked"}</span>
                    </label>
                  ) : (
                    <span style={{ flex: 1 }}>{cv.text || "—"}</span>
                  )}
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {!isReadOnly && !isCheckbox && (
                      <button className="btn-icon" onClick={() => handleEdit(cv)} title="Edit" style={{ fontSize: 10 }}>
                        ✏️
                      </button>
                    )}
                    <button className="btn-icon" onClick={() => copyValue(cv.text || cv.value || "")} title="Copy value" style={{ fontSize: 10 }}>
                      📋
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="empty-state" style={{ padding: "16px 0" }}>
          <span>No column values available</span>
        </div>
      )}
    </div>
  );
}
