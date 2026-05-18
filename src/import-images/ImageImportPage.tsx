import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  fetchBoardSchema,
  type BoardSchema,
} from "../services/mondayApi";
import { patchZip64Headers } from "../services/zip64Patcher";
import {
  extractImagesFromXlsx,
  type ImageExtractionResult,
} from "../services/excelImageExtractor";
import {
  runImageImport,
  type ImageImportProgress,
  type ImageMatchInput,
  type MatchMode,
} from "../services/monday/imageImportOrchestrator";
import type { MondayColumn } from "../utils/types";
import { Stepper } from "../import/components/Stepper";
import { BoardCard } from "../import/components/BoardCard";
import { TokenSetupCard } from "../query/components/TokenSetupCard";

// Bulk-image importer: Excel-anchored images → monday.com File column.
//
// The feature most-requested in the monday Community and never natively
// supported. We take an .xlsx with images pasted into cells, pull the
// embedded media out of the zip, anchor each image to its row, then upload
// to a File column on items matched by name or ID.
//
// Pipeline mirrors the main Importer's four-step shape so the design
// language stays consistent:
//   1. Connect      — token + board id
//   2. Upload       — .xlsx with embedded images (we parse rows + extract)
//   3. Map          — match column (item name | item id) + target file column
//   4. Run          — live per-image progress with retry-able failures

type Step = 1 | 2 | 3 | 4;

interface ParsedRows {
  headers: string[];
  rows: Record<string, string>[];
}

interface UploadState {
  /** Raw row data parsed from the spreadsheet (data rows only, no header) */
  rows: ParsedRows;
  /** Images extracted from the xlsx, keyed by data-row index */
  images: ImageExtractionResult;
  fileName: string;
}

