import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBoardSchema,
  type BoardSchema,
} from "../services/mondayApi";
import {
  extractImagesFromXlsx,
  type ImageExtractionResult,
} from "../services/excelImageExtractor";
import {
  parseSheetForImageImport,
  previewRawRows,
  type ParsedSheet,
} from "../services/imageImportSheetParser";
import {
  runImageImport,
  runImageImportWithCreate,
  type ImageImportProgress,
  type ImageCreateProgress,
  type ImageMatchInput,
  type ImageCreateInput,
  type MatchMode,
} from "../services/monday/imageImportOrchestrator";
import { fetchBoardGroups } from "../services/monday/queries";
import { READ_ONLY_COLUMN_TYPES } from "../services/columnValueFormatters";
import type { ColumnMapping, MondayColumn, MondayGroup } from "../utils/types";
import { Stepper } from "../import/components/Stepper";
import { BoardCard } from "../import/components/BoardCard";
import { TokenSetupCard } from "../query/components/TokenSetupCard";

type ImportMode = "update" | "create";

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

interface UploadState {
  /** Parsed sheet — format-aware, with xlsx row indices preserved */
  sheet: ParsedSheet;
  /** Images extracted from the xlsx, keyed by xlsx row index (0-based) */
  images: ImageExtractionResult;
  fileName: string;
  /** Original File handle — kept so we can re-parse with a header override */
  file: File;
  /** First ~12 raw rows of the sheet — surfaced when the auto pick looks wrong */
  preview: string[][];
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

  // ── Import-mode toggle ────────────────────────────────────────────────
  // "update" → attach images to existing items by name/ID (the original flow)
  // "create" → create new items from each row AND attach the image
  const [mode, setMode] = useState<ImportMode>("update");

  // ── Mapping state (update mode) ────────────────────────────────────────
  const [matchMode, setMatchMode] = useState<MatchMode>("item_name");
  const [matchColumn, setMatchColumn] = useState<string>("");
  const [fileColumnId, setFileColumnId] = useState<string>("");

  // ── Mapping state (create mode) ────────────────────────────────────────
  // Item-name column = which sheet column holds the title for the new item.
  // groupId = optional, which group on the board to drop new items into.
  // columnMappings = sheet col → board col id, projection of the rest of
  // the row's data into the new item's column values.
  const [itemNameColumn, setItemNameColumn] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [boardGroups, setBoardGroups] = useState<MondayGroup[]>([]);

  // ── Run state ──────────────────────────────────────────────────────────
  // Single hook covers both flows — only one orchestrator runs at a time.
  const [updateProgress, setUpdateProgress] = useState<ImageImportProgress | null>(null);
  const [createProgress, setCreateProgress] = useState<ImageCreateProgress | null>(null);
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

  // Mappable (non-File, non-read-only) board columns for the create-mode
  // column mapper. We exclude file/mirror/formula/etc here so the user
  // can't try to project a sheet cell into a column we can't actually
  // write through the standard column_values API.
  const writableNonFileColumns = useMemo<MondayColumn[]>(() => {
    if (!schema) return [];
    return schema.columns.filter(
      (c) => !READ_ONLY_COLUMN_TYPES.has(c.type) && c.type !== "file",
    );
  }, [schema]);

  // Auto-pick the first file column once the schema loads, so the user only
  // has to choose if their board has multiple.
  useEffect(() => {
    if (fileColumns.length > 0 && !fileColumnId) {
      setFileColumnId(fileColumns[0].id);
    }
  }, [fileColumns, fileColumnId]);

