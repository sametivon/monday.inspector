import type { BoardSchema } from "../../services/mondayApi";
import type {
  ColumnMapping,
  MondayColumn,
  ParentIdentifier,
  ParsedFile,
} from "../../utils/types";
import { SUBITEM_NAME_SENTINEL } from "../../utils/constants";
import { READ_ONLY_COLUMN_TYPES } from "../../services/columnValueFormatters";

interface Props {
  file: ParsedFile;
  schema: BoardSchema;
  subitemColumns: MondayColumn[];
  parentIdentifier: ParentIdentifier;
  onParentIdentifierChange: (p: ParentIdentifier) => void;
  subitemNameColumn: string;
  onSubitemNameColumnChange: (col: string) => void;
  mappings: ColumnMapping[];
  onMappingsChange: (m: ColumnMapping[]) => void;
  parentMappings: ColumnMapping[];
  onParentMappingsChange: (m: ColumnMapping[]) => void;
  includeParents: boolean;
  onIncludeParentsChange: (v: boolean) => void;
}

// Centralised — same set used by formatColumnValueForApi so the mapper UI
// matches what the import orchestrator will actually try to write. Note
// that board_relation/dependency are SUPPORTED writes (you can connect
// items by id) so they're absent here on purpose.
const READ_ONLY = READ_ONLY_COLUMN_TYPES;

/**
 * Step-3 mapper. Renders two big cards stacked vertically:
 *
 *   1. "Mode" — flat CSV vs monday board-export (auto-detected, but the
 *      includeParents toggle lives here)
 *   2. The actual mapping table(s).
 *
 * Multi-level boards collapse parent + subitem mapping into one table since
 * children share the parent column schema.
 */