export function ImageImportPage() {
  // ── Bootstrap ──────────────────────────────────────────────────────────
  const [token, setToken] = useState<string>("");
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [boardId, setBoardId] = useState<string>("");
  const [schema, setSchema] = useState<BoardSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // ── File state ─────────────────────────────────────────────────────────
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Mapping state ──────────────────────────────────────────────────────
  const [matchMode, setMatchMode] = useState<MatchMode>("item_name");
  const [matchColumn, setMatchColumn] = useState<string>("");
  const [fileColumnId, setFileColumnId] = useState<string>("");

  // ── Run state ──────────────────────────────────────────────────────────
  const [progress, setProgress] = useState<ImageImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // ── Restore token + boardId from extension storage / URL ───────────────
  useEffect(() => {
    const finishToken = (t: string) => {
      setToken(t);
      setTokenLoaded(true);
    };
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["monday_api_token", "current_board_id"], (r) => {
        finishToken((r.monday_api_token as string) ?? "");
        const params = new URLSearchParams(window.location.search);
        const urlBoard = params.get("boardId");
        if (urlBoard) setBoardId(urlBoard);
        else if (r.current_board_id) setBoardId(r.current_board_id as string);
      });
    } else {
      finishToken(localStorage.getItem("monday_api_token") ?? "");
      const params = new URLSearchParams(window.location.search);
      const urlBoard = params.get("boardId");
      if (urlBoard) setBoardId(urlBoard);
    }
  }, []);

  // ── Resolve schema on token+boardId change ─────────────────────────────
  useEffect(() => {
    if (!token || !boardId) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    setSchemaLoading(true);
    setSchemaError(null);
    setSchema(null);
    fetchBoardSchema(token, boardId)
      .then((s) => {
        if (!cancelled) setSchema(s);
      })
      .catch((err) => {
        if (!cancelled) setSchemaError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, boardId]);

  // ── File columns the user can target ───────────────────────────────────
  const fileColumns = useMemo<MondayColumn[]>(() => {
    if (!schema) return [];
    return schema.columns.filter((c) => c.type === "file");
  }, [schema]);

  // Auto-pick the first file column once the schema loads, so the user only
  // has to choose if their board has multiple.
  useEffect(() => {
    if (fileColumns.length > 0 && !fileColumnId) {
      setFileColumnId(fileColumns[0].id);
    }
  }, [fileColumns, fileColumnId]);

  // ── Derived state ──────────────────────────────────────────────────────
  const currentStep: Step = useMemo(() => {
    if (running || progress) return 4;
    if (upload && schema) return 3;
    if (token && schema) return 2;
    return 1;
  }, [running, progress, upload, schema, token]);

  // The user picks ONE column to match items by. We default to the first
  // header that looks like a name/id field, but always let the user override.
  useEffect(() => {
    if (!upload || matchColumn) return;
    const headers = upload.rows.headers;
    const guess = headers.find((h) => /name|item/i.test(h)) ?? headers[0] ?? "";
    setMatchColumn(guess);
    if (/id/i.test(guess)) setMatchMode("item_id");
  }, [upload, matchColumn]);

  const matchPreview = useMemo(() => {
    if (!upload || !matchColumn) return { matched: 0, total: 0 };
    let total = 0;
    let matched = 0;
    for (let i = 0; i < upload.rows.rows.length; i++) {
      const imgs = upload.images.byRow.get(i + 1) ?? [];
      if (imgs.length === 0) continue;
      total += imgs.length;
      const key = upload.rows.rows[i][matchColumn]?.trim();
      if (key) matched += imgs.length;
    }
    return { matched, total };
  }, [upload, matchColumn]);

  const canRun = !!(
    token &&
    schema &&
    upload &&
    upload.images.images.length > 0 &&
    fileColumnId &&
    matchColumn
  );

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleTokenSaved = useCallback((t: string) => {
    setToken(t);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ monday_api_token: t });
    } else {
      localStorage.setItem("monday_api_token", t);
    }
  }, []);

  const handleFile = useCallback(async (incoming: File) => {
    setFileError(null);
    setUpload(null);
    setMatchColumn("");
    try {
      const ext = incoming.name.split(".").pop()?.toLowerCase();
      if (ext !== "xlsx") {
        throw new Error(
          "Image import requires an .xlsx file (embedded images live in xlsx's package). Save your spreadsheet as .xlsx and try again.",
        );
      }
      const raw = new Uint8Array(await incoming.arrayBuffer());
      // monday.com's XLSX exports use ZIP64 envelopes — patch them so xlsx
      // can read row data. Image extraction goes through JSZip which handles
      // ZIP64 natively, so it sees the un-patched buffer cleanly.
      const buffer = patchZip64Headers(raw);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("Excel file contains no sheets");
      const sheet = workbook.Sheets[sheetName];
      const sheetJson = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: "",
        raw: false,
      });
      const headers = Object.keys(sheetJson[0] ?? {});
      const rows = sheetJson;

      const images = await extractImagesFromXlsx(raw);
      if (images.images.length === 0) {
        throw new Error(
          "No embedded images found in this xlsx. Make sure your images are pasted into cells (not just URLs) — Excel anchors them when you do Insert → Picture or paste from clipboard.",
        );
      }

      setUpload({
        rows: { headers, rows },
        images,
        fileName: incoming.name,
      });
    } catch (err) {
      setFileError((err as Error).message);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!upload || !token || !schema || !matchColumn || !fileColumnId) return;

    setRunning(true);
    setRunError(null);

    // Flatten the xlsx into one orchestrator input per (row, image) pair.
    // Image anchor rows are 0-based AT THE SPREADSHEET LEVEL, where row 0 is
    // the header row → data row N lives at spreadsheet row N+1.
    const inputs: ImageMatchInput[] = [];
    for (let i = 0; i < upload.rows.rows.length; i++) {
      const spreadsheetRow = i + 1; // skip header
      const imgs = upload.images.byRow.get(spreadsheetRow);
      if (!imgs?.length) continue;
      const matchKey = upload.rows.rows[i][matchColumn]?.trim();
      if (!matchKey) continue;
      for (const img of imgs) {
        inputs.push({
          rowIndex: spreadsheetRow,
          matchKey,
          fileName: img.fileName,
          data: img.data,
          mimeType: img.mimeType,
        });
      }
    }

    if (inputs.length === 0) {
      setRunError(
        "No rows had both an anchored image and a non-empty value in the match column.",
      );
      setRunning(false);
      return;
    }

    const initial: ImageImportProgress = {
      total: inputs.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      rows: inputs.map((inp) => ({
        rowIndex: inp.rowIndex,
        matchKey: inp.matchKey,
        itemId: "",
        fileName: inp.fileName,
        size: inp.data.byteLength,
        status: "pending" as const,
      })),
    };
    setProgress(initial);

    try {
      const result = await runImageImport(
        token,
        boardId,
        fileColumnId,
        matchMode,
        inputs,
        {
          onRowUpdate: (rowIndex, update) => {
            setProgress((prev) => {
              if (!prev) return prev;
              const rows = [...prev.rows];
              if (rowIndex < 0 || rowIndex >= rows.length) return prev;
              rows[rowIndex] = { ...rows[rowIndex], ...update };
              const succeeded = rows.filter((r) => r.status === "success").length;
              const failed = rows.filter((r) => r.status === "error").length;
              return {
                ...prev,
                rows,
                completed: succeeded + failed,
                succeeded,
                failed,
              };
            });
          },
          onBatchComplete: (snapshot) => {
            setProgress((prev) => (prev ? { ...prev, ...snapshot, rows: prev.rows } : prev));
          },
        },
      );
      setProgress(result);
    } catch (err) {
      setRunError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }, [upload, token, schema, boardId, matchColumn, matchMode, fileColumnId]);

  const handleReset = () => {
    setUpload(null);
    setProgress(null);
    setRunError(null);
    setMatchColumn("");
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="imp-shell">
      <header className="qi-topbar">
        <a
          className="qi-brand"
          href="https://mondayinspector.eu"
          target="_blank"
          rel="noopener noreferrer"
        >
          <BrandMark />
          <span>monday.inspector</span>
        </a>
        <div className="qi-brand-divider" />
        <span className="qi-page-title">Image Importer</span>
        <div className="qi-topbar-spacer" />
        <a
          className="qi-btn qi-btn-sm qi-btn-ghost"
          href={chromeUrl("src/import/index.html")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open CSV Importer ↗
        </a>
      </header>

      <main className="imp-main">
        <div className="imp-canvas">
          <Stepper
            currentStep={currentStep}
            steps={["Connect", "Upload .xlsx", "Match items", "Upload images"]}
          />

          {/* Step 1 — Connect */}
          <section className="imp-card" id="step-1">
            <header className="imp-card-h">
              <div className="imp-card-num">1</div>
              <div>
                <h2 className="imp-card-title">Connect to monday.com</h2>
                <p className="imp-card-sub">
                  Paste your API token and the board ID that contains the
                  items you want to attach images to. We&apos;ll list the file
                  columns on that board in step&nbsp;3.
                </p>
              </div>
            </header>

            {!tokenLoaded ? (
              <p style={{ color: "hsl(var(--qi-muted-foreground))" }}>Loading…</p>
            ) : !token ? (
              <TokenSetupCard onSave={handleTokenSaved} />
            ) : (
              <BoardCard
                boardId={boardId}
                onBoardIdChange={setBoardId}
                schema={schema}
                schemaLoading={schemaLoading}
                schemaError={schemaError}
              />
            )}
          </section>

          {/* Step 2 — Upload xlsx */}
          {token && schema && (
            <section className="imp-card" id="step-2">
              <header className="imp-card-h">
                <div className="imp-card-num">2</div>
                <div>
                  <h2 className="imp-card-title">Upload your Excel file</h2>
                  <p className="imp-card-sub">
                    .xlsx only — images need to be pasted/inserted into cells
                    so Excel anchors them to a row. URLs in text cells are not
                    supported (yet). Up to ~50&nbsp;MB. Stays in your browser.
                  </p>
                </div>
              </header>
              <RawFileDrop
                upload={upload}
                onFile={handleFile}
                error={fileError}
                onReset={handleReset}
              />
              {upload && (
                <div className="imp-file-meta-row">
                  <span>
                    <strong>{upload.rows.rows.length}</strong> data row
                    {upload.rows.rows.length !== 1 ? "s" : ""}
                  </span>
                  <span>·</span>
                  <span>
                    <strong>{upload.images.images.length}</strong> image
                    {upload.images.images.length !== 1 ? "s" : ""} found
                  </span>
                  <span>·</span>
                  <span>
                    {(upload.images.totalBytes / 1024).toFixed(0)}&nbsp;KB
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Step 3 — Match + target column */}
          {upload && schema && (
            <section className="imp-card" id="step-3">
              <header className="imp-card-h">
                <div className="imp-card-num">3</div>
                <div>
                  <h2 className="imp-card-title">Match images to items</h2>
                  <p className="imp-card-sub">
                    Pick the spreadsheet column that identifies each item on
                    monday.com, and pick the target file column. We match by
                    item name (case-sensitive) or item ID — your choice.
                  </p>
                </div>
              </header>

              <div className="imp-field">
                <label className="imp-label">Match using</label>
                <div className="imp-segmented">
                  <button
                    className={matchMode === "item_name" ? "is-active" : ""}
                    onClick={() => setMatchMode("item_name")}
                  >
                    Item name
                  </button>
                  <button
                    className={matchMode === "item_id" ? "is-active" : ""}
                    onClick={() => setMatchMode("item_id")}
                  >
                    Item ID
                  </button>
                </div>
              </div>

              <div className="imp-field">
                <label className="imp-label">Spreadsheet column</label>
                <select
                  className="qi-input"
                  value={matchColumn}
                  onChange={(e) => setMatchColumn(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {upload.rows.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="imp-field">
                <label className="imp-label">Target file column on monday</label>
                <select
                  className="qi-input"
                  value={fileColumnId}
                  onChange={(e) => setFileColumnId(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {fileColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.id})
                    </option>
                  ))}
                </select>
                {fileColumns.length === 0 && (
                  <p className="imp-hint imp-hint-warn">
                    This board has no File columns yet. Add one in monday
                    (Add column → Files) and refresh.
                  </p>
                )}
              </div>

              {matchColumn && (
                <div className="imp-preview">
                  Will upload <strong>{matchPreview.matched}</strong> of{" "}
                  <strong>{matchPreview.total}</strong> embedded image
                  {matchPreview.total !== 1 ? "s" : ""}. Rows with images but
                  no value in <code>{matchColumn}</code> are skipped.
                </div>
              )}
            </section>
          )}

          {/* Step 4 — Run */}
          {(running || progress) && (
            <section className="imp-card" id="step-4">
              <header className="imp-card-h">
                <div className="imp-card-num">4</div>
                <div>
                  <h2 className="imp-card-title">
                    {running
                      ? "Uploading images…"
                      : runError
                        ? "Upload failed"
                        : "Image upload complete"}
                  </h2>
                  <p className="imp-card-sub">
                    Live per-image status. Image uploads run at low concurrency
                    to stay under monday.com&apos;s file-upload rate limits.
                  </p>
                </div>
              </header>
              <ImageProgressView progress={progress} running={running} error={runError} />
            </section>
          )}
        </div>

        <footer className="imp-footer">
          <div className="imp-footer-meta">
            {upload ? (
              <>
                <span className="imp-type-classic">IMAGE SYNC</span>
                <span style={{ marginLeft: 10 }}>
                  {upload.images.images.length} image
                  {upload.images.images.length !== 1 ? "s" : ""} in{" "}
                  <code>{upload.fileName}</code>
                </span>
              </>
            ) : (
              <span>Upload an .xlsx with embedded images to start</span>
            )}
          </div>
          <div className="imp-footer-actions">
            {progress && !running && (
              <button className="qi-btn" onClick={handleReset}>
                Upload another file
              </button>
            )}
            <button
              className="qi-btn qi-btn-primary"
              disabled={!canRun || running}
              onClick={handleStart}
            >
              {running
                ? "Uploading…"
                : matchPreview.matched > 0
                  ? `Upload ${matchPreview.matched} image${matchPreview.matched !== 1 ? "s" : ""}`
                  : "Upload images"}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

// ── Components local to this page ──────────────────────────────────────

function RawFileDrop(props: {
  upload: UploadState | null;
  onFile: (f: File) => void;
  error: string | null;
  onReset: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (props.upload) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="imp-file-chip">
          <div className="imp-file-icon">✓</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="imp-file-name">{props.upload.fileName}</div>
            <div className="imp-file-meta">
              {props.upload.rows.rows.length} rows ·{" "}
              {props.upload.images.images.length} images
            </div>
          </div>
          <button className="qi-btn qi-btn-sm" onClick={props.onReset}>
            Choose another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        className={`imp-dropzone ${dragging ? "is-drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) props.onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="imp-dropzone-icon">📥</div>
        <div className="imp-dropzone-title">
          Drop your Excel file here
        </div>
        <div className="imp-dropzone-sub">or click to browse — .xlsx only</div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
          }}
        />
      </div>
      {props.error && <div className="imp-error">{props.error}</div>}
    </div>
  );
}

function ImageProgressView(props: {
  progress: ImageImportProgress | null;
  running: boolean;
  error: string | null;
}) {
  if (!props.progress) {
    return (
      <div style={{ color: "hsl(var(--qi-muted-foreground))" }}>
        {props.error ?? "Waiting…"}
      </div>
    );
  }

  const pct = props.progress.total
    ? Math.round((props.progress.completed / props.progress.total) * 100)
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="imp-progress-summary">
        <div>
          <strong>{props.progress.completed}</strong> /{" "}
          {props.progress.total} ({pct}%)
        </div>
        <div className="imp-progress-counts">
          <span className="imp-count-success">
            ✓ {props.progress.succeeded}
          </span>
          {props.progress.failed > 0 && (
            <span className="imp-count-error">
              ✗ {props.progress.failed}
            </span>
          )}
        </div>
      </div>
      <div className="imp-progress-bar">
        <div className="imp-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {props.error && <div className="imp-error">{props.error}</div>}

      <div className="imp-progress-table-wrap">
        <table className="imp-progress-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Match key</th>
              <th>File</th>
              <th>Size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.progress.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.rowIndex}</td>
                <td>{r.matchKey}</td>
                <td>{r.fileName}</td>
                <td>{(r.size / 1024).toFixed(0)}&nbsp;KB</td>
                <td>
                  <StatusPill status={r.status} />
                  {r.error && <span className="imp-row-error"> · {r.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "success"
      ? "imp-pill-success"
      : status === "error"
        ? "imp-pill-error"
        : status === "uploading"
          ? "imp-pill-pending"
          : "imp-pill-pending";
  return <span className={`imp-pill ${cls}`}>{status}</span>;
}

function BrandMark() {
  return (
    <img
      src={chromeUrl("icons/icon128.png")}
      alt=""
      style={{ width: 26, height: 26, borderRadius: 8, objectFit: "cover" }}
    />
  );
}

function chromeUrl(path: string): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return `/${path}`;
}
