import type { SavedQuery } from "../savedQueriesStorage";
import {
  exportSavedQueriesAsJson,
  importSavedQueries,
} from "../savedQueriesStorage";
import { useRef } from "react";

interface Props {
  items: SavedQuery[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Saved queries pane. Same visual language as the template gallery but with
 * destructive controls (delete) and a JSON export/import for sharing.
 */
export function SavedQueriesList({ items, activeId, onSelect, onDelete }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportAll = () => {
    const blob = new Blob([exportSavedQueriesAsJson(items)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "monday-inspector-queries.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    const added = await importSavedQueries(text);
    if (added > 0) {
      // Force reload of the page so parent picks up the new list cleanly
      window.location.reload();
    } else {
      alert("Couldn't parse that file as a saved-query export.");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button
          className="qi-btn qi-btn-sm"
          onClick={handleExportAll}
          disabled={items.length === 0}
        >
          ⬇ Export
        </button>
        <button
          className="qi-btn qi-btn-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          ⬆ Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = "";
          }}
        />
      </div>

      {items.length === 0 ? (
        <div className="qi-saved-empty">
          No saved queries yet. Pick a template, edit it, and hit{" "}
          <strong>💾 Save</strong> to keep your favourites here.
        </div>
      ) : (
        <div className="qi-template-list">
          {items.map((q) => (
            <div
              key={q.id}
              className={`qi-template-card ${activeId === q.id ? "active" : ""}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <button
                onClick={() => onSelect(q.id)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                  color: "inherit",
                }}
              >
                <div className="qi-template-card-title">{q.name}</div>
                <div className="qi-template-card-desc">
                  Updated {new Date(q.updatedAt).toLocaleString()}
                </div>
              </button>
              <button
                className="qi-btn qi-btn-sm qi-btn-ghost"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${q.name}"?`)) onDelete(q.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
