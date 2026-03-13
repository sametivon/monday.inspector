import {
  MONDAY_API_URL,
  BATCH_SIZE,
  BATCH_DELAY_MS,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
} from "../utils/constants";
import type {
  MondayBoard,
  MondayColumn,
  MondayItem,
  MondayGroup,
  CreateItemResult,
  CreateSubitemResult,
  ColumnMapping,
  RowResult,
  ImportProgress,
  ParentIdentifier,
  ParsedFileFlat,
  ParsedFileMondayExport,
} from "../utils/types";

// ── Low-level GraphQL caller ──────────────────────────────────────────

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: { message: string }[];
  error_message?: string;
  status_code?: number;
}

async function gql<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429) {
    throw new RateLimitError("Rate limited by monday.com API");
  }
  if (!res.ok) {
    throw new Error(`monday.com API HTTP ${res.status}: ${res.statusText}`);
  }

  const json: GraphQLResponse<T> = await res.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (json.error_message) {
    throw new Error(json.error_message);
  }

  return json.data as T;
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

// ── Retry helper with exponential backoff ─────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt === retries) break;

      const isRateLimit = lastError instanceof RateLimitError;
      const delay = isRateLimit
        ? RETRY_BASE_DELAY_MS * 2 ** attempt
        : RETRY_BASE_DELAY_MS;
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Public API helpers ────────────────────────────────────────────────

/** Cache of workspace users keyed by token to avoid cross-workspace stale data */
const usersCacheByToken = new Map<string, { id: number; name: string; email?: string }[]>();

export function clearUsersCache(): void {
  usersCacheByToken.clear();
}

async function getWorkspaceUsers(token: string): Promise<{ id: number; name: string; email?: string }[]> {
  const cached = usersCacheByToken.get(token);
  if (cached) return cached;
  try {
    const allUsers: { id: number; name: string; email?: string }[] = [];
    let page = 1;
    const limit = 100;
    while (true) {
      const query = `
        query ($limit: Int, $page: Int) {
          users(limit: $limit, page: $page) {
            id
            name
            email
          }
        }
      `;
      const data = await gql<{ users: { id: number; name: string; email?: string }[] }>(
        token,
        query,
        { limit, page },
      );
      const users = data.users ?? [];
      allUsers.push(...users);
      if (users.length < limit) break;
      page++;
    }
    usersCacheByToken.set(token, allUsers);
    return allUsers;
  } catch {
    return [];
  }
}

/**
 * Resolve a person by name or email for people column.
 */
export async function resolvePersonByNameOrEmail(
  token: string,
  value: string,
): Promise<{ id: number } | null> {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const users = await getWorkspaceUsers(token);
  const lower = trimmed.toLowerCase();
  const match = users.find(
    (u) =>
      u.name?.toLowerCase() === lower ||
      u.email?.toLowerCase() === lower ||
      u.name?.toLowerCase().startsWith(lower) ||
      (lower.includes(" ") && u.name?.toLowerCase().includes(lower)),
  );
  return match ? { id: match.id } : null;
}

/** Check if value represents "checked" for checkbox columns */
function isCheckedValue(val: string): boolean {
  const v = val.toLowerCase().trim();
  return v === "true" || v === "yes" || v === "1" || v === "x" || v === "checked" || v === "✓";
}

/**
 * Format a raw value for the Monday.com API based on column type.
 * Each column type expects a specific JSON structure; raw strings cause "invalid value" errors.
 *
 * @param column - The Monday column definition (used to resolve status labels from settings)
 */
