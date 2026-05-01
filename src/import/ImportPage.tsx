import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBoardSchema,
  runFullMondayExportImport,
  runMondayExportImport,
  runImport,
  type BoardSchema,
} from "../services/mondayApi";
import { parseFile } from "../services/fileParser";
import { SUBITEM_NAME_SENTINEL } from "../utils/constants";
import type {
  ColumnMapping,
  ImportProgress,
  MondayColumn,
  ParentIdentifier,
  ParsedFile,
} from "../utils/types";
import { Stepper } from "./components/Stepper";
import { BoardCard } from "./components/BoardCard";
import { FileDrop } from "./components/FileDrop";
import { ColumnMapper } from "./components/ColumnMapper";
import { ProgressView } from "./components/ProgressView";
import { TokenSetupCard } from "../query/components/TokenSetupCard";

// Full-page Importer.
//
// 4 visible steps in a sticky stepper at the top:
//
//   1. Connect      → token + board id (auto-detects classic vs multi-level)
//   2. Upload       → CSV/XLSX; auto-detects monday board exports
//   3. Map columns  → side-by-side mapper, mode picker
//   4. Run          → live progress with per-row status + retry
//
// Each step is its own card. We never hide the previous steps — the user can
// always scroll up and tweak. The sticky footer carries the primary CTA so
// it's always visible.

type Step = 1 | 2 | 3 | 4;

