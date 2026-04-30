import { useState } from "react";
import type { MondayColumn, MondayItem } from "../../utils/types";
import {
  exportToCSV,
  exportToJSON,
  exportCombinedCSV,
  exportNestedJSON,
  copyToClipboard,
  downloadFile,
} from "../services/export";

interface ExportMenuProps {
  items: MondayItem[];
  columns: MondayColumn[];
  subitemColumns: MondayColumn[];
  boardName: string;
  selectedItemIds: Set<string>;
}

export function ExportMenu({ items, columns, subitemColumns, boardName, selectedItemIds }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const targetItems = selectedItemIds.size > 0
    ? items.filter((i) => selectedItemIds.has(i.id))
    : items;

  const safeName = boardName.replace(/[^a-zA-Z0-9_-]/g, "_") || "board";
  const hasSubitems = targetItems.some((i) => i.subitems && i.subitems.length > 0);
  const label = selectedItemIds.size > 0 ? `(${selectedItemIds.size} selected)` : "";

  const handle = (action: string) => {
    switch (action) {
      case "csv":
        downloadFile(exportToCSV(targetItems, columns), `${safeName}_export.csv`, "text/csv;charset=utf-8;");
        break;
      case "json":
        downloadFile(exportToJSON(targetItems, columns), `${safeName}_export.json`, "application/json");
        break;
      case "combined-csv":
        downloadFile(exportCombinedCSV(targetItems, columns, subitemColumns), `${safeName}_combined.csv`, "text/csv;charset=utf-8;");
        break;
      case "nested-json":
        downloadFile(exportNestedJSON(targetItems, columns, subitemColumns), `${safeName}_nested.json`, "application/json");
        break;
      case "copy-json":
        copyToClipboard(exportToJSON(targetItems, columns));
        break;
      case "copy-nested":
        copyToClipboard(exportNestedJSON(targetItems, columns, subitemColumns));
        break;
    }
    setLastAction(action);
    setTimeout(() => setLastAction(null), 1500);
    setOpen(false);
  };

  if (items.length === 0) return null;

  const btnStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    fontSize: 11.5,
    padding: "7px 12px",
    whiteSpace: "nowrap",
    borderRadius: 8,
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    gap: 6,
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn-secondary"
        onClick={() => setOpen(!open)}
        title="Export data"
        style={{
          fontSize: 10.5,
          padding: "4px 12px",
          gap: 5,
          display: "inline-flex",
          alignItems: "center",
          fontWeight: 600,
        }}
      >
        {lastAction ? (
          <span style={{ color: "hsl(150 60% 40%)" }}>✓ Exported</span>
        ) : (
          <>
            <span style={{ fontSize: 11 }}>↓</span>
            Export {label || `(${items.length})`}
          </>
        )}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", right: 0, marginTop: 6,
            background: "hsl(0 0% 100%)", border: "1px solid hsl(220 12% 89%)",
            borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 3px 8px rgba(0,0,0,0.06)",
            padding: 5, zIndex: 20, minWidth: 185,
            animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            transformOrigin: "top right",
          }}>
            {label && (
              <div style={{
                fontSize: 10, padding: "5px 12px", color: "hsl(var(--muted-foreground))",
                borderBottom: "1px solid hsl(220 12% 92%)", marginBottom: 3,
                fontWeight: 600,
              }}>
                Exporting {label}
              </div>
            )}
            <button className="btn-ghost" style={btnStyle} onClick={() => handle("csv")}>
              📄 CSV (items)
            </button>
            <button className="btn-ghost" style={btnStyle} onClick={() => handle("json")}>
              📋 JSON (items)
            </button>
            {hasSubitems && (
              <>
                <div style={{ height: 1, background: "hsl(220 12% 93%)", margin: "3px 8px" }} />
                <button className="btn-ghost" style={btnStyle} onClick={() => handle("combined-csv")}>
                  📄 CSV (items + subitems)
                </button>
                <button className="btn-ghost" style={btnStyle} onClick={() => handle("nested-json")}>
                  📋 JSON (nested)
                </button>
              </>
            )}
            <div style={{ height: 1, background: "hsl(220 12% 93%)", margin: "3px 8px" }} />
            <button className="btn-ghost" style={btnStyle} onClick={() => handle("copy-json")}>
              📎 Copy JSON
            </button>
            {hasSubitems && (
              <button className="btn-ghost" style={btnStyle} onClick={() => handle("copy-nested")}>
                📎 Copy nested JSON
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