export async function formatColumnValueForApi(
  token: string,
  columnType: string,
  value: string,
  column?: MondayColumn,
): Promise<unknown | null> {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  switch (columnType) {
    case "people":
    case "person": {
      const person = await resolvePersonByNameOrEmail(token, trimmed);
      if (person) {
        return { personsAndTeams: [{ id: person.id, kind: "person" as const }] };
      }
      return null;
    }
    case "status": {
      // Resolve case-insensitive label match from column settings
      const resolvedLabel = resolveStatusLabel(trimmed, column);
      return { label: resolvedLabel };
    }
    case "checkbox":
      return { checked: isCheckedValue(trimmed) ? "true" : "false" };
    case "date": {
      const parsed = parseToYYYYMMDD(trimmed);
      return parsed ? { date: parsed } : null;
    }
    case "timeline": {
      // Handle combined format: "2024-01-01 - 2024-01-31"
      const tlResult = parseTimelineValue(trimmed);
      return tlResult;
    }
    case "dropdown":
      return { labels: [trimmed] };
    case "tags":
      return null;
    case "link": {
      const [url, text] = trimmed.includes("|") ? trimmed.split("|", 2).map((s) => s.trim()) : [trimmed, trimmed];
      return { url: url || trimmed, text: text || trimmed };
    }
    case "text":
    case "long_text":
    case "numbers":
    case "email":
    case "phone":
      return trimmed;
    default:
      return trimmed;
  }
}

/**
 * Resolve a status label case-insensitively from column settings.
 * Monday.com rejects status values that don't match the exact casing.
 */
function resolveStatusLabel(value: string, column?: MondayColumn): string {
  if (!column?.settings_str) return value;
  try {
    const settings = JSON.parse(column.settings_str);
    const labels: Record<string, { label?: string }> = settings.labels ?? {};
    const lower = value.toLowerCase();
    for (const entry of Object.values(labels)) {
      if (entry.label && entry.label.toLowerCase() === lower) {
        return entry.label;
      }
    }
  } catch {
    // settings_str not parseable — use raw value
  }
  return value;
}

/**
 * Parse a timeline value that may be in combined format "date1 - date2"
 * or a single date (used as both from and to).
 */
function parseTimelineValue(value: string): { from: string; to: string } | null {
  // Try combined format: "2024-01-01 - 2024-01-31" or "2024-01-01 – 2024-01-31"
  // Use " - " or " – " (with spaces) to avoid splitting date hyphens
  const combinedMatch = value.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (combinedMatch) {
    const from = parseToYYYYMMDD(combinedMatch[1].trim());
    const to = parseToYYYYMMDD(combinedMatch[2].trim());
    if (from && to) return { from, to };
  }
  // Single date — use as both from and to
  const single = parseToYYYYMMDD(value);
  if (single) return { from: single, to: single };
  return null;
}

