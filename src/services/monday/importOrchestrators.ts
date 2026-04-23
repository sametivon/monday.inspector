import { BATCH_DELAY_MS, BATCH_SIZE } from "../../utils/constants";
import type {
  ColumnMapping,
  ImportProgress,
  MondayColumn,
  ParentIdentifier,
  ParsedFileFlat,
  ParsedFileMondayExport,
  RowResult,
} from "../../utils/types";
import { sleep } from "./graphqlClient";
import {
  buildColumnValues,
  createItem,
  createSubitem,
  fetchBoardGroups,
  fetchBoardItems,
} from "./queries";

// Two-phase import orchestrators for CSV/XLSX → monday.com.
//
// Three entry points:
//   • runImport                  — flat file, subitems only (parents by name/id)
//   • runMondayExportImport      — monday export, subitems only (parents exist)
//   • runFullMondayExportImport  — monday export, create parents THEN subitems
//
// They share a single `processInBatches()` helper that owns the
// slice → Promise.all → sleep loop and the rate-limit-friendly batch cadence.

export interface ImportCallbacks {
  onRowUpdate: (rowIndex: number, result: Partial<RowResult>) => void;
  onBatchComplete: (progress: ImportProgress) => void;
}

/**
 * Process an array in concurrent batches, sleeping between batches to stay
 * under monday.com's rate limits. Used by all import orchestrators to keep
 * their batching behaviour (and error-bucketing) identical.
 *
 * The per-item handler is expected to mutate `progress` (row status, counts)
 * and call `callbacks.onRowUpdate` itself; this helper only owns the slicing,
 * Promise.all, per-batch notification, and inter-batch sleep.
 */
async function processInBatches<T>(
  items: T[],
  progress: ImportProgress,
  callbacks: ImportCallbacks,
  handler: (item: T, rowIndex: number) => Promise<void>,
  rowIndexOffset = 0,
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((item, batchIdx) =>
        handler(item, rowIndexOffset + i + batchIdx),
      ),
    );
    callbacks.onBatchComplete({ ...progress });

    if (i + BATCH_SIZE < items.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}

function makePendingRow(
  rowIndex: number,
  kind: "parent" | "subitem",
): RowResult {
  return {
    rowIndex,
    kind,
    itemName: "",
    parentItemId: "",
    subitemName: "",
    status: "pending",
  };
}

/**
 * Run import from a flat CSV/XLSX file: resolve parents → batch create subitems.
 */
export async function runImport(
  token: string,
  file: ParsedFileFlat,
  parentId: ParentIdentifier,
  subitemNameColumn: string,
  mappings: ColumnMapping[],
  boardId: string,
  subitemColumns: MondayColumn[],
  callbacks: ImportCallbacks,
): Promise<ImportProgress> {
  const progress: ImportProgress = {
    total: file.rows.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    rows: file.rows.map((_, i) => makePendingRow(i, "subitem")),
  };

  let parentMap: Map<string, string> | undefined;
  if (parentId.type === "item_name") {
    const items = await fetchBoardItems(token, boardId);
    parentMap = new Map(items.map((item) => [item.name.trim(), item.id]));
  }

  await processInBatches(file.rows, progress, callbacks, async (row, rowIndex) => {
    const rowResult = progress.rows[rowIndex];

    const parentRaw = row[parentId.fileColumn]?.trim() ?? "";
    const resolvedParentId =
      parentId.type === "item_id"
        ? parentRaw
        : (parentMap?.get(parentRaw) ?? "");

    if (!resolvedParentId) {
      rowResult.status = "error";
      rowResult.error = `Parent item not found: "${parentRaw}"`;
      progress.failed++;
      progress.completed++;
      callbacks.onRowUpdate(rowIndex, rowResult);
      return;
    }

    rowResult.parentItemId = resolvedParentId;
    const name = row[subitemNameColumn]?.trim() ?? `Row ${rowIndex + 1}`;
    rowResult.subitemName = name;
    rowResult.itemName = name;
    rowResult.status = "importing";
    callbacks.onRowUpdate(rowIndex, rowResult);

    const colVals = await buildColumnValues(token, mappings, row, subitemColumns);

    try {
      const result = await createSubitem(token, resolvedParentId, name, colVals);
      rowResult.status = "success";
      rowResult.createdSubitemId = result.id;
      rowResult.createdItemId = result.id;
      progress.succeeded++;
    } catch (err) {
      rowResult.status = "error";
      rowResult.error = (err as Error).message;
      progress.failed++;
    }

    progress.completed++;
    callbacks.onRowUpdate(rowIndex, rowResult);
  });

  return progress;
}

/**
 * Import only subitems from a parsed monday.com export (parents must exist).
 */