export function ColumnMapper(props: Props) {
  const {
    file,
    schema,
    subitemColumns,
    parentIdentifier,
    onParentIdentifierChange,
    subitemNameColumn,
    onSubitemNameColumnChange,
    mappings,
    onMappingsChange,
    parentMappings,
    onParentMappingsChange,
    includeParents,
    onIncludeParentsChange,
  } = props;

  const writableSubitemCols = subitemColumns.filter(
    (c) => !READ_ONLY.has(c.type),
  );
  const writableBoardCols = schema.columns.filter((c) => !READ_ONLY.has(c.type));

  // Mirror + formula + computed columns we silently dropped — surface the
  // count and the names so users aren't confused why they're missing.
  const skippedBoardCols = schema.columns.filter((c) => READ_ONLY.has(c.type));
  const skippedSubitemCols = subitemColumns.filter((c) => READ_ONLY.has(c.type));

  // Multi-level board exports lose hierarchy information on the way out of
  // monday.com — flag this prominently so users don't expect the importer
  // to magically reconstruct it.
  const isMultiLevelExport =
    file.kind === "flat" && !!file.mondayMultiLevel;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {isMultiLevelExport && (
        <div
          style={{
            padding: "12px 14px",
            background: "hsl(38 92% 96%)",
            border: "1px solid hsl(38 92% 80%)",
            borderRadius: "var(--qi-radius)",
            fontSize: 12.5,
            color: "hsl(38 80% 28%)",
            lineHeight: 1.55,
          }}
        >
          <strong>Multi-level board export detected.</strong>{" "}
          monday.com&apos;s multi-level XLSX export does not preserve the
          parent/child hierarchy — every row will be created as a top-level
          item. To re-create the hierarchy, add a <code>Parent</code> column
          to a CSV with the parent item&apos;s name in each child row, then
          upload that CSV instead.
        </div>
      )}

      {(skippedBoardCols.length > 0 || skippedSubitemCols.length > 0) && (
        <details
          style={{
            border: "1px solid hsl(var(--qi-border))",
            borderRadius: "var(--qi-radius-sm)",
            background: "hsl(var(--qi-bg))",
            fontSize: 12,
          }}
        >
          <summary
            style={{
              padding: "8px 12px",
              cursor: "pointer",
              userSelect: "none",
              color: "hsl(var(--qi-fg-soft))",
            }}
          >
            <strong>{skippedBoardCols.length + skippedSubitemCols.length}</strong>{" "}
            non-writable column
            {skippedBoardCols.length + skippedSubitemCols.length === 1 ? "" : "s"}
            {" "}skipped (mirror, formula, auto-number, file, etc.) — click to
            view
          </summary>
          <div
            style={{
              padding: "8px 12px 12px",
              borderTop: "1px solid hsl(var(--qi-border))",
              color: "hsl(var(--qi-muted-foreground))",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {skippedBoardCols.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, color: "hsl(var(--qi-fg-soft))", marginBottom: 4 }}>
                  Parent columns
                </div>
                {skippedBoardCols.map((c) => (
                  <span
                    key={c.id}
                    style={{
                      display: "inline-block",
                      margin: "2px 6px 2px 0",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "hsl(var(--qi-muted))",
                      fontSize: 11,
                    }}
                  >
                    {c.title}{" "}
                    <span style={{ opacity: 0.55, fontFamily: "var(--qi-font-mono)" }}>
                      ({c.type})
                    </span>
                  </span>
                ))}
              </div>
            )}
            {skippedSubitemCols.length > 0 && schema.hierarchyType !== "multi_level" && (
              <div>
                <div style={{ fontWeight: 600, color: "hsl(var(--qi-fg-soft))", marginBottom: 4 }}>
                  Subitem columns
                </div>
                {skippedSubitemCols.map((c) => (
                  <span
                    key={c.id}
                    style={{
                      display: "inline-block",
                      margin: "2px 6px 2px 0",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "hsl(var(--qi-muted))",
                      fontSize: 11,
                    }}
                  >
                    {c.title}{" "}
                    <span style={{ opacity: 0.55, fontFamily: "var(--qi-font-mono)" }}>
                      ({c.type})
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Mode picker */}
      {file.kind === "monday_export" && (
        <div>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "hsl(var(--qi-fg-soft))",
              marginBottom: 6,
            }}
          >
            What do you want to import?
          </div>
          <div className="imp-mode-grid">
            <button
              className={`imp-mode-card ${includeParents ? "active" : ""}`}
              onClick={() => onIncludeParentsChange(true)}
            >
              <div className="imp-mode-card-title">
                ⚡ Parents + subitems
                <span className="qi-cat-tag">recommended</span>
              </div>
              <div className="imp-mode-card-desc">
                Two-phase: creates parent items first, then nests children
                under them automatically. Best for full board copies.
              </div>
            </button>
            <button
              className={`imp-mode-card ${!includeParents ? "active" : ""}`}
              onClick={() => onIncludeParentsChange(false)}
            >
              <div className="imp-mode-card-title">📎 Subitems only</div>
              <div className="imp-mode-card-desc">
                Only creates subitems. Parents must already exist on the
                target board with matching names.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Flat CSV: parent identifier + subitem name */}
      {file.kind === "flat" && (
        <div
          style={{
            background: "hsl(var(--qi-bg))",
            border: "1px solid hsl(var(--qi-border))",
            borderRadius: "var(--qi-radius)",
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: "hsl(var(--qi-fg-soft))",
              marginBottom: 10,
            }}
          >
            How will we find each row&apos;s parent?
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label
                style={{
                  fontSize: 11.5,
                  color: "hsl(var(--qi-muted-foreground))",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Parent identifier
              </label>
              <select
                className="qi-select"
                value={`${parentIdentifier.type}:${parentIdentifier.fileColumn}`}
                onChange={(e) => {
                  const [type, fileColumn] = e.target.value.split(":") as [
                    "item_id" | "item_name",
                    string,
                  ];
                  onParentIdentifierChange({ type, fileColumn });
                }}
              >
                <option value="item_name:">Match parent by name…</option>
                <option value="item_id:">Match parent by ID…</option>
                {file.headers.flatMap((h) => [
                  <option key={`name:${h}`} value={`item_name:${h}`}>
                    Match by NAME → "{h}"
                  </option>,
                  <option key={`id:${h}`} value={`item_id:${h}`}>
                    Match by ID → "{h}"
                  </option>,
                ])}
              </select>
            </div>
            <div>
              <label
                style={{
                  fontSize: 11.5,
                  color: "hsl(var(--qi-muted-foreground))",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Subitem name column
              </label>
              <select
                className="qi-select"
                value={subitemNameColumn}
                onChange={(e) => onSubitemNameColumnChange(e.target.value)}
              >
                <option value="">Pick the file column…</option>
                {file.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Parent mapping (monday export + includeParents only) */}
      {file.kind === "monday_export" && includeParents && (
        <MappingTable
          title={
            schema.hierarchyType === "multi_level"
              ? "Parent items mapping"
              : `Parent mapping → board ${schema.columns.length} columns`
          }
          fileHeaders={parentMappingHeaders(file)}
          mappings={parentMappings}
          onMappingsChange={onParentMappingsChange}
          targetCols={writableBoardCols}
        />
      )}

      {/* Subitem mapping */}
      {file.kind === "monday_export" ? (
        <MappingTable
          title={
            schema.hierarchyType === "multi_level"
              ? "Child items mapping (same column schema)"
              : `Subitem mapping → ${writableSubitemCols.length} writable columns`
          }
          fileHeaders={file.subitemHeaders.filter((h) => h !== "Name")}
          mappings={mappings}
          onMappingsChange={onMappingsChange}
          targetCols={writableSubitemCols}
        />
      ) : (
        <MappingTable
          title="Column mapping"
          fileHeaders={file.headers}
          mappings={mappings}
          onMappingsChange={onMappingsChange}
          targetCols={writableSubitemCols}
        />
      )}
    </div>
  );
}

function parentMappingHeaders(
  file: Extract<ParsedFile, { kind: "monday_export" }>,
): string[] {
  return file.parentHeaders.filter((h) => h !== "Name" && h !== "Subitems");
}

interface MappingTableProps {
  title: string;
  fileHeaders: string[];
  mappings: ColumnMapping[];
  onMappingsChange: (m: ColumnMapping[]) => void;
  targetCols: MondayColumn[];
}

function MappingTable({
  title,
  fileHeaders,
  mappings,
  onMappingsChange,
  targetCols,
}: MappingTableProps) {
  // Keep a stable mapping order matching fileHeaders so the UI doesn't reshuffle
  const byHeader = new Map(mappings.map((m) => [m.fileColumn, m]));
  const ordered = fileHeaders.map(
    (h) => byHeader.get(h) ?? { fileColumn: h, mondayColumnId: "" },
  );

  const setOne = (fileColumn: string, mondayColumnId: string) => {
    const next = ordered.map((m) =>
      m.fileColumn === fileColumn ? { ...m, mondayColumnId } : m,
    );
    onMappingsChange(next);
  };

  const matchedCount = ordered.filter((m) => m.mondayColumnId).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "hsl(var(--qi-fg-soft))",
          }}
        >
          {title}
        </div>
        <span className="qi-meta-pill">
          {matchedCount} / {ordered.length} mapped
        </span>
      </div>
      <div
        style={{
          background: "hsl(var(--qi-surface))",
          border: "1px solid hsl(var(--qi-border))",
          borderRadius: "var(--qi-radius)",
          overflow: "hidden",
        }}
      >
        {ordered.map((m) => (
          <div className="imp-mapping-row" key={m.fileColumn}>
            <div className="imp-mapping-source" title={m.fileColumn}>
              {m.fileColumn}
            </div>
            <div className="imp-mapping-arrow">→</div>
            <select
              className="qi-select"
              value={m.mondayColumnId}
              onChange={(e) => setOne(m.fileColumn, e.target.value)}
            >
              <option value="">— skip —</option>
              <option value={SUBITEM_NAME_SENTINEL}>(use as item name)</option>
              {targetCols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} <span style={{ opacity: 0.6 }}>({c.type})</span>
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
