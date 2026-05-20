import { BATCH_DELAY_MS } from "../../utils/constants";
import type { ColumnMapping, MondayColumn } from "../../utils/types";
import { addFileToColumn, uploadWithRetry } from "./fileUpload";
import { buildColumnValues, createItem, fetchBoardItems } from "./queries";
import { sleep } from "./graphqlClient";

// Orchestrate bulk image upload to a monday.com File column.
//
// Pipeline:
//   1. Fetch every item on the target board (paginated, cached per call).
//   2. For each xlsx row that has at least one anchored image, resolve the
//      target monday item id via the user-chosen match column (item name or
//      item id).
//   3. Upload each image to the target File column with retry + light
//      batching to stay under monday.com's per-token API budget.
//
// Image uploads are MUCH slower than text mutations (multipart bytes over the
// wire) and monday throttles them harder, so we keep the parallelism low —
// BATCH_SIZE / 2 — and pause a hair longer between batches.

const IMAGE_BATCH_SIZE = 3;
const IMAGE_BATCH_DELAY_MS = BATCH_DELAY_MS;

/** Status of a single (row + image) upload attempt */
export type ImageUploadStatus = "pending" | "uploading" | "success" | "skipped" | "error";

export interface ImageUploadRow {
  /** xlsx 0-based row index the image came from */
  rowIndex: number;
  /** The match key from the user-selected column ("Item Name" or "Item ID") */
  matchKey: string;
  /** Resolved monday item id (set once we look up the board) */
  itemId: string;
  /** Image filename, surfaced in the progress table */
  fileName: string;
  /** Image size in bytes */
  size: number;
  status: ImageUploadStatus;
  error?: string;
  /** monday's returned asset id on success */
  assetId?: string;
}

export interface ImageImportProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  rows: ImageUploadRow[];
}

export interface ImageMatchInput {
  /** xlsx row index */
  rowIndex: number;
  /** Value from the user-chosen match column (raw text) */
  matchKey: string;
  /** Filename to keep when uploading */
  fileName: string;
  /** Raw image bytes */
  data: Uint8Array;
  /** MIME type for the multipart upload */
  mimeType: string;
}

export type MatchMode = "item_name" | "item_id";

export interface ImageImportCallbacks {
  onRowUpdate: (rowIndex: number, update: Partial<ImageUploadRow>) => void;
  onBatchComplete: (progress: ImageImportProgress) => void;
}

/**
 * Run a bulk image upload. `inputs` is one entry per (row, image) pair —
 * rows with multiple images yield multiple inputs with the same matchKey.
 */