export async function runMondayExportImport(
  token: string,
  file: ParsedFileMondayExport,
  mappings: ColumnMapping[],
  boardId: string,
  subitemColumns: MondayColumn[],
  callbacks: ImportCallbacks,
): Promise<ImportProgress> {
  const { flatSubitems } = file;

  const progress: ImportProgress = {
    total: flatSubitems.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    rows: flatSubitems.map((_, i) => makePendingRow(i, "subitem")),
  };

  const items = await fetchBoardItems(token, boardId);
  const parentMap = new Map(items.map((item) => [item.name.trim(), item.id]));

  await processInBatches(flatSubitems, progress, callbacks, async (sub, rowIndex) => {
    const rowResult = progress.rows[rowIndex];
    const resolvedParentId = parentMap.get(sub.parentItemName) ?? "";

    if (!resolvedParentId) {
      rowResult.status = "error";
      rowResult.error = `Parent item not found: "${sub.parentItemName}"`;
      rowResult.subitemName = sub.subitemName;
      rowResult.itemName = sub.subitemName;
      progress.failed++;
      progress.completed++;
      callbacks.onRowUpdate(rowIndex, rowResult);
      return;
    }

    rowResult.parentItemId = resolvedParentId;
    rowResult.subitemName = sub.subitemName;
    rowResult.itemName = sub.subitemName;
    rowResult.status = "importing";
    callbacks.onRowUpdate(rowIndex, rowResult);

    const colVals = await buildColumnValues(token, mappings, sub.values, subitemColumns);

    try {
      const result = await createSubitem(
        token,
        resolvedParentId,
        sub.subitemName,
        colVals,
      );
      rowResult.status = "success";
      rowResult.createdSubitemId = result.id;
      rowResult.createdItemId = result.id;
      progress.succeeded++;
    } catch (err) {
      rowResult.status = "error";
      rowResult.error = (err as Error).message;
      progress.failed++;
    }

    progress.completed++;
    callbacks.onRowUpdate(rowIndex, rowResult);
  });

  return progress;
}

/**
 * Two-phase import from a monday.com export:
 *   Phase 1: Create parent items (with column values)
 *   Phase 2: Create subitems under the newly created parents
 */
export async function runFullMondayExportImport(
  token: string,
  file: ParsedFileMondayExport,
  parentMappings: ColumnMapping[],
  subitemMappings: ColumnMapping[],
  boardId: string,
  boardColumns: MondayColumn[],
  subitemColumns: MondayColumn[],
  callbacks: ImportCallbacks,
): Promise<ImportProgress> {
  // Flatten all parent items from all groups into a single ordered list.
  const allParents: {
    groupName: string;
    name: string;
    values: Record<string, string>;
  }[] = [];
  for (const group of file.groups) {
    for (const item of group.items) {
      allParents.push({
        groupName: group.groupName,
        name: item.name,
        values: item.values,
      });
    }
  }

  const totalRows = allParents.length + file.flatSubitems.length;

  const progress: ImportProgress = {
    total: totalRows,
    completed: 0,
    succeeded: 0,
    failed: 0,
    rows: [
      ...allParents.map((_, i) => makePendingRow(i, "parent")),
      ...file.flatSubitems.map((_, i) =>
        makePendingRow(allParents.length + i, "subitem"),
      ),
    ],
  };

  // ── Phase 0: Resolve group name → group ID ─────────────────────────
  const boardGroups = await fetchBoardGroups(token, boardId);
  const groupMap = new Map(boardGroups.map((g) => [g.title.trim(), g.id]));

  // ── Phase 1: Create parent items ──────────────────────────────────
  // Composite key (group + name) → new item id, so we can disambiguate
  // duplicate parent names that exist in different groups.
  const parentIdMap = new Map<string, string>();
  const parentKey = (group: string, name: string) => `${group}|||${name}`;

  await processInBatches(allParents, progress, callbacks, async (parent, rowIndex) => {
    const rowResult = progress.rows[rowIndex];

    rowResult.itemName = parent.name;
    rowResult.status = "importing";
    callbacks.onRowUpdate(rowIndex, rowResult);

    const colVals = await buildColumnValues(
      token,
      parentMappings,
      parent.values,
      boardColumns,
    );

    const groupId = groupMap.get(parent.groupName) ?? undefined;

    try {
      const result = await createItem(token, boardId, groupId, parent.name, colVals);
      rowResult.status = "success";
      rowResult.createdItemId = result.id;
      parentIdMap.set(parentKey(parent.groupName, parent.name), result.id);
      progress.succeeded++;
    } catch (err) {
      rowResult.status = "error";
      rowResult.error = (err as Error).message;
      progress.failed++;
    }

    progress.completed++;
    callbacks.onRowUpdate(rowIndex, rowResult);
  });

  // ── Phase 2: Create subitems under newly created parents ──────────
  await processInBatches(
    file.flatSubitems,
    progress,
    callbacks,
    async (sub, rowIndex) => {
      const rowResult = progress.rows[rowIndex];

      const resolvedParentId =
        parentIdMap.get(parentKey(sub.groupName, sub.parentItemName)) ??
        parentIdMap.get(parentKey("", sub.parentItemName)) ??
        "";

      if (!resolvedParentId) {
        rowResult.status = "error";
        rowResult.error = `Parent item "${sub.parentItemName}" was not created (failed in Phase 1)`;
        rowResult.itemName = sub.subitemName;
        rowResult.subitemName = sub.subitemName;
        progress.failed++;
        progress.completed++;
        callbacks.onRowUpdate(rowIndex, rowResult);
        return;
      }

      rowResult.parentItemId = resolvedParentId;
      rowResult.subitemName = sub.subitemName;
      rowResult.itemName = sub.subitemName;
      rowResult.status = "importing";
      callbacks.onRowUpdate(rowIndex, rowResult);

      const colVals = await buildColumnValues(
        token,
        subitemMappings,
        sub.values,
        subitemColumns,
      );

      try {
        const result = await createSubitem(
          token,
          resolvedParentId,
          sub.subitemName,
          colVals,
        );
        rowResult.status = "success";
        rowResult.createdSubitemId = result.id;
        rowResult.createdItemId = result.id;
        progress.succeeded++;
      } catch (err) {
        rowResult.status = "error";
        rowResult.error = (err as Error).message;
        progress.failed++;
      }

      progress.completed++;
      callbacks.onRowUpdate(rowIndex, rowResult);
    },
    allParents.length, // subitem rowIndexOffset starts after all parents
  );

  return progress;
}
