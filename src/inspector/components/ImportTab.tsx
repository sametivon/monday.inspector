import { useState, useCallback, useRef } from "react";
import type {
  ParsedFile,
  ColumnMapping,
  MondayColumn,
  ParentIdentifier,
  ImportProgress as ImportProgressType,
} from "../../utils/types";
import { parseFile } from "../../services/fileParser";
import {
  fetchBoardColumns,
  fetchSubitemBoardId,
  fetchSubitemColumns,
  runImport,
  runMondayExportImport,
  runFullMondayExportImport,
} from "../../services/mondayApi";
import { SUBITEM_NAME_SENTINEL } from "../../utils/constants";

interface ImportTabProps {
  boardId: string | null;
  token: string;
}

type ImportStep = "upload" | "map" | "importing" | "done";

const READ_ONLY_COL_TYPES = new Set([
  "mirror", "board_relation", "dependency", "creation_log",
  "formula", "auto_number", "item_id", "last_updated",
  "lookup", "color_picker", "button", "file", "subtasks",
  "name", "doc",
]);

/**
 * Auto-match file columns to board columns by title (case-insensitive).
 * Only matches to writable columns.
 */
function autoMatchMappings(
  fileHeaders: string[],
  boardCols: MondayColumn[],
): ColumnMapping[] {
  const writable = boardCols.filter((c) => !READ_ONLY_COL_TYPES.has(c.type));
  return fileHeaders
    .filter((h) => h !== "Name" && h !== "Subitems")
    .map((h) => {
      const match = writable.find(
        (c) => c.title.toLowerCase().trim() === h.toLowerCase().trim(),
      );
      return { fileColumn: h, mondayColumnId: match?.id ?? "" };
    });
}

/**
 * For monday exports: show all parent file headers and auto-match
 * to writable parent board columns by title (case-insensitive).
 * Shows all headers so users can manually map any column.
 */
function buildParentMappings(
  parentHeaders: string[],
  boardCols: MondayColumn[],
): ColumnMapping[] {
  const writable = boardCols.filter((c) => !READ_ONLY_COL_TYPES.has(c.type));

  return parentHeaders
    .filter((h) => h !== "Name" && h !== "Subitems")
    .map((h) => {
      const match = writable.find(
        (c) => c.title.toLowerCase().trim() === h.toLowerCase().trim(),
      );
      return { fileColumn: h, mondayColumnId: match?.id ?? "" };
    });
}

