import { BATCH_DELAY_MS } from "../../utils/constants";
import { addFileToColumn, uploadWithRetry } from "./fileUpload";
import { fetchBoardItems } from "./queries";
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
