import { useState, useCallback, useRef, useEffect } from "react";
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

/** Format seconds into mm:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Live Progress Component ─────────────────────────────────────────

function ImportProgressView({
  progress,
  isDone,
  onReset,
  startTime,
}: {
  progress: ImportProgressType;
  isDone: boolean;
  onReset: () => void;
  startTime: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Elapsed timer
  useEffect(() => {
    if (isDone) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isDone, startTime]);

  // Auto-scroll to latest active row
  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('[data-status="importing"]');
      if (active) {
        active.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [progress.completed]);

  const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const rate = elapsed > 0 ? progress.completed / elapsed : 0;
  const remaining = rate > 0 ? Math.ceil((progress.total - progress.completed) / rate) : 0;

  return (
    <div>
      {/* Header stats */}
      <div className="card" style={{ marginBottom: 10, padding: "10px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isDone && <div className="spinner" style={{ width: 14, height: 14 }} />}
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {isDone ? "Import Complete" : "Importing..."}
            </span>
          </div>
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>
            {formatTime(elapsed)}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4, color: "hsl(var(--muted-foreground))" }}>
            <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>
              {Math.round(pct)}%
            </span>
            <span>{progress.completed} / {progress.total} rows</span>
          </div>
          <div className="progress-bar" style={{ height: 8, borderRadius: 4 }}>
            <div
              className={`progress-bar-fill ${isDone ? (progress.failed > 0 ? "error" : "success") : ""}`}
              style={{
                width: `${pct}%`,
                borderRadius: 4,
                transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <div style={{
            flex: 1, minWidth: 70, padding: "6px 8px", borderRadius: 8,
            background: "hsl(150 60% 46% / 0.08)", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "hsl(150 60% 36%)" }}>
              {progress.succeeded}
            </div>
            <div style={{ fontSize: 9, color: "hsl(150 60% 40%)", fontWeight: 600 }}>Success</div>
          </div>
          {progress.failed > 0 && (
            <div style={{
              flex: 1, minWidth: 70, padding: "6px 8px", borderRadius: 8,
              background: "hsl(0 72% 56% / 0.08)", textAlign: "center",
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "hsl(0 72% 45%)" }}>
                {progress.failed}
              </div>
              <div style={{ fontSize: 9, color: "hsl(0 72% 50%)", fontWeight: 600 }}>Failed</div>
            </div>
          )}
          <div style={{
            flex: 1, minWidth: 70, padding: "6px 8px", borderRadius: 8,
            background: "hsl(var(--muted) / 0.5)", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "hsl(var(--foreground))" }}>
              {progress.total - progress.completed}
            </div>
            <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>Remaining</div>
          </div>
        </div>

        {/* ETA */}
        {!isDone && remaining > 0 && (
          <div style={{
            marginTop: 8, fontSize: 10, color: "hsl(var(--muted-foreground))",
            textAlign: "center", fontStyle: "italic",
          }}>
            ~{formatTime(remaining)} remaining ({rate.toFixed(1)} rows/sec)
          </div>
        )}
      </div>

      {/* Live row list */}
      <div style={{ marginBottom: 10 }}>
        <div className="section-header" style={{ marginBottom: 6 }}>
          <span>Row Details</span>
          <span className="type-badge" style={{ fontSize: 9 }}>{progress.rows.length}</span>
        </div>
        <div
          ref={listRef}
          style={{
            maxHeight: 200,
            overflowY: "auto",
            borderRadius: 10,
            border: "1px solid hsl(var(--border) / 0.6)",
            background: "hsl(var(--card))",
          }}
        >
          {progress.rows.map((row) => (
            <div
              key={`${row.kind}-${row.rowIndex}`}
              data-status={row.status}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderBottom: "1px solid hsl(var(--border) / 0.25)",
                fontSize: 11,
                transition: "all 0.2s ease",
                background: row.status === "importing"
                  ? "hsl(256 72% 56% / 0.04)"
                  : row.status === "error"
                  ? "hsl(0 72% 56% / 0.03)"
                  : row.status === "success"
                  ? "hsl(150 60% 46% / 0.02)"
                  : "transparent",
              }}
            >
              {/* Status icon */}
              <div style={{ width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {row.status === "pending" && (
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "hsl(var(--muted-foreground) / 0.2)",
                  }} />
                )}
                {row.status === "importing" && (
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                )}
                {row.status === "success" && (
                  <span style={{ color: "hsl(150 60% 42%)", fontSize: 14, fontWeight: 700 }}>✓</span>
                )}
                {row.status === "error" && (
                  <span style={{ color: "hsl(0 72% 50%)", fontSize: 14, fontWeight: 700 }}>✗</span>
                )}
              </div>

              {/* Row kind badge */}
              <span style={{
                fontSize: 8, fontWeight: 700, textTransform: "uppercase",
                padding: "1px 5px", borderRadius: 4, flexShrink: 0,
                background: row.kind === "parent" ? "hsl(256 72% 56% / 0.1)" : "hsl(200 80% 50% / 0.1)",
                color: row.kind === "parent" ? "hsl(256 72% 48%)" : "hsl(200 80% 40%)",
              }}>
                {row.kind === "parent" ? "item" : "sub"}
              </span>

              {/* Item name */}
              <span style={{
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                color: row.status === "error" ? "hsl(0 72% 50%)" : "hsl(var(--foreground))",
                fontWeight: row.status === "importing" ? 600 : 400,
              }}>
                {row.itemName || `Row ${row.rowIndex + 1}`}
              </span>

              {/* Error text */}
              {row.error && (
                <span style={{
                  fontSize: 9, color: "hsl(0 72% 50%)", maxWidth: 120,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  flexShrink: 0,
                }} title={row.error}>
                  {row.error}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Done actions */}
      {isDone && (
        <div style={{ animation: "fadeInUp 0.3s ease" }}>
          {progress.failed === 0 && (
            <div className="status-message success" style={{ marginBottom: 10, textAlign: "center", fontSize: 12 }}>
              All {progress.succeeded} rows imported successfully!
            </div>
          )}
          <button
            className="btn-primary"
            style={{ width: "100%", padding: "10px 12px", fontSize: 12 }}
            onClick={onReset}
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ImportTab ──────────────────────────────────────────────────

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
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [importStartTime, setImportStartTime] = useState(0);

  const mappableSubitemCols = subitemColumns.filter((c) => !READ_ONLY_COL_TYPES.has(c.type));
  const mappableBoardCols = boardColumns.filter((c) => !READ_ONLY_COL_TYPES.has(c.type));

  // ── File handling ─────────────────────────────────────────────────

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      setLoading(true);
      setUploadSuccess(false);
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
          setMappings(autoMatchMappings(parsed.subitemHeaders, sCols));
          setParentMappings(buildParentMappings(parsed.parentHeaders, bCols));
          setParentIdentifier({ type: "item_name", fileColumn: "__auto__" });
          setSubitemNameColumn("__auto__");
        } else {
          setMappings(parsed.headers.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
          setParentMappings([]);
        }

        setUploadSuccess(true);
        setTimeout(() => {
          setUploadSuccess(false);
          setStep("map");
        }, 600);
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
    setImportStartTime(Date.now());

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
    setImportStartTime(0);
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
        <div className="status-message error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* "Open full Importer" hand-off — full page is much clearer for big imports */}
      {step === "upload" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            marginBottom: 8,
            background: "linear-gradient(135deg, hsl(256 72% 96%), hsl(256 72% 99%))",
            border: "1px solid hsl(256 72% 88%)",
            borderRadius: 8,
            fontSize: 11,
          }}
        >
          <span style={{ fontSize: 14 }}>↗</span>
          <div style={{ flex: 1, lineHeight: 1.45 }}>
            <strong style={{ color: "hsl(256 72% 36%)" }}>Use the full Importer</strong> for the
            best experience — clear stepper, multi-level board support, big mapping table.
          </div>
          <button
            className="btn-primary"
            style={{ padding: "5px 9px", fontSize: 10, whiteSpace: "nowrap" }}
            onClick={() => {
              const url =
                typeof chrome !== "undefined" && chrome.runtime?.getURL
                  ? chrome.runtime.getURL("src/import/index.html")
                  : "/src/import/index.html";
              const sep = boardId ? "?boardId=" + boardId : "";
              window.open(`${url}${sep}`, "_blank", "noopener,noreferrer");
            }}
          >
            Open Importer
          </button>
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
            onClick={() => !loading && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = "hsl(256 72% 56%)"; e.currentTarget.style.background = "hsl(256 72% 56% / 0.06)"; }}
            onDragLeave={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border))"; e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "hsl(var(--border))";
              e.currentTarget.style.background = "hsl(var(--muted) / 0.3)";
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            style={{
              border: "2px dashed hsl(var(--border))",
              borderRadius: 12,
              padding: "32px 16px",
              textAlign: "center",
              cursor: loading ? "wait" : "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              background: uploadSuccess ? "hsl(150 60% 46% / 0.06)" : "hsl(var(--muted) / 0.3)",
              borderColor: uploadSuccess ? "hsl(150 60% 46%)" : undefined,
            }}
            onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "hsl(var(--primary))"; e.currentTarget.style.background = "hsl(var(--primary) / 0.04)"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
            onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.borderColor = "hsl(var(--border))"; e.currentTarget.style.background = "hsl(var(--muted) / 0.3)"; e.currentTarget.style.transform = "translateY(0)"; } }}
          >
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <div className="spinner" />
                <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>Parsing file...</span>
              </div>
            ) : uploadSuccess ? (
              <div style={{ animation: "popIn 0.3s ease" }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>✓</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "hsl(150 60% 36%)" }}>File parsed successfully!</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>📥</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))" }}>Drop CSV/Excel file here</div>
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                  or click to browse
                </div>
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 8, textAlign: "center" }}>
            Supports flat CSV/TSV, Excel, and monday.com board exports.
          </div>
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === "map" && file && (
        <div>
          <div className="card" style={{ marginBottom: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {file.kind === "monday_export" ? "Monday Export" : file.fileName}
                </div>
                <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                  {getCounts().total} rows to import
                  {file.kind === "monday_export" && (
                    <span> ({getCounts().parents} items, {getCounts().subitems} subitems)</span>
                  )}
                </div>
              </div>
              <button className="btn-ghost" style={{ fontSize: 10 }} onClick={handleReset}>Change</button>
            </div>
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
              marginBottom: 10, cursor: "pointer", padding: "8px 10px",
              borderRadius: 8, background: "hsl(var(--muted) / 0.5)",
              transition: "background 0.15s",
            }}>
              <input
                type="checkbox"
                checked={includeParents}
                onChange={(e) => setIncludeParents(e.target.checked)}
                style={{ accentColor: "hsl(var(--primary))" }}
              />
              <span>
                Create parent items
                <span className="type-badge" style={{ marginLeft: 6 }}>{getCounts().parents}</span>
              </span>
            </label>
          )}

          {/* Parent column mappings */}
          {file.kind === "monday_export" && includeParents && parentMappings.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="section-header" style={{ marginBottom: 6 }}>
                Parent Columns
                <span className="type-badge" style={{ background: "hsl(150 60% 46% / 0.1)", color: "hsl(150 60% 36%)" }}>
                  {parentMappings.filter((m) => m.mondayColumnId).length}/{parentMappings.length} mapped
                </span>
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
          <div style={{ marginBottom: 14 }}>
            <div className="section-header" style={{ marginBottom: 6 }}>
              {file.kind === "monday_export" ? "Subitem Columns" : "Column Mapping"}
              <span className="type-badge" style={{ background: "hsl(200 80% 50% / 0.1)", color: "hsl(200 80% 40%)" }}>
                {mappings.filter((m) => m.mondayColumnId).length}/{mappings.length} mapped
              </span>
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
            style={{ width: "100%", padding: "10px 12px", fontSize: 12.5 }}
            onClick={handleStartImport}
            disabled={!canImport()}
          >
            Start Import ({getCounts().total} rows)
          </button>
        </div>
      )}

      {/* Step 3 & 4: Progress & Done */}
      {(step === "importing" || step === "done") && progress && (
        <ImportProgressView
          progress={progress}
          isDone={step === "done"}
          onReset={handleReset}
          startTime={importStartTime}
        />
      )}
    </div>
  );
}
