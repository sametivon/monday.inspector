import type { BoardSchema } from "../../services/mondayApi";

interface Props {
  boardId: string;
  onBoardIdChange: (id: string) => void;
  schema: BoardSchema | null;
  schemaLoading: boolean;
  schemaError: string | null;
}

/**
 * Step-1 inner card. Shows the resolved board with a clear classic /
 * multi-level type badge so the user knows exactly which import path
 * is going to be used.
 */
export function BoardCard({
  boardId,
  onBoardIdChange,
  schema,
  schemaLoading,
  schemaError,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "hsl(var(--qi-fg-soft))",
            display: "block",
            marginBottom: 6,
          }}
        >
          Board ID
        </label>
        <input
          className="qi-input"
          placeholder="e.g. 1234567890"
          value={boardId}
          onChange={(e) => onBoardIdChange(e.target.value.trim())}
          inputMode="numeric"
          style={{ fontFamily: "var(--qi-font-mono)", fontSize: 13 }}
        />
        <p
          style={{
            fontSize: 11.5,
            color: "hsl(var(--qi-muted-foreground))",
            marginTop: 6,
          }}
        >
          Open your board in monday.com — the ID is the long number in the
          URL: <code>monday.com/boards/<strong>1234567890</strong></code>
        </p>
      </div>

      {schemaLoading && (
        <div
          className="imp-board-chip"
          style={{ color: "hsl(var(--qi-muted-foreground))" }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid hsl(var(--qi-muted))",
              borderTopColor: "hsl(var(--qi-primary))",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          Resolving board…
        </div>
      )}

      {schemaError && (
        <div
          className="imp-board-chip"
          style={{
            background: "hsl(0 84% 97%)",
            borderColor: "hsl(0 84% 88%)",
            color: "hsl(0 70% 35%)",
          }}
        >
          ⚠ {schemaError}
        </div>
      )}

      {schema && (
        <div className="imp-board-chip">
          <div className="imp-board-icon">📋</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="imp-board-name">{schema.name || "(unnamed board)"}</div>
            <div className="imp-board-meta">
              <span>{schema.columns.length} columns</span>
              <span>·</span>
              <span>{schema.groups.length} groups</span>
              <span>·</span>
              <code style={{ fontSize: 11 }}>{boardId}</code>
            </div>
          </div>
          {schema.hierarchyType === "multi_level" ? (
            <span
              className="imp-type-multi"
              title="Multi-level: items can have items underneath, up to 5 levels deep. New in monday API 2026-04."
            >
              MULTI-LEVEL
            </span>
          ) : (
            <span
              className="imp-type-classic"
              title="Classic: parent items + subitems on a separate subitem board."
            >
              CLASSIC
            </span>
          )}
        </div>
      )}

      {schema?.hierarchyType === "multi_level" && (
        <div
          style={{
            background: "hsl(38 92% 96%)",
            border: "1px solid hsl(38 92% 80%)",
            borderRadius: "var(--qi-radius)",
            padding: "10px 12px",
            fontSize: 12,
            color: "hsl(38 80% 28%)",
            lineHeight: 1.55,
          }}
        >
          <strong>Heads up — multi-level board.</strong> Only LEAF items
          (rows with no children) accept column-value writes; values on
          parents are computed rollups from their descendants. The Importer
          will create rows you give it, but mappings to a row that ends up
          with children will be silently ignored by monday once the
          children exist. <br />
          <br />
          monday&apos;s native multi-level XLSX exports lose the parent /
          child structure on the way out, so we don&apos;t accept them as
          import sources. Use a flat CSV with a <code>Parent</code> column
          to import children at any depth.
        </div>
      )}

      {schema?.hierarchyType === "classic" && schema.subitemBoardId && (
        <div
          style={{
            background: "hsl(220 60% 97%)",
            border: "1px solid hsl(220 60% 88%)",
            borderRadius: "var(--qi-radius)",
            padding: "10px 12px",
            fontSize: 12,
            color: "hsl(220 70% 28%)",
            lineHeight: 1.55,
          }}
        >
          <strong>Classic board.</strong> Parent items go to{" "}
          <code>{boardId}</code>; subitems will be created via the linked
          subitem board <code>{schema.subitemBoardId}</code>.
        </div>
      )}
    </div>
  );
}