export async function runImageImport(
  token: string,
  boardId: string,
  fileColumnId: string,
  matchMode: MatchMode,
  inputs: ImageMatchInput[],
  callbacks: ImageImportCallbacks,
): Promise<ImageImportProgress> {
  // ── Phase 0: resolve match keys → item ids ─────────────────────────────
  let nameToId: Map<string, string> | null = null;
  if (matchMode === "item_name") {
    const items = await fetchBoardItems(token, boardId);
    nameToId = new Map(items.map((it) => [it.name.trim(), it.id]));
  }

  // Seed progress rows in input order. Resolve match keys here so the UI can
  // immediately tell the user which rows won't upload (parent not found).
  const progress: ImageImportProgress = {
    total: inputs.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    rows: inputs.map((inp) => {
      const itemId =
        matchMode === "item_id"
          ? inp.matchKey.trim()
          : (nameToId?.get(inp.matchKey.trim()) ?? "");
      return {
        rowIndex: inp.rowIndex,
        matchKey: inp.matchKey,
        itemId,
        fileName: inp.fileName,
        size: inp.data.byteLength,
        status: itemId ? "pending" : "error",
        error: itemId ? undefined : `No monday item found for "${inp.matchKey}"`,
      };
    }),
  };

  // Pre-count failures from the resolution phase so the running totals match
  // what the user sees in the table immediately.
  for (const row of progress.rows) {
    if (row.status === "error") {
      progress.failed++;
      progress.completed++;
    }
  }
  callbacks.onBatchComplete({ ...progress });

  // ── Phase 1: upload images in small concurrent batches ─────────────────
  const uploadable: { input: ImageMatchInput; rowIdx: number }[] = [];
  inputs.forEach((inp, idx) => {
    if (progress.rows[idx].status === "pending") {
      uploadable.push({ input: inp, rowIdx: idx });
    }
  });

  for (let i = 0; i < uploadable.length; i += IMAGE_BATCH_SIZE) {
    const batch = uploadable.slice(i, i + IMAGE_BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ input, rowIdx }) => {
        const row = progress.rows[rowIdx];
        row.status = "uploading";
        callbacks.onRowUpdate(rowIdx, row);

        try {
          const result = await uploadWithRetry(() =>
            addFileToColumn(
              token,
              row.itemId,
              fileColumnId,
              input.fileName,
              input.data,
              input.mimeType,
            ),
          );
          row.status = "success";
          row.assetId = result.id;
          progress.succeeded++;
        } catch (err) {
          row.status = "error";
          row.error = (err as Error).message;
          progress.failed++;
        }
        progress.completed++;
        callbacks.onRowUpdate(rowIdx, row);
      }),
    );
    callbacks.onBatchComplete({ ...progress });
    if (i + IMAGE_BATCH_SIZE < uploadable.length) {
      await sleep(IMAGE_BATCH_DELAY_MS);
    }
  }

  return progress;
}

// ── Create-mode orchestrator ──────────────────────────────────────────
//
// "Create new items AND attach the image" pipeline. Used when the sheet
// contains rows that don't exist on monday yet — the operator wants the
// import to produce both the item and the attached photo in one pass.
//
// For each input row:
//   1. Resolve column values from the user's column mappings via the
//      shared buildColumnValues() helper (same one the CSV importer uses).
//   2. Create the item with create_item, optionally pinning to a group.
//   3. Upload every image anchored to that row to the chosen File column
//      on the newly created item.
//
// A failure in step 2 marks the row as error and skips the image — we
// don't want orphan images on items that don't exist. A failure in step 3
// marks the row as error too, but the item is left in place because the
// row data is still usable.

export interface ImageCreateInput {
  /** xlsx 0-based row index — used for ordering + progress display */
  rowIndex: number;
  /** Item title for the created item (required) */
  itemName: string;
  /** Full sheet row → cell values map. Pulled through buildColumnValues
   *  with the user's column mappings to build the monday column-values JSON. */
  rowValues: Record<string, string>;
  /** Every image anchored to this row in the xlsx. Empty array is allowed
   *  — the row will still be created, just without an attached image. */
  images: { fileName: string; data: Uint8Array; mimeType: string }[];
}

export interface ImageCreateRow {
  rowIndex: number;
  itemName: string;
  status: ImageUploadStatus;
  error?: string;
  /** monday item id once create_item succeeds */
  createdItemId?: string;
  /** Total bytes the row will upload — useful for the progress hover */
  totalBytes: number;
  /** How many images the orchestrator tried to upload for this row */
  imagesTotal: number;
  /** How many of those landed successfully */
  imagesSucceeded: number;
}

export interface ImageCreateProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  rows: ImageCreateRow[];
}

export interface ImageCreateCallbacks {
  onRowUpdate: (rowIndex: number, update: Partial<ImageCreateRow>) => void;
  onBatchComplete: (progress: ImageCreateProgress) => void;
}

// Item creation hits the GraphQL endpoint with full column-values
// payloads — heavier than a file upload — so we keep concurrency low and
// pause between batches to stay clear of monday's complexity budget.
const CREATE_BATCH_SIZE = 3;
const CREATE_BATCH_DELAY_MS = BATCH_DELAY_MS;

/**
 * Run a bulk create-with-images import. Each input row produces one item
 * on monday plus zero-or-more images attached to a File column on that
 * new item.
 *
 * `boardColumns` MUST be the parent-board columns (not subitem columns) —
 * we only create top-level items here. Subitem image support is a
 * separate orchestrator we haven't shipped yet.
 */
