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
    setOpen(false);
  };

  if (items.length === 0) return null;

  const btnStyle = {
    width: "100%",
    textAlign: "left" as const,
    fontSize: 11,
    padding: "5px 10px",
    whiteSpace: "nowrap" as const,
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn-secondary"
        onClick={() => setOpen(!open)}
        title="Export data"
        style={{ fontSize: 10, padding: "3px 10px", gap: 4, display: "inline-flex", alignItems: "center" }}
      >
        <span>⬇</span> Export {label || `(${items.length})`}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", right: 0, marginTop: 4,
            background: "hsl(0 0% 100%)", border: "1px solid hsl(240 6% 90%)",
            borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            padding: 4, zIndex: 20, minWidth: 170,
          }}>
            {label && (
              <div style={{ fontSize: 10, padding: "3px 10px", color: "hsl(240 6% 50%)", borderBottom: "1px solid hsl(240 6% 92%)", marginBottom: 2 }}>
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
                <div style={{ height: 1, background: "hsl(240 6% 92%)", margin: "2px 0" }} />
                <button className="btn-ghost" style={btnStyle} onClick={() => handle("combined-csv")}>
                  📄 CSV (items + subitems)
                </button>
                <button className="btn-ghost" style={btnStyle} onClick={() => handle("nested-json")}>
                  📋 JSON (nested)
                </button>
              </>
            )}
            <div style={{ height: 1, background: "hsl(240 6% 92%)", margin: "2px 0" }} />
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