  // Load board groups when create mode is active and we have a board. We
  // only fetch in create mode to avoid an extra round-trip on the much
  // more common update flow.
  useEffect(() => {
    if (mode !== "create" || !token || !boardId) {
      setBoardGroups([]);
      return;
    }
    let cancelled = false;
    fetchBoardGroups(token, boardId)
      .then((groups) => {
        if (!cancelled) setBoardGroups(groups);
      })
      .catch(() => {
        if (!cancelled) setBoardGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, token, boardId]);

  // ── Derived state ──────────────────────────────────────────────────────
  const currentStep: Step = useMemo(() => {
    if (running || updateProgress || createProgress) return 4;
    if (upload && schema) return 3;
    if (token && schema) return 2;
    return 1;
  }, [running, updateProgress, createProgress, upload, schema, token]);

  // The user picks ONE column to match items by. We default to the first
  // header that looks like a name/id field, but always let the user override.
  // monday's exports name the item-title column "Name" — that's our best
  // first guess for those files.
  useEffect(() => {
    if (!upload || matchColumn) return;
    const headers = upload.sheet.headers;
    const guess =
      headers.find((h) => h === "Name") ??
      headers.find((h) => /name|item/i.test(h)) ??
      headers[0] ??
      "";
    setMatchColumn(guess);
    if (/id/i.test(guess)) setMatchMode("item_id");
  }, [upload, matchColumn]);

  // Same first-guess for the create-mode item-name column. We treat
  // "Name" as the canonical title column (matches monday's export).
  useEffect(() => {
    if (!upload || itemNameColumn) return;
    const headers = upload.sheet.headers;
    const guess =
      headers.find((h) => h === "Name") ??
      headers.find((h) => /name|title|item/i.test(h)) ??
      headers[0] ??
      "";
    setItemNameColumn(guess);
  }, [upload, itemNameColumn]);

  // Seed columnMappings from the sheet's headers when the user enters
  // create mode for the first time. Each sheet column becomes a row in
  // the mapper, initially unmapped — the user picks the monday column
  // for each, or leaves it blank to skip.
  useEffect(() => {
    if (mode !== "create" || !upload) return;
    setColumnMappings((prev) => {
      // Don't blow away mappings the user has already configured. Only
      // seed when transitioning from "empty" → "have a sheet".
      if (prev.length > 0) return prev;
      return upload.sheet.headers.map((h) => ({
        fileColumn: h,
        mondayColumnId: "",
      }));
    });
  }, [mode, upload]);

  const matchPreview = useMemo(() => {
    if (!upload || !matchColumn) return { matched: 0, total: 0 };
    let total = 0;
    let matched = 0;
    // Walk every parsed data row and use its OWN xlsxRowIndex to look up
    // the images Excel anchored there. The parser preserves row indices
    // across both flat and monday-classic formats, so this single code
    // path handles both shapes correctly.
    for (const row of upload.sheet.rows) {
      const imgs = upload.images.byRow.get(row.xlsxRowIndex) ?? [];
      if (imgs.length === 0) continue;
      total += imgs.length;
      const key = row.values[matchColumn]?.trim();
      if (key) matched += imgs.length;
    }
    return { matched, total };
  }, [upload, matchColumn]);

  // Create-mode preview: how many items will be created, of which how
  // many will get at least one image attached. We don't require every
  // row to have an image — data-only rows are valid.
  const createPreview = useMemo(() => {
    if (!upload || !itemNameColumn) return { items: 0, itemsWithImage: 0 };
    let items = 0;
    let itemsWithImage = 0;
    for (const row of upload.sheet.rows) {
      const name = row.values[itemNameColumn]?.trim();
      if (!name) continue;
      items++;
      const imgs = upload.images.byRow.get(row.xlsxRowIndex) ?? [];
      if (imgs.length > 0) itemsWithImage++;
    }
    return { items, itemsWithImage };
  }, [upload, itemNameColumn]);

  const canRun =
    mode === "update"
      ? !!(
          token &&
          schema &&
          upload &&
          upload.images.images.length > 0 &&
          fileColumnId &&
          matchColumn
        )
      : !!(token && schema && upload && itemNameColumn && createPreview.items > 0);

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

      // Format-aware parser: auto-detects monday.com classic export
      // (3-row preamble: board name, group name, parent headers) vs a
      // hand-built flat sheet. For flat sheets the parser also auto-finds
      // the header row even when there are title/info rows above it.
      const sheet = await parseSheetForImageImport(incoming);

      if (sheet.rows.length === 0) {
        throw new Error(
          "No data rows found in the spreadsheet. Make sure your items are listed under a header row.",
        );
      }

      // Pull the first few raw rows for the manual-override UI in case
      // auto detection landed on the wrong row.
      const preview = await previewRawRows(incoming, 12);

      // Image extraction reads the raw buffer via JSZip — independent of
      // the cell parser, since JSZip handles ZIP64 natively. We still need
      // the original bytes here, not the patched ones the parser used.
      const raw = new Uint8Array(await incoming.arrayBuffer());
      const images = await extractImagesFromXlsx(raw);
      if (images.images.length === 0) {
        throw new Error(
          "No embedded images found in this xlsx. Make sure your images are pasted into cells (not just URLs) — Excel anchors them when you do Insert → Picture or paste from clipboard.",
        );
      }

      setUpload({
        sheet,
        images,
        fileName: incoming.name,
        file: incoming,
        preview,
      });
    } catch (err) {
      setFileError((err as Error).message);
    }
  }, []);

  /**
   * Run the existing update-mode pipeline: match each row to an existing
   * monday item by name/ID, then upload the anchored image(s) to the
   * chosen File column.
   */
  const handleStartUpdate = useCallback(async () => {
    if (!upload || !token || !schema || !matchColumn || !fileColumnId) return;

    // Flatten the xlsx into one orchestrator input per (row, image) pair.
    const inputs: ImageMatchInput[] = [];
    for (const row of upload.sheet.rows) {
      const imgs = upload.images.byRow.get(row.xlsxRowIndex);
      if (!imgs?.length) continue;
      const matchKey = row.values[matchColumn]?.trim();
      if (!matchKey) continue;
      for (const img of imgs) {
        inputs.push({
          rowIndex: row.xlsxRowIndex,
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
    setUpdateProgress(initial);

    try {
      const result = await runImageImport(
        token,
        boardId,
        fileColumnId,
        matchMode,
        inputs,
        {
          onRowUpdate: (rowIndex, update) => {
            setUpdateProgress((prev) => {
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
            setUpdateProgress((prev) =>
              prev ? { ...prev, ...snapshot, rows: prev.rows } : prev,
            );
          },
        },
      );
      setUpdateProgress(result);
    } catch (err) {
      setRunError((err as Error).message);
    }
  }, [upload, token, schema, boardId, matchColumn, matchMode, fileColumnId]);

  /**
   * Run the create-mode pipeline: for each row create a new monday item
   * (with mapped column values applied), then attach the row's anchored
   * image(s) to the chosen File column on the new item.
   *
   * Items can be created without an image (data-only row) and the row
   * still counts as success. An image-upload failure leaves the item
   * alive but marks the row failed so the user can retry just the
   * affected uploads.
   */
  const handleStartCreate = useCallback(async () => {
    if (!upload || !token || !schema || !itemNameColumn) return;

    const activeMappings = columnMappings.filter((m) => m.mondayColumnId);

    // Build one input per parsed row that has a non-empty item name.
    const inputs: ImageCreateInput[] = [];
    for (const row of upload.sheet.rows) {
      const itemName = row.values[itemNameColumn]?.trim();
      if (!itemName) continue;
      const imgs = upload.images.byRow.get(row.xlsxRowIndex) ?? [];
      inputs.push({
        rowIndex: row.xlsxRowIndex,
        itemName,
        rowValues: row.values,
        images: imgs.map((im) => ({
          fileName: im.fileName,
          data: im.data,
          mimeType: im.mimeType,
        })),
      });
    }

    if (inputs.length === 0) {
      setRunError(
        `No rows had a non-empty value in the "${itemNameColumn}" column to use as the item name.`,
      );
      setRunning(false);
      return;
    }

    const initial: ImageCreateProgress = {
      total: inputs.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      rows: inputs.map((inp) => ({
        rowIndex: inp.rowIndex,
        itemName: inp.itemName,
        status: "pending" as const,
        totalBytes: inp.images.reduce((s, im) => s + im.data.byteLength, 0),
        imagesTotal: inp.images.length,
        imagesSucceeded: 0,
      })),
    };
    setCreateProgress(initial);

    try {
      const result = await runImageImportWithCreate(
        token,
        boardId,
        groupId || undefined,
        activeMappings,
        fileColumnId,
        schema.columns,
        inputs,
        {
          onRowUpdate: (rowIndex, update) => {
            setCreateProgress((prev) => {
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
            setCreateProgress((prev) =>
              prev ? { ...prev, ...snapshot, rows: prev.rows } : prev,
            );
          },
        },
      );
      setCreateProgress(result);
    } catch (err) {
      setRunError((err as Error).message);
    }
  }, [
    upload,
    token,
    schema,
    boardId,
    itemNameColumn,
    columnMappings,
    fileColumnId,
    groupId,
  ]);

  /**
   * Dispatch by import mode. Single button label in the footer drives
   * either flow depending on the toggle at the top of the page.
   */
  const handleStart = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setUpdateProgress(null);
    setCreateProgress(null);
    try {
      if (mode === "update") {
        await handleStartUpdate();
      } else {
        await handleStartCreate();
      }
    } finally {
      setRunning(false);
    }
  }, [mode, handleStartUpdate, handleStartCreate]);

  const handleReset = () => {
    setUpload(null);
    setUpdateProgress(null);
    setCreateProgress(null);
    setRunError(null);
    setMatchColumn("");
    setItemNameColumn("");
    setColumnMappings([]);
  };

  /**
   * Re-parse the same .xlsx with a user-picked header row. Only relevant
   * for flat sheets — monday classic exports have a fixed structure and
   * the override would be confusing. We preserve the already-extracted
   * images so we don't pay the JSZip cost again.
   */
  const handleHeaderOverride = useCallback(
    async (newHeaderRowIndex: number) => {
      if (!upload || upload.sheet.format !== "flat") return;
      try {
        const sheet = await parseSheetForImageImport(upload.file, {
          headerRowOverride: newHeaderRowIndex,
        });
        setUpload({ ...upload, sheet });
        setMatchColumn("");
      } catch (err) {
        setFileError((err as Error).message);
      }
    },
    [upload],
  );

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
          {/* Mode picker — drives the meaning of step 3 and the buttons */}
          <ModePicker mode={mode} onChange={setMode} />

          <Stepper
            currentStep={currentStep}
            steps={[
              "Connect",
              "Upload .xlsx",
              mode === "update" ? "Match items" : "Map columns",
              mode === "update" ? "Upload images" : "Create items + images",
            ]}
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
                <>
                  <div className="imp-file-meta-row">
                    <span>
                      <strong>{upload.sheet.rows.length}</strong> item row
                      {upload.sheet.rows.length !== 1 ? "s" : ""}
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
                    <span>·</span>
                    <span title={upload.sheet.format === "monday_classic" ? "Detected monday.com classic board export — board name, group name, and parent headers are skipped automatically" : "Hand-built flat sheet — header row detected automatically"}>
                      {upload.sheet.format === "monday_classic" ? (
                        <span style={{ color: "#7c5cfc", fontWeight: 600 }}>monday export</span>
                      ) : (
                        <span style={{ color: "#52525b" }}>flat sheet</span>
                      )}
                    </span>
                  </div>

                  {/* Manual header-row override — only meaningful for
                      flat sheets. For monday exports the structure is
                      fixed, so we hide the picker entirely. */}
                  {upload.sheet.format === "flat" && upload.preview.length > 1 && (
                    <HeaderRowPicker
                      preview={upload.preview}
                      currentHeaders={upload.sheet.headers}
                      onPick={handleHeaderOverride}
                    />
                  )}
                </>
              )}
            </section>
          )}

          {/* Step 3 — Match (update mode) OR Map (create mode) */}
          {upload && schema && mode === "update" && (
            <section className="imp-card" id="step-3">
              <header className="imp-card-h">
                <div className="imp-card-num">3</div>
                <div>
                  <h2 className="imp-card-title">Match images to existing items</h2>
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
                  {upload.sheet.headers.map((h) => (
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

          {upload && schema && mode === "create" && (
            <section className="imp-card" id="step-3">
              <header className="imp-card-h">
                <div className="imp-card-num">3</div>
                <div>
                  <h2 className="imp-card-title">Map columns for new items</h2>
                  <p className="imp-card-sub">
                    Each row becomes a new monday item. Pick which sheet
                    column holds the item title, which group new items land
                    in, and which file column the image attaches to. Map
                    remaining columns below.
                  </p>
                </div>
              </header>

              <div className="imp-field">
                <label className="imp-label">Item name from</label>
                <select
                  className="qi-input"
                  value={itemNameColumn}
                  onChange={(e) => setItemNameColumn(e.target.value)}
                >
                  <option value="">— Select —</option>
                  {upload.sheet.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="imp-field">
                <label className="imp-label">Group on monday board</label>
                <select
                  className="qi-input"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">(default group)</option>
                  {boardGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                <p className="imp-hint">
                  If you don&apos;t pick a group, monday drops new items into
                  the board&apos;s default group.
                </p>
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

              <div className="imp-field">
                <label className="imp-label">Map other columns</label>
                <CreateColumnMapper
                  headers={upload.sheet.headers}
                  boardColumns={writableNonFileColumns}
                  itemNameColumn={itemNameColumn}
                  mappings={columnMappings}
                  onChange={setColumnMappings}
                />
              </div>

              {itemNameColumn && (
                <div className="imp-preview">
                  Will create <strong>{createPreview.items}</strong> new
                  item{createPreview.items !== 1 ? "s" : ""}, of which{" "}
                  <strong>{createPreview.itemsWithImage}</strong> get an
                  image attached. Rows with no value in{" "}
                  <code>{itemNameColumn}</code> are skipped.
                </div>
              )}
            </section>
          )}

          {/* Step 4 — Run */}
          {(running || updateProgress || createProgress) && (
            <section className="imp-card" id="step-4">
              <header className="imp-card-h">
                <div className="imp-card-num">4</div>
                <div>
                  <h2 className="imp-card-title">
                    {running
                      ? mode === "update"
                        ? "Uploading images…"
                        : "Creating items + uploading images…"
                      : runError
                        ? "Import failed"
                        : "Import complete"}
                  </h2>
                  <p className="imp-card-sub">
                    Live per-row status. Both flows batch at low concurrency
                    to stay clear of monday.com&apos;s rate limits.
                  </p>
                </div>
              </header>
              {mode === "update" ? (
                <ImageProgressView
                  progress={updateProgress}
                  running={running}
                  error={runError}
                />
              ) : (
                <ImageCreateProgressView
                  progress={createProgress}
                  running={running}
                  error={runError}
                />
              )}
            </section>
          )}
        </div>

        <footer className="imp-footer">
          <div className="imp-footer-meta">
            {upload ? (
              <>
                <span className="imp-type-classic">
                  {mode === "update" ? "UPDATE MODE" : "CREATE MODE"}
                </span>
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
            {(updateProgress || createProgress) && !running && (
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
                ? mode === "update"
                  ? "Uploading…"
                  : "Creating…"
                : mode === "update"
                  ? matchPreview.matched > 0
                    ? `Upload ${matchPreview.matched} image${matchPreview.matched !== 1 ? "s" : ""}`
                    : "Upload images"
                  : createPreview.items > 0
                    ? `Create ${createPreview.items} item${createPreview.items !== 1 ? "s" : ""}`
                    : "Create items"}
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
              {props.upload.sheet.rows.length} rows ·{" "}
              {props.upload.images.images.length} images ·{" "}
              {props.upload.sheet.format === "monday_classic"
                ? "monday export"
                : "flat sheet"}
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

function ImageCreateProgressView(props: {
  progress: ImageCreateProgress | null;
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
              <th>Item name</th>
              <th>Created id</th>
              <th>Images</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {props.progress.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.rowIndex}</td>
                <td>{r.itemName}</td>
                <td>{r.createdItemId ?? "—"}</td>
                <td>
                  {r.imagesSucceeded} / {r.imagesTotal}
                </td>
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

/**
 * Top-of-page mode selector. Drives whether step 3 shows the "match
 * existing items" form or the "map columns for new items" form.
 */
function ModePicker(props: {
  mode: ImportMode;
  onChange: (mode: ImportMode) => void;
}) {
  return (
    <div className="imp-mode-picker">
      <button
        type="button"
        className={`imp-mode-option ${props.mode === "update" ? "is-active" : ""}`}
        onClick={() => props.onChange("update")}
      >
        <div className="imp-mode-icon">🔗</div>
        <div>
          <div className="imp-mode-title">Attach to existing items</div>
          <div className="imp-mode-sub">
            Match each row to a monday item by name or ID and upload the
            image to its File column.
          </div>
        </div>
      </button>
      <button
        type="button"
        className={`imp-mode-option ${props.mode === "create" ? "is-active" : ""}`}
        onClick={() => props.onChange("create")}
      >
        <div className="imp-mode-icon">✨</div>
        <div>
          <div className="imp-mode-title">Create new items with images</div>
          <div className="imp-mode-sub">
            Each row becomes a new monday item. Map columns, pick a group,
            and the image is attached as part of creation.
          </div>
        </div>
      </button>
    </div>
  );
}

/**
 * Per-row column mapper for create mode. The user picks which monday
 * column each sheet header maps to; rows whose monday column is left
 * blank are skipped at import time. The "item name" column is shown
 * grayed out (already used) so the user doesn't double-map it.
 */
function CreateColumnMapper(props: {
  headers: string[];
  boardColumns: MondayColumn[];
  itemNameColumn: string;
  mappings: ColumnMapping[];
  onChange: (next: ColumnMapping[]) => void;
}) {
  const setOne = (fileColumn: string, mondayColumnId: string) => {
    const existing = props.mappings.findIndex((m) => m.fileColumn === fileColumn);
    if (existing >= 0) {
      const next = [...props.mappings];
      next[existing] = { fileColumn, mondayColumnId };
      props.onChange(next);
    } else {
      props.onChange([...props.mappings, { fileColumn, mondayColumnId }]);
    }
  };

  const getMapping = (fileColumn: string): string => {
    return props.mappings.find((m) => m.fileColumn === fileColumn)?.mondayColumnId ?? "";
  };

  return (
    <div className="imp-mapper">
      <div className="imp-mapper-row imp-mapper-head">
        <div>Sheet column</div>
        <div>Monday column</div>
      </div>
      {props.headers.map((h) => {
        const isItemName = h === props.itemNameColumn;
        return (
          <div key={h} className="imp-mapper-row">
            <div className="imp-mapper-source">
              {h}
              {isItemName && (
                <span className="imp-mapper-tag">item name</span>
              )}
            </div>
            <div>
              {isItemName ? (
                <span className="imp-mapper-fixed">
                  (used as item title)
                </span>
              ) : (
                <select
                  className="qi-input"
                  value={getMapping(h)}
                  onChange={(e) => setOne(h, e.target.value)}
                >
                  <option value="">— Skip —</option>
                  {props.boardColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.type})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
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

/**
 * Manual header-row picker. Shows the first few rows of the spreadsheet
 * as the user would see them in Excel; clicking a row promotes it to be
 * the header and re-parses the sheet. Hidden behind a "Wrong header?"
 * toggle so it doesn't add clutter when the auto pick is right.
 */
function HeaderRowPicker(props: {
  preview: string[][];
  currentHeaders: string[];
  onPick: (rowIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);

  // Heuristic: the detected header row is the first preview row whose
  // trimmed cells match the parsed headers list. Used purely for display
  // so the user knows what was picked.
  const detectedRow = props.preview.findIndex((row) => {
    const trimmed = row.map((c) => c.trim()).filter(Boolean);
    return (
      trimmed.length === props.currentHeaders.length &&
      trimmed.every((c, i) => c === props.currentHeaders[i])
    );
  });

  return (
    <div className="imp-header-picker">
      <button
        type="button"
        className="imp-header-picker-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide header picker ↑" : "Wrong header row? Pick another →"}
      </button>
      {open && (
        <div className="imp-header-picker-list">
          <p className="imp-header-picker-hint">
            Click the row that contains your column titles. Detected:
            row&nbsp;{detectedRow >= 0 ? detectedRow + 1 : "?"}.
          </p>
          {props.preview.map((row, i) => (
            <button
              key={i}
              type="button"
              className={`imp-header-picker-row ${i === detectedRow ? "is-active" : ""}`}
              onClick={() => {
                props.onPick(i);
                setOpen(false);
              }}
            >
              <span className="imp-header-picker-num">{i + 1}</span>
              <span className="imp-header-picker-cells">
                {row
                  .map((c) => c.trim())
                  .filter(Boolean)
                  .slice(0, 6)
                  .join(" · ") || <em>(empty row)</em>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