export async function runImageImportWithCreate(
  token: string,
  boardId: string,
  groupId: string | undefined,
  columnMappings: ColumnMapping[],
  fileColumnId: string,
  boardColumns: MondayColumn[],
  inputs: ImageCreateInput[],
  callbacks: ImageCreateCallbacks,
): Promise<ImageCreateProgress> {
  const progress: ImageCreateProgress = {
    total: inputs.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    rows: inputs.map((inp) => ({
      rowIndex: inp.rowIndex,
      itemName: inp.itemName,
      status: "pending",
      totalBytes: inp.images.reduce((s, im) => s + im.data.byteLength, 0),
      imagesTotal: inp.images.length,
      imagesSucceeded: 0,
    })),
  };
  callbacks.onBatchComplete({ ...progress });

  for (let i = 0; i < inputs.length; i += CREATE_BATCH_SIZE) {
    const batch = inputs.slice(i, i + CREATE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (inp, batchIdx) => {
        const rowIdx = i + batchIdx;
        const row = progress.rows[rowIdx];

        // Empty item name is a hard fail — monday rejects create_item
        // without a name and the resulting error message is unhelpful.
        if (!inp.itemName.trim()) {
          row.status = "error";
          row.error = "Item name is empty";
          progress.failed++;
          progress.completed++;
          callbacks.onRowUpdate(rowIdx, row);
          return;
        }

        row.status = "uploading";
        callbacks.onRowUpdate(rowIdx, row);

        // ── Phase 1a: resolve column values (may throw a
        //              BoardRelationResolveError that we want to label
        //              distinctly from a create_item failure so the user
        //              knows whether to fix data or fix monday permissions) ─
        let colVals: Record<string, unknown>;
        try {
          colVals = await buildColumnValues(
            token,
            columnMappings,
            inp.rowValues,
            boardColumns,
          );
        } catch (err) {
          row.status = "error";
          row.error = `Column resolution failed: ${(err as Error).message}`;
          progress.failed++;
          progress.completed++;
          callbacks.onRowUpdate(rowIdx, row);
          return;
        }

        // ── Phase 1b: create the monday item ──────────────────────────
        let createdItemId: string;
        try {
          const result = await createItem(
            token,
            boardId,
            groupId,
            inp.itemName,
            colVals,
          );
          createdItemId = result.id;
          row.createdItemId = createdItemId;
        } catch (err) {
          row.status = "error";
          row.error = `create_item failed: ${(err as Error).message}`;
          progress.failed++;
          progress.completed++;
          callbacks.onRowUpdate(rowIdx, row);
          return;
        }

        // ── Phase 2: attach images (if any) ──────────────────────────
        // If there are no images for this row, the item is created
        // successfully and the row is marked success — the user can
        // intentionally have rows without images (data-only rows mixed
        // with image rows).
        if (inp.images.length === 0) {
          row.status = "success";
          progress.succeeded++;
          progress.completed++;
          callbacks.onRowUpdate(rowIdx, row);
          return;
        }

        let allUploaded = true;
        for (const img of inp.images) {
          try {
            await uploadWithRetry(() =>
              addFileToColumn(
                token,
                createdItemId,
                fileColumnId,
                img.fileName,
                img.data,
                img.mimeType,
              ),
            );
            row.imagesSucceeded++;
          } catch (err) {
            allUploaded = false;
            row.error = `image upload failed: ${(err as Error).message}`;
          }
          callbacks.onRowUpdate(rowIdx, row);
        }

        if (allUploaded) {
          row.status = "success";
          progress.succeeded++;
        } else {
          row.status = "error";
          progress.failed++;
        }
        progress.completed++;
        callbacks.onRowUpdate(rowIdx, row);
      }),
    );
    callbacks.onBatchComplete({ ...progress });
    if (i + CREATE_BATCH_SIZE < inputs.length) {
      await sleep(CREATE_BATCH_DELAY_MS);
    }
  }

  return progress;
}
