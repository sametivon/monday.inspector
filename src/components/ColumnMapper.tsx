import React from "react";
import type {
  ColumnMapping,
  MondayColumn,
  ParsedFile,
  ParentIdentifier,
} from "../utils/types";
import { SUBITEM_NAME_SENTINEL } from "../utils/constants";

interface ColumnMapperProps {
  file: ParsedFile;
  /** Board-level columns (for parent item mapping) */
  boardColumns: MondayColumn[];
  /** Subitem-board columns (for subitem mapping) */
  subitemColumns: MondayColumn[];
  parentIdentifier: ParentIdentifier;
  onParentIdentifierChange: (pi: ParentIdentifier) => void;
  subitemNameColumn: string;
  onSubitemNameColumnChange: (col: string) => void;
  /** Subitem column mappings */
  mappings: ColumnMapping[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
  /** Parent column mappings (monday export only) */
  parentMappings: ColumnMapping[];
  onParentMappingsChange: (mappings: ColumnMapping[]) => void;
  /** Whether to also create parent items (monday export only) */
  includeParents: boolean;
  onIncludeParentsChange: (value: boolean) => void;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({
  file,
  boardColumns,
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
}) => {
  const isMondayExport = file.kind === "monday_export";

  const handleMappingTarget = (fileCol: string, mondayColId: string) => {
    const updated = mappings.map((m) =>
      m.fileColumn === fileCol ? { ...m, mondayColumnId: mondayColId } : m,
    );
    onMappingsChange(updated);
  };

  const handleParentMappingTarget = (fileCol: string, mondayColId: string) => {
    const updated = parentMappings.map((m) =>
      m.fileColumn === fileCol ? { ...m, mondayColumnId: mondayColId } : m,
    );
    onParentMappingsChange(updated);
  };

  // Filter out "name" (auto-generated) and subitems column from target options
  const mappableSubitemColumns = subitemColumns.filter(
    (c) => c.type !== "name" && c.type !== "subtasks",
  );

  // For parent mapping: exclude name and subtasks columns
  const mappableBoardColumns = boardColumns.filter(
    (c) => c.type !== "name" && c.type !== "subtasks",
  );

  // For flat files, get headers for dropdowns
  const fileHeaders = file.kind === "flat" ? file.headers : [];

  return (
    <div className="column-mapper">
      {/* ── Monday export auto-detection banner ──────────── */}
      {isMondayExport && (
        <div className="auto-detect-banner">
          ✅ <strong>Monday.com export detected!</strong> Parent items and subitem
          names are auto-mapped from the file structure.
        </div>
      )}

      {/* ── Include parents toggle (monday export only) ──── */}
      {isMondayExport && (
        <fieldset>
          <legend>Import Mode</legend>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={includeParents}
              onChange={(e) => onIncludeParentsChange(e.target.checked)}
            />
            <span>
              <strong>Also create parent items</strong>
              <br />
              <span className="hint" style={{ margin: 0 }}>
                When enabled, parent items are created first, then subitems are
                added under them. When disabled, subitems are added to existing
                parent items (matched by name).
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {/* ── Parent column mapping (monday export + includeParents) */}
      {isMondayExport && includeParents && parentMappings.length > 0 && (
        <fieldset>
          <legend>📋 Parent Item Column Mapping</legend>
          <p className="hint">
            Map parent-item columns from the export → monday.com board columns
          </p>
          <div className="mapping-grid">
            <div className="mapping-header">Export Column</div>
            <div className="mapping-header">→</div>
            <div className="mapping-header">Board Column</div>
            {parentMappings.map((m) => (
              <React.Fragment key={`parent-${m.fileColumn}`}>
                <div className="mapping-cell">{m.fileColumn}</div>
                <div className="mapping-arrow">→</div>
                <div className="mapping-cell">
                  <select
                    value={m.mondayColumnId}
                    onChange={(e) =>
                      handleParentMappingTarget(m.fileColumn, e.target.value)
                    }
                  >
                    <option value="">— skip —</option>
                    {mappableBoardColumns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>
              </React.Fragment>
            ))}
          </div>
        </fieldset>
      )}

      {/* ── Parent identifier (flat files only) ─────────── */}
      {!isMondayExport && (
        <fieldset>
          <legend>Parent Item Matching</legend>
          <div className="form-row">
            <label>Match parent by:</label>
            <select
              value={parentIdentifier.type}
              onChange={(e) =>
                onParentIdentifierChange({
                  type: e.target.value as "item_id" | "item_name",
                  fileColumn: parentIdentifier.fileColumn,
                })
              }
            >
              <option value="item_id">Item ID</option>
              <option value="item_name">Item Name</option>
            </select>
          </div>
          <div className="form-row">
            <label>File column for parent:</label>
            <select
              value={parentIdentifier.fileColumn}
              onChange={(e) =>
                onParentIdentifierChange({
                  ...parentIdentifier,
                  fileColumn: e.target.value,
                })
              }
            >
              <option value="">— select —</option>
              {fileHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      )}

      {/* ── Subitem name column (flat files only) ────────── */}
      {!isMondayExport && (
        <fieldset>
          <legend>Subitem Name</legend>
          <div className="form-row">
            <label>File column for subitem name:</label>
            <select
              value={subitemNameColumn}
              onChange={(e) => onSubitemNameColumnChange(e.target.value)}
            >
              <option value="">— select —</option>
              {fileHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      )}

      {/* ── Subitem column value mappings ─────────────────── */}
      {mappings.length > 0 && (
        <fieldset>
          <legend>
            {isMondayExport ? "📎 Subitem Column Mapping" : "Column Mapping"}
          </legend>
          <p className="hint">
            {isMondayExport
              ? "Map subitem columns from the export → monday.com subitem column IDs"
              : "Map your file columns → monday.com subitem columns"}
          </p>
          <div className="mapping-grid">
            <div className="mapping-header">
              {isMondayExport ? "Export Column" : "File Column"}
            </div>
            <div className="mapping-header">→</div>
            <div className="mapping-header">Monday Column</div>
            {mappings.map((m) => (
              <React.Fragment key={m.fileColumn}>
                <div className="mapping-cell">{m.fileColumn}</div>
                <div className="mapping-arrow">→</div>
                <div className="mapping-cell">
                  <select
                    value={m.mondayColumnId}
                    onChange={(e) =>
                      handleMappingTarget(m.fileColumn, e.target.value)
                    }
                  >
                    <option value="">— skip —</option>
                    {!isMondayExport && (
                      <option value={SUBITEM_NAME_SENTINEL}>
                        Subitem Name (title)
                      </option>
                    )}
                    {mappableSubitemColumns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.type})
                      </option>
                    ))}
                  </select>
                </div>
              </React.Fragment>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
};