export function ImportPage() {
  // ── Bootstrap state ────────────────────────────────────────────────
  const [token, setToken] = useState<string>("");
  const [tokenLoaded, setTokenLoaded] = useState(false);
  const [boardId, setBoardId] = useState<string>("");
  const [schema, setSchema] = useState<BoardSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // ── File state ─────────────────────────────────────────────────────
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Mapping state ──────────────────────────────────────────────────
  const [includeParents, setIncludeParents] = useState(true);
  const [parentIdentifier, setParentIdentifier] = useState<ParentIdentifier>({
    type: "item_name",
    fileColumn: "",
  });
  const [subitemNameColumn, setSubitemNameColumn] = useState("");
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parentMappings, setParentMappings] = useState<ColumnMapping[]>([]);

  // ── Run state ──────────────────────────────────────────────────────
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Read token + boardId from URL/storage on mount
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

  // Resolve schema whenever board id + token are both set
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
        if (cancelled) return;
        setSchema(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setSchemaError((err as Error).message);
      })
      .finally(() => {
        if (cancelled) return;
        setSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, boardId]);

  // ── Compute current step (drives the stepper highlight) ────────────
  const currentStep: Step = useMemo(() => {
    if (running || progress) return 4;
    if (file && schema) return 3;
    if (token && schema) return 2;
    return 1;
  }, [running, progress, file, schema, token]);

  // ── Derived data ───────────────────────────────────────────────────
  // For multi-level boards we use the parent's columns for subitems too.
  const subitemColumns: MondayColumn[] = useMemo(() => {
    if (!schema) return [];
    if (schema.hierarchyType === "multi_level") return schema.columns;
    return schema.columns;
  }, [schema]);

  const counts = useMemo(() => {
    if (!file) return { parents: 0, subitems: 0, total: 0 };
    if (file.kind === "monday_export") {
      const parents = includeParents
        ? file.groups.reduce((s, g) => s + g.items.length, 0)
        : 0;
      return {
        parents,
        subitems: file.flatSubitems.length,
        total: parents + file.flatSubitems.length,
      };
    }
    return { parents: 0, subitems: file.rowCount, total: file.rowCount };
  }, [file, includeParents]);

  const canRun = !!(
    token &&
    schema &&
    file &&
    counts.total > 0 &&
    (file.kind === "monday_export" ||
      (parentIdentifier.fileColumn && subitemNameColumn))
  );

  // ── Handlers ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (incoming: File) => {
    setFileError(null);
    setFile(null);
    try {
      const parsed = await parseFile(incoming);
      setFile(parsed);
      // Auto-init mappings
      if (parsed.kind === "monday_export") {
        const subHeaders = parsed.subitemHeaders.filter((h) => h !== "Name");
        setMappings(subHeaders.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
        const pHeaders = parsed.parentHeaders.filter(
          (h) => h !== "Name" && h !== "Subitems",
        );
        setParentMappings(pHeaders.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
        setParentIdentifier({ type: "item_name", fileColumn: "__auto__" });
        setSubitemNameColumn("__auto__");
      } else {
        setMappings(parsed.headers.map((h) => ({ fileColumn: h, mondayColumnId: "" })));
        setParentMappings([]);
      }
    } catch (err) {
      setFileError((err as Error).message);
    }
  }, []);

  const handleTokenSaved = useCallback((t: string) => {
    setToken(t);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ monday_api_token: t });
    } else {
      localStorage.setItem("monday_api_token", t);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!file || !token || !schema) return;
    setRunning(true);
    setRunError(null);

    const activeSubitemMappings = mappings.filter(
      (m) => m.mondayColumnId && m.mondayColumnId !== SUBITEM_NAME_SENTINEL,
    );
    const activeParentMappings = parentMappings.filter((m) => m.mondayColumnId);

    // Live progress mirror so the React state and persisted snapshot match
    const totalRows =
      file.kind === "monday_export"
        ? (includeParents
            ? file.groups.reduce((s, g) => s + g.items.length, 0)
            : 0) + file.flatSubitems.length
        : file.rows.length;
    const initial: ImportProgress = {
      total: totalRows,
      completed: 0,
      succeeded: 0,
      failed: 0,
      rows: Array.from({ length: totalRows }, (_, i) => ({
        rowIndex: i,
        kind: "subitem" as const,
        itemName: "",
        parentItemId: "",
        subitemName: "",
        status: "pending" as const,
      })),
    };
    setProgress(initial);

    const live: ImportProgress = {
      ...initial,
      rows: initial.rows.map((r) => ({ ...r })),
    };

    const callbacks = {
      onRowUpdate: (rowIndex: number, update: Partial<ImportProgress["rows"][0]>) => {
        if (rowIndex >= 0 && rowIndex < live.rows.length) {
          live.rows[rowIndex] = { ...live.rows[rowIndex], ...update };
        }
        setProgress((prev) => {
          if (!prev) return prev;
          const rows = [...prev.rows];
          if (rowIndex < 0 || rowIndex >= rows.length) return prev;
          rows[rowIndex] = { ...rows[rowIndex], ...update };
          const succeeded = rows.filter((r) => r.status === "success").length;
          const failed = rows.filter((r) => r.status === "error").length;
          return { ...prev, rows, completed: succeeded + failed, succeeded, failed };
        });
      },
      onBatchComplete: () => {
        const succeeded = live.rows.filter((r) => r.status === "success").length;
        const failed = live.rows.filter((r) => r.status === "error").length;
        live.completed = succeeded + failed;
        live.succeeded = succeeded;
        live.failed = failed;
      },
    };

    try {
      let result: ImportProgress;
      if (file.kind === "monday_export" && includeParents) {
        result = await runFullMondayExportImport(
          token,
          file,
          activeParentMappings,
          activeSubitemMappings,
          boardId,
          schema.columns,
          subitemColumns,
          callbacks,
        );
      } else if (file.kind === "monday_export") {
        result = await runMondayExportImport(
          token,
          file,
          activeSubitemMappings,
          boardId,
          subitemColumns,
          callbacks,
        );
      } else {
        result = await runImport(
          token,
          file,
          parentIdentifier,
          subitemNameColumn,
          activeSubitemMappings,
          boardId,
          subitemColumns,
          callbacks,
        );
      }
      setProgress(result);
    } catch (err) {
      setRunError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }, [
    file,
    token,
    schema,
    boardId,
    parentIdentifier,
    subitemNameColumn,
    mappings,
    parentMappings,
    includeParents,
    subitemColumns,
  ]);

  const handleReset = () => {
    setFile(null);
    setProgress(null);
    setRunError(null);
    setMappings([]);
    setParentMappings([]);
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="imp-shell">
      <header className="qi-topbar">
        <a className="qi-brand" href="https://mondayinspector.eu" target="_blank" rel="noopener noreferrer">
          <BrandMark />
          <span>monday.inspector</span>
        </a>
        <div className="qi-brand-divider" />
        <span className="qi-page-title">Importer</span>
        <div className="qi-topbar-spacer" />
        <a
          className="qi-btn qi-btn-sm qi-btn-ghost"
          href={chromeUrl("src/query/index.html")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Query Inspector ↗
        </a>
      </header>

      <main className="imp-main">
        <div className="imp-canvas">
          <Stepper
            currentStep={currentStep}
            steps={[
              "Connect",
              "Upload file",
              "Map columns",
              "Run import",
            ]}
          />

          {/* Step 1 — Connect */}
          <section className="imp-card" id="step-1">
            <header className="imp-card-h">
              <div className="imp-card-num">1</div>
              <div>
                <h2 className="imp-card-title">Connect to monday.com</h2>
                <p className="imp-card-sub">
                  Paste your API token and the board ID you want to import into.
                  We auto-detect whether the board is a classic 2-level board or
                  one of monday&apos;s new <strong>multi-level boards</strong>.
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

          {/* Step 2 — Upload */}
          {token && schema && (
            <section className="imp-card" id="step-2">
              <header className="imp-card-h">
                <div className="imp-card-num">2</div>
                <div>
                  <h2 className="imp-card-title">Upload your CSV or Excel file</h2>
                  <p className="imp-card-sub">
                    A flat CSV or a monday.com board export (.xlsx) — both
                    auto-detected. Max ~50&nbsp;MB. Stays in your browser; no
                    server upload.
                  </p>
                </div>
              </header>
              <FileDrop file={file} onFile={handleFile} error={fileError} />
            </section>
          )}

          {/* Step 3 — Map columns */}
          {file && schema && (
            <section className="imp-card" id="step-3">
              <header className="imp-card-h">
                <div className="imp-card-num">3</div>
                <div>
                  <h2 className="imp-card-title">Map your columns</h2>
                  <p className="imp-card-sub">
                    {schema.hierarchyType === "multi_level"
                      ? "Multi-level board: child items reuse the parent column schema, so one column list covers everything."
                      : "Classic board: parent columns and subitem columns are distinct. Map each separately."}
                  </p>
                </div>
              </header>
              <ColumnMapper
                file={file}
                schema={schema}
                subitemColumns={subitemColumns}
                parentIdentifier={parentIdentifier}
                onParentIdentifierChange={setParentIdentifier}
                subitemNameColumn={subitemNameColumn}
                onSubitemNameColumnChange={setSubitemNameColumn}
                mappings={mappings}
                onMappingsChange={setMappings}
                parentMappings={parentMappings}
                onParentMappingsChange={setParentMappings}
                includeParents={includeParents}
                onIncludeParentsChange={setIncludeParents}
              />
            </section>
          )}

          {/* Step 4 — Run / progress */}
          {(running || progress) && (
            <section className="imp-card" id="step-4">
              <header className="imp-card-h">
                <div className="imp-card-num">4</div>
                <div>
                  <h2 className="imp-card-title">
                    {running
                      ? "Importing…"
                      : runError
                        ? "Import failed"
                        : "Import complete"}
                  </h2>
                  <p className="imp-card-sub">
                    Live progress with per-row status. Failures are listed below
                    with the exact API error so you can fix and re-run.
                  </p>
                </div>
              </header>
              <ProgressView progress={progress} running={running} error={runError} />
            </section>
          )}
        </div>

        <footer className="imp-footer">
          <div className="imp-footer-meta">
            {schema?.hierarchyType === "multi_level" ? (
              <>
                <span className="imp-type-multi">MULTI-LEVEL</span>
                <span style={{ marginLeft: 10 }}>
                  Parents go on the main board · subitems use the same board id
                  via <code>create_subitem</code>
                </span>
              </>
            ) : schema ? (
              <>
                <span className="imp-type-classic">CLASSIC</span>
                <span style={{ marginLeft: 10 }}>
                  Parents go on board <code>{boardId}</code> · subitems on board{" "}
                  <code>{schema.subitemBoardId ?? "—"}</code>
                </span>
              </>
            ) : (
              <span>Connect a board to start</span>
            )}
          </div>
          <div className="imp-footer-actions">
            {progress && !running && (
              <button className="qi-btn" onClick={handleReset}>
                Import another file
              </button>
            )}
            <button
              className="qi-btn qi-btn-primary"
              disabled={!canRun || running}
              onClick={handleStart}
            >
              {running
                ? "Running…"
                : counts.total > 0
                  ? `Start import · ${counts.parents > 0 ? `${counts.parents} parent${counts.parents !== 1 ? "s" : ""} + ` : ""}${counts.subitems} subitem${counts.subitems !== 1 ? "s" : ""}`
                  : "Start import"}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}

function BrandMark() {
  // Reuse the actual extension icon so the Importer's brand is identical to
  // the website nav and the popup. Prevents drift between surfaces.
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