/** Parse date string to YYYY-MM-DD for Monday.com API */
function parseToYYYYMMDD(val: string): string | null {
  const s = val.trim();
  if (!s) return null;

  // Already in YYYY-MM-DD format — pass through directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try DD/MM/YYYY or DD-MM-YYYY (EU format: day > 12 disambiguates)
  const euMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (euMatch) {
    const [, a, b, yr] = euMatch;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    // If first number > 12, it must be a day (EU format DD/MM/YYYY)
    if (aNum > 12 && bNum <= 12) {
      return `${yr}-${String(bNum).padStart(2, "0")}-${String(aNum).padStart(2, "0")}`;
    }
    // If second number > 12, it must be a day (US format MM/DD/YYYY)
    if (bNum > 12 && aNum <= 12) {
      return `${yr}-${String(aNum).padStart(2, "0")}-${String(bNum).padStart(2, "0")}`;
    }
    // Ambiguous (both <= 12): default to MM/DD/YYYY (US format)
    return `${yr}-${String(aNum).padStart(2, "0")}-${String(bNum).padStart(2, "0")}`;
  }

  // Fallback: use Date constructor with UTC methods to avoid timezone off-by-one
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Build column values with proper formatting for people/status/timeline columns */
async function buildColumnValues(
  token: string,
  mappings: ColumnMapping[],
  values: Record<string, string>,
  columns: MondayColumn[],
): Promise<Record<string, unknown>> {
  const colMap = new Map(columns.map((c) => [c.id, c]));
  const result: Record<string, unknown> = {};

  // Group mappings by mondayColumnId for timeline (multiple export cols → one timeline)
  const timelineMappings = new Map<string, ColumnMapping[]>();
  for (const m of mappings) {
    if (!m.mondayColumnId || m.mondayColumnId === "__subitem_name__") continue;
    const col = colMap.get(m.mondayColumnId);
    if (col?.type === "timeline") {
      const list = timelineMappings.get(m.mondayColumnId) ?? [];
      list.push(m);
      timelineMappings.set(m.mondayColumnId, list);
    }
  }

  for (const m of mappings) {
    if (!m.mondayColumnId || m.mondayColumnId === "__subitem_name__") continue;
    const col = colMap.get(m.mondayColumnId);

    if (col?.type === "timeline") {
      const list = timelineMappings.get(m.mondayColumnId) ?? [];
      // Only process on the first mapping for this timeline column
      if (list.length > 0 && list[0] === m) {
        if (list.length === 1) {
          // Single mapping — value may be combined "date1 - date2" or a single date
          const raw = values[m.fileColumn] ?? "";
          if (raw.trim()) {
            const tlResult = parseTimelineValue(raw.trim());
            if (tlResult) result[m.mondayColumnId] = tlResult;
          }
        } else {
          // Multiple mappings — use keyword detection for from/to
          let from = "";
          let to = "";
          for (const tm of list) {
            const raw = values[tm.fileColumn] ?? "";
            const lower = tm.fileColumn.toLowerCase();
            const parsed = parseToYYYYMMDD(raw);
            if (!parsed) continue;
            if (
              lower.includes("start") ||
              lower.includes("begin") ||
              lower.includes("from")
            ) {
              from = parsed;
            } else if (lower.includes("end") || lower.includes("to")) {
              to = parsed;
            } else if (!from) {
              from = parsed;
            } else if (!to) {
              to = parsed;
            }
          }
          if (from || to) {
            result[m.mondayColumnId] = {
              from: from || to,
              to: to || from,
            };
          }
        }
      }
      continue;
    }

    const raw = values[m.fileColumn] ?? "";
    if (!raw.trim()) continue;
    const formatted = col
      ? await formatColumnValueForApi(token, col.type, raw, col)
      : raw.trim();
    if (formatted != null) result[m.mondayColumnId] = formatted;
  }
  return result;
}

/**
 * Verify that the API token is valid by fetching the current user.
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const query = `query { me { id } }`;
    await gql<{ me: { id: number } }>(token, query);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch columns for any board (parent or subitem board).
 */
async function fetchColumns(
  token: string,
  boardId: string,
): Promise<MondayColumn[]> {
  const query = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns { id title type settings_str }
      }
    }
  `;
  const data = await gql<{ boards: MondayBoard[] }>(token, query, {
    boardId: [boardId],
  });
  return data.boards[0]?.columns ?? [];
}

/** Fetch a board's columns (used for parent column mapping). */
export const fetchBoardColumns = fetchColumns;

/** Fetch the subitem-board's columns so we know what to populate. */
export const fetchSubitemColumns = fetchColumns;

/**
 * Fetch all groups on a board (needed to resolve group name → group ID).
 */
export async function fetchBoardGroups(
  token: string,
  boardId: string,
): Promise<MondayGroup[]> {
  const query = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        groups { id title }
      }
    }
  `;
  const data = await gql<{ boards: { groups: MondayGroup[] }[] }>(
    token,
    query,
    { boardId: [boardId] },
  );
  return data.boards[0]?.groups ?? [];
}

/**
 * Fetch all items on a board (for matching parent by name).
 * Paginates via cursor.
 */