export function ImportTab({ boardId, token }: ImportTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [boardColumns, setBoardColumns] = useState<MondayColumn[]>([]);
  const [subitemColumns, setSubitemColumns] = useState<MondayColumn[]>([]);
  const [parentIdentifier, setParentIdentifier] = useState<ParentIdentifier>({
    type: "item_name",
    fileColumn: "",
  });
  const [subitemNameColumn, setSubitemNameColumn] = useState("");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parentMappings, setParentMappings] = useState<ColumnMapping[]>([]);
  const [includeParents, setIncludeParents] = useState(true);
  const [progress, setProgress] = useState<ImportProgressType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mappableSubitemCols = subitemColumns.filter((c) => !READ_ONLY_COL_TYPES.has(c.type));
  const mappableBoardCols = boardColumns.filter((c) => !READ_ONLY_COL_TYPES.has(c.type));

  // ── File handling ─────────────────────────────────────────────────

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      setLoading(true);
      try {
        const parsed = await parseFile(f);
        setFile(parsed);

        let bCols: MondayColumn[] = [];
        let sCols: MondayColumn[] = [];

        if (boardId && token) {
          const [bc, sbId] = await Promise.all([
            fetchBoardColumns(token, boardId),
            fetchSubitemBoardId(token, boardId),
          ]);
          bCols = bc;
          setBoardColumns(bc);
          if (sbId) {
            sCols = await fetchSubitemColumns(token, sbId);
            setSubitemColumns(sCols);
          } else {
            setSubitemColumns([]);
          }
        }

        if (parsed.kind === "monday_export") {
          // Auto-match subitem columns
          setMappings(autoMatchMappings(parsed.subitemHeaders, sCols));
          // Filter + auto-match parent columns (excludes mirrors)
          setParentMappings(buildParentMappings(parsed.parentHeaders, bCols));
          setParentIdentifier({ type: "item_name", fileColumn: "__auto__" });
          setSubitemNameColumn("__auto__");
        } else {
          setMappings(parsed.headers.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
          setParentMappings([]);
        }

        setStep("map");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [boardId, token],
  );

  // ── Import execution ──────────────────────────────────────────────

  const handleStartImport = useCallback(async () => {
    if (!file || !token || !boardId) return;

    if (file.kind === "flat") {
      if (!parentIdentifier.fileColumn) {
        setError("Select the parent column.");
        return;
      }
      if (!subitemNameColumn) {
        setError("Select the subitem name column.");
        return;
      }
    }

    setError(null);
    setStep("importing");

    const activeSub = mappings.filter(
      (m) => m.mondayColumnId && m.mondayColumnId !== SUBITEM_NAME_SENTINEL,
    );
    const activeParent = parentMappings.filter((m) => m.mondayColumnId);

    const callbacks = {
      onRowUpdate: (rowIndex: number, update: Partial<ImportProgressType["rows"][0]>) => {
        setProgress((prev) => {
          if (!prev) return prev;
          const rows = [...prev.rows];
          rows[rowIndex] = { ...rows[rowIndex], ...update };
          const succeeded = rows.filter((r) => r.status === "success").length;
          const failed = rows.filter((r) => r.status === "error").length;
          return { ...prev, rows, completed: succeeded + failed, succeeded, failed };
        });
      },
      onBatchComplete: () => {},
    };

    try {
      let result: ImportProgressType;

      if (file.kind === "monday_export" && includeParents) {
        result = await runFullMondayExportImport(
          token, file, activeParent, activeSub, boardId, boardColumns, subitemColumns, callbacks,
        );
      } else if (file.kind === "monday_export") {
        result = await runMondayExportImport(
          token, file, activeSub, boardId, subitemColumns, callbacks,
        );
      } else {
        result = await runImport(
          token, file, parentIdentifier, subitemNameColumn, activeSub, boardId, subitemColumns, callbacks,
        );
      }

      setProgress(result);
      setStep("done");
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
      setStep("done");
    }
  }, [file, token, boardId, parentIdentifier, subitemNameColumn, mappings, parentMappings, includeParents, boardColumns, subitemColumns]);

  const handleReset = () => {
    setFile(null);
    setProgress(null);
    setMappings([]);
    setParentMappings([]);
    setStep("upload");
    setError(null);
  };

  const updateMapping = (idx: number, mondayColumnId: string) => {
    setMappings((prev) => prev.map((m, i) => (i === idx ? { ...m, mondayColumnId } : m)));
  };

  const updateParentMapping = (idx: number, mondayColumnId: string) => {
    setParentMappings((prev) => prev.map((m, i) => (i === idx ? { ...m, mondayColumnId } : m)));
  };

  // ── Counts ────────────────────────────────────────────────────────

  const getCounts = () => {
    if (!file) return { parents: 0, subitems: 0, total: 0 };
    if (file.kind === "monday_export") {
      const p = includeParents ? file.groups.reduce((s, g) => s + g.items.length, 0) : 0;
      return { parents: p, subitems: file.flatSubitems.length, total: p + file.flatSubitems.length };
    }
    return { parents: 0, subitems: file.rowCount, total: file.rowCount };
  };

  const canImport = () => {
    if (!file || !token || !boardId) return false;
    if (file.kind === "monday_export") return getCounts().total > 0;
    return !!parentIdentifier.fileColumn && !!subitemNameColumn;
  };

  // ── Render ────────────────────────────────────────────────────────

  if (!boardId) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <span>Navigate to a monday.com board to import</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔑</div>
        <span>Set your API token first</span>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{
          fontSize: 11, color: "hsl(var(--destructive))", background: "hsl(var(--destructive) / 0.08)",
          padding: "8px 10px", borderRadius: 6, marginBottom: 10, border: "1px solid hsl(var(--destructive) / 0.2)",
        }}>
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            style={{
              border: "2px dashed hsl(var(--border))",
              borderRadius: 8,
              padding: "28px 16px",
              textAlign: "center",
              cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
              background: "hsl(var(--muted) / 0.3)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.background = "hsl(var(--primary) / 0.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border))"; e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
          >
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div className="spinner" />
                <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Parsing file...</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.5 }}>📥</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>Drop CSV/Excel file here</div>
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 3 }}>
                  or click to browse
                </div>
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 8 }}>
            Supports flat CSV/TSV, Excel, and monday.com board exports.
          </div>
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === "map" && file && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {file.kind === "monday_export" ? "Monday Export" : file.fileName}
              </div>
              <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 1 }}>
                {getCounts().total} rows to import
              </div>
            </div>
            <button className="btn-ghost" style={{ fontSize: 10 }} onClick={handleReset}>Change file</button>
          </div>

          {/* Flat file: parent identifier + subitem name column */}
          {file.kind === "flat" && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-label">Parent column (item name or ID)</div>
              <select
                className="editor-select"
                value={parentIdentifier.fileColumn}
                onChange={(e) => setParentIdentifier({ ...parentIdentifier, fileColumn: e.target.value })}
              >
                <option value="">— Select —</option>
                {file.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>

              <div className="section-label" style={{ marginTop: 8 }}>Subitem name column</div>
              <select
                className="editor-select"
                value={subitemNameColumn}
                onChange={(e) => setSubitemNameColumn(e.target.value)}
              >
                <option value="">— Select —</option>
                {file.headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          )}

          {/* Monday export: include parents toggle */}
          {file.kind === "monday_export" && (
            <label style={{
              display: "flex", alignItems: "center", gap: 8, fontSize: 11,
              marginBottom: 10, cursor: "pointer", padding: "6px 8px",
              borderRadius: 6, background: "hsl(var(--muted) / 0.5)",
            }}>
              <input
                type="checkbox"
                checked={includeParents}
                onChange={(e) => setIncludeParents(e.target.checked)}
                style={{ accentColor: "hsl(var(--primary))" }}
              />
              <span>
                Create parent items
                <span className="type-badge" style={{ marginLeft: 4 }}>{getCounts().parents}</span>
              </span>
            </label>
          )}

          {/* Parent column mappings */}
          {file.kind === "monday_export" && includeParents && parentMappings.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-header" style={{ marginBottom: 4 }}>
                Parent Columns
                <span className="type-badge">{parentMappings.filter((m) => m.mondayColumnId).length}/{parentMappings.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {parentMappings.map((m, i) => (
                  <div key={m.fileColumn} className="mapping-row">
                    <span className="col-name" title={m.fileColumn}>{m.fileColumn}</span>
                    <span className="arrow">→</span>
                    <select
                      className="editor-select"
                      style={{ flex: 1, minWidth: 0 }}
                      value={m.mondayColumnId}
                      onChange={(e) => updateParentMapping(i, e.target.value)}
                    >
                      <option value="">Skip</option>
                      {mappableBoardCols.map((c) => (
                        <option key={c.id} value={c.id}>{c.title} ({c.type})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="separator" />

          {/* Subitem column mappings */}
          <div style={{ marginBottom: 12 }}>
            <div className="section-header" style={{ marginBottom: 4 }}>
              {file.kind === "monday_export" ? "Subitem Columns" : "Column Mapping"}
              <span className="type-badge">{mappings.filter((m) => m.mondayColumnId).length}/{mappings.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {mappings.map((m, i) => (
                <div key={m.fileColumn} className="mapping-row">
                  <span className="col-name" title={m.fileColumn}>{m.fileColumn}</span>
                  <span className="arrow">→</span>
                  <select
                    className="editor-select"
                    style={{ flex: 1, minWidth: 0 }}
                    value={m.mondayColumnId}
                    onChange={(e) => updateMapping(i, e.target.value)}
                  >
                    <option value="">Skip</option>
                    {mappableSubitemCols.map((c) => (
                      <option key={c.id} value={c.id}>{c.title} ({c.type})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <button
            className="btn-primary"
            style={{ width: "100%", padding: "8px 12px", fontSize: 12 }}
            onClick={handleStartImport}
            disabled={!canImport()}
          >
            Start Import ({getCounts().total} rows)
          </button>
        </div>
      )}

      {/* Step 3: Progress */}
      {(step === "importing" || step === "done") && progress && (
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{step === "importing" ? "Importing..." : "Import Complete"}</span>
              <span>{progress.completed}/{progress.total}</span>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-bar-fill ${progress.failed > 0 ? "error" : "success"}`}
                style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 10 }}>
            <span style={{ color: "hsl(142 76% 36%)" }}>✓ {progress.succeeded} succeeded</span>
            {progress.failed > 0 && (
              <span style={{ color: "hsl(var(--destructive))" }}>✗ {progress.failed} failed</span>
            )}
          </div>

          {/* Error details */}
          {progress.failed > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 11, cursor: "pointer", color: "hsl(var(--destructive))", fontWeight: 500 }}>
                Show errors ({progress.failed})
              </summary>
              <div style={{ maxHeight: 150, overflowY: "auto", marginTop: 6, borderRadius: 6, border: "1px solid hsl(var(--border))" }}>
                {progress.rows
                  .filter((r) => r.status === "error")
                  .slice(0, 20)
                  .map((r) => (
                    <div key={r.rowIndex} style={{
                      fontSize: 10, padding: "4px 8px",
                      borderBottom: "1px solid hsl(var(--border) / 0.3)",
                    }}>
                      <strong>Row {r.rowIndex + 1}:</strong> {r.error}
                    </div>
                  ))}
              </div>
            </details>
          )}

          {step === "done" && (
            <button className="btn-primary" style={{ width: "100%", padding: "8px 12px", fontSize: 12 }} onClick={handleReset}>
              Import Another File
            </button>
          )}
        </div>
      )}
    </div>
  );
}
