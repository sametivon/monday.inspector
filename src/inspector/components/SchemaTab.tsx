import { useState, useCallback } from "react";
import type { MondayColumn, MondayGroup } from "../../utils/types";
import { copyToClipboard } from "../services/export";

interface SchemaTabProps {
  columns: MondayColumn[];
  groups: MondayGroup[];
  subitemColumns: MondayColumn[];
  subitemBoardId: string | null;
  loading: boolean;
}

export function SchemaTab({
  columns,
  groups,
  subitemColumns,
  subitemBoardId,
  loading,
}: SchemaTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = useCallback((id: string) => {
    copyToClipboard(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1200);
  }, []);

  if (loading && columns.length === 0) {
    return (
      <div className="empty-state">
        <div className="spinner" />
        <span>Loading board schema...</span>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <span>No board data loaded</span>
        <span style={{ fontSize: 11 }}>Set your API token to load data</span>
      </div>
    );
  }

  const CopyBadge = ({ id }: { id: string }) => (
    <code
      onClick={() => handleCopyId(id)}
      title="Click to copy"
      className="copy-badge"
      style={{
        fontSize: 9,
        background: copiedId === id ? "hsl(142 76% 46% / 0.15)" : "hsl(var(--muted))",
        color: copiedId === id ? "hsl(142 76% 36%)" : "hsl(var(--muted-foreground))",
        padding: "2px 6px",
        borderRadius: 4,
        fontFamily: "monospace",
        cursor: "pointer",
        transition: "all 0.2s",
        userSelect: "none",
      }}
    >
      {copiedId === id ? "✓ Copied!" : id}
    </code>
  );

  const renderColumnTable = (cols: MondayColumn[], level: "parent" | "subitem") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {cols.map((col) => (
        <div
          key={col.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 8px",
            borderRadius: 6,
            background: "hsl(var(--muted) / 0.3)",
            fontSize: 11,
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--muted) / 0.7)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
        >
          <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {col.title}
          </span>
          <span className="type-badge" style={{
            fontSize: 9,
            background: level === "subitem" ? "hsl(200 80% 50% / 0.1)" : "hsl(var(--primary) / 0.08)",
            color: level === "subitem" ? "hsl(200 80% 40%)" : "hsl(var(--primary))",
          }}>
            {col.type}
          </span>
          <CopyBadge id={col.id} />
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Groups */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: 6 }}>
          Groups
          <span className="type-badge">{groups.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {groups.map((g) => (
            <div
              key={g.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 8px",
                borderRadius: 6,
                background: "hsl(var(--muted) / 0.3)",
                fontSize: 11,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--muted) / 0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
            >
              <span style={{ fontWeight: 500 }}>{g.title}</span>
              <CopyBadge id={g.id} />
            </div>
          ))}
        </div>
      </div>

      {/* Board columns */}
      <div className="card">
        <div className="section-header" style={{ marginBottom: 6 }}>
          Board Columns
          <span className="type-badge">{columns.length}</span>
          <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginLeft: "auto" }}>click ID to copy</span>
        </div>
        {renderColumnTable(columns, "parent")}
      </div>

      {/* Subitem columns */}
      {subitemBoardId && subitemColumns.length > 0 && (
        <div className="card">
          <div className="section-header" style={{ marginBottom: 6 }}>
            Subitem Columns
            <span className="type-badge" style={{ background: "hsl(200 80% 50% / 0.1)", color: "hsl(200 80% 40%)" }}>
              {subitemColumns.length}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
            Subitem Board:
            <CopyBadge id={subitemBoardId!} />
          </div>
          {renderColumnTable(subitemColumns, "subitem")}
        </div>
      )}
    </div>
  );
}