export async function fetchBoardItems(
  token: string,
  boardId: string,
): Promise<MondayItem[]> {
  const items: MondayItem[] = [];
  let cursor: string | null = null;

  const firstQuery = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          cursor
          items { id name }
        }
      }
    }
  `;
  const first = await gql<{
    boards: { items_page: { cursor: string | null; items: MondayItem[] } }[];
  }>(token, firstQuery, { boardId: [boardId] });
  const page = first.boards[0]?.items_page;
  if (page) {
    items.push(...page.items);
    cursor = page.cursor;
  }

  while (cursor) {
    const nextQuery = `
      query ($cursor: String!) {
        next_items_page(cursor: $cursor, limit: 500) {
          cursor
          items { id name }
        }
      }
    `;
    const next = await gql<{
      next_items_page: { cursor: string | null; items: MondayItem[] };
    }>(token, nextQuery, { cursor });
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  return items;
}

/**
 * Fetch subitem board ID from a parent board.
 */
export async function fetchSubitemBoardId(
  token: string,
  parentBoardId: string,
): Promise<string | null> {
  const query = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns {
          id
          type
          settings_str
        }
      }
    }
  `;
  const data = await gql<{ boards: { columns: MondayColumn[] }[] }>(
    token,
    query,
    { boardId: [parentBoardId] },
  );

  const subCol = data.boards[0]?.columns.find((c) => c.type === "subtasks");
  if (!subCol?.settings_str) return null;

  try {
    const settings = JSON.parse(subCol.settings_str);
    return settings.boardIds?.[0]?.toString() ?? null;
  } catch {
    return null;
  }
}

// ── Core mutations ────────────────────────────────────────────────────

/**
 * Create a parent item on a board.
 */
export async function createItem(
  token: string,
  boardId: string,
  groupId: string | undefined,
  itemName: string,
  columnValues: Record<string, unknown>,
): Promise<CreateItemResult> {
  const mutation = groupId
    ? `
      mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON) {
        create_item(
          board_id: $boardId
          group_id: $groupId
          item_name: $itemName
          column_values: $columnValues
        ) {
          id
          name
        }
      }
    `
    : `
      mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON) {
        create_item(
          board_id: $boardId
          item_name: $itemName
          column_values: $columnValues
        ) {
          id
          name
        }
      }
    `;

  const variables: Record<string, unknown> = {
    boardId,
    itemName,
    columnValues: JSON.stringify(columnValues),
  };
  if (groupId) variables.groupId = groupId;

  const data = await withRetry(() =>
    gql<{ create_item: CreateItemResult }>(token, mutation, variables),
  );
  return data.create_item;
}

/**
 * Create one subitem under a parent item.
 */
export async function createSubitem(
  token: string,
  parentItemId: string,
  itemName: string,
  columnValues: Record<string, unknown>,
): Promise<CreateSubitemResult> {
  const mutation = `
    mutation ($parentItemId: ID!, $itemName: String!, $columnValues: JSON) {
      create_subitem(
        parent_item_id: $parentItemId
        item_name: $itemName
        column_values: $columnValues
      ) {
        id
        name
      }
    }
  `;

  const data = await withRetry(() =>
    gql<{ create_subitem: CreateSubitemResult }>(token, mutation, {
      parentItemId,
      itemName,
      columnValues: JSON.stringify(columnValues),
    }),
  );
  return data.create_subitem;
}

// ── Batch import orchestrators ────────────────────────────────────────

export interface ImportCallbacks {
  onRowUpdate: (rowIndex: number, result: Partial<RowResult>) => void;
  onBatchComplete: (progress: ImportProgress) => void;
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
    rows: file.rows.map((_, i) => ({
      rowIndex: i,
      kind: "subitem" as const,
      itemName: "",
      parentItemId: "",
      subitemName: "",
      status: "pending" as const,
    })),
  };

  let parentMap: Map<string, string> | undefined;
  if (parentId.type === "item_name") {
    const items = await fetchBoardItems(token, boardId);
    parentMap = new Map(items.map((item) => [item.name.trim(), item.id]));
  }

  for (let i = 0; i < file.rows.length; i += BATCH_SIZE) {
    const batch = file.rows.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (row, batchIdx) => {
      const rowIndex = i + batchIdx;
      const rowResult = progress.rows[rowIndex];

      const parentRaw = row[parentId.fileColumn]?.trim() ?? "";
      let resolvedParentId: string;

      if (parentId.type === "item_id") {
        resolvedParentId = parentRaw;
      } else {
        resolvedParentId = parentMap?.get(parentRaw) ?? "";
      }

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

    await Promise.all(batchPromises);
    callbacks.onBatchComplete({ ...progress });

    if (i + BATCH_SIZE < file.rows.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return progress;
}

// ── Monday.com export: subitems only ──────────────────────────────────

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
    rows: flatSubitems.map((_, i) => ({
      rowIndex: i,
      kind: "subitem" as const,
      itemName: "",
      parentItemId: "",
      subitemName: "",
      status: "pending" as const,
    })),
  };

  const items = await fetchBoardItems(token, boardId);
  const parentMap = new Map(items.map((item) => [item.name.trim(), item.id]));

  for (let i = 0; i < flatSubitems.length; i += BATCH_SIZE) {
    const batch = flatSubitems.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (sub, batchIdx) => {
      const rowIndex = i + batchIdx;
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

      const colVals = await buildColumnValues(
        token,
        mappings,
        sub.values,
        subitemColumns,
      );

      try {
        const result = await createSubitem(token, resolvedParentId, sub.subitemName, colVals);
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

    await Promise.all(batchPromises);
    callbacks.onBatchComplete({ ...progress });

    if (i + BATCH_SIZE < flatSubitems.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return progress;
}

// ── Monday.com export: FULL import (parents + subitems) ───────────────

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
  // Flatten all parent items and all subitems into a single progress list
  const allParents: { groupName: string; name: string; values: Record<string, string> }[] = [];
  for (const group of file.groups) {
    for (const item of group.items) {
      allParents.push({ groupName: group.groupName, name: item.name, values: item.values });
    }
  }

  const totalRows = allParents.length + file.flatSubitems.length;

  const progress: ImportProgress = {
    total: totalRows,
    completed: 0,
    succeeded: 0,
    failed: 0,
    rows: [
      // Parent rows first
      ...allParents.map((_, i) => ({
        rowIndex: i,
        kind: "parent" as const,
        itemName: "",
        parentItemId: "",
        subitemName: "",
        status: "pending" as const,
      })),
      // Subitem rows after
      ...file.flatSubitems.map((_, i) => ({
        rowIndex: allParents.length + i,
        kind: "subitem" as const,
        itemName: "",
        parentItemId: "",
        subitemName: "",
        status: "pending" as const,
      })),
    ],
  };

  // ── Phase 0: Resolve group name → group ID ─────────────────────────
  const boardGroups = await fetchBoardGroups(token, boardId);
  const groupMap = new Map(boardGroups.map((g) => [g.title.trim(), g.id]));

  // ── Phase 1: Create parent items ──────────────────────────────────
  // Build composite key (group+name) → newItemId map to handle duplicate names across groups
  const parentIdMap = new Map<string, string>();
  const parentKey = (group: string, name: string) => `${group}|||${name}`;

  for (let i = 0; i < allParents.length; i += BATCH_SIZE) {
    const batch = allParents.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (parent, batchIdx) => {
      const rowIndex = i + batchIdx;
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

    await Promise.all(batchPromises);
    callbacks.onBatchComplete({ ...progress });

    if (i + BATCH_SIZE < allParents.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // ── Phase 2: Create subitems under newly created parents ──────────
  const parentOffset = allParents.length;

  for (let i = 0; i < file.flatSubitems.length; i += BATCH_SIZE) {
    const batch = file.flatSubitems.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (sub, batchIdx) => {
      const rowIndex = parentOffset + i + batchIdx;
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
        const result = await createSubitem(token, resolvedParentId, sub.subitemName, colVals);
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

    await Promise.all(batchPromises);
    callbacks.onBatchComplete({ ...progress });

    if (i + BATCH_SIZE < file.flatSubitems.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return progress;
}
