import type {
  ColumnMapping,
  CreateItemResult,
  CreateSubitemResult,
  MondayBoard,
  MondayColumn,
  MondayGroup,
  MondayItem,
} from "../../utils/types";
import {
  isCheckedValue,
  parseLinkValue,
  parseTimelineValue,
  parseToYYYYMMDD,
  resolveStatusLabel,
} from "../columnValueFormatters";
import { gql, withRetry } from "./graphqlClient";

// ── Users ─────────────────────────────────────────────────────────────

export interface WorkspaceUser {
  id: number;
  name: string;
  email?: string;
}

// Cache workspace users per-token to avoid cross-workspace stale data when
// the extension is used with multiple accounts during a session.
const usersCacheByToken = new Map<string, WorkspaceUser[]>();

export function clearUsersCache(): void {
  usersCacheByToken.clear();
}

export async function getWorkspaceUsers(token: string): Promise<WorkspaceUser[]> {
  const cached = usersCacheByToken.get(token);
  if (cached) return cached;
  try {
    const allUsers: WorkspaceUser[] = [];
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
      const data = await gql<{ users: WorkspaceUser[] }>(token, query, {
        limit,
        page,
      });
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

// ── Column-value formatting (needs API access for people resolution) ──

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
      const resolvedLabel = resolveStatusLabel(trimmed, column);
      return { label: resolvedLabel };
    }
    case "checkbox":
      return { checked: isCheckedValue(trimmed) ? "true" : "false" };
    case "date": {
      const parsed = parseToYYYYMMDD(trimmed);
      return parsed ? { date: parsed } : null;
    }
    case "timeline":
      return parseTimelineValue(trimmed);
    case "dropdown":
      return { labels: [trimmed] };
    case "tags":
      return null;
    case "link":
      return parseLinkValue(trimmed);
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

/** Build column values with proper formatting for people/status/timeline columns */
export async function buildColumnValues(
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

// ── Board schema ──────────────────────────────────────────────────────

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

export const fetchBoardColumns = fetchColumns;
export const fetchSubitemColumns = fetchColumns;

export interface BoardSchema {
  name: string;
  columns: MondayColumn[];
  groups: MondayGroup[];
  subitemBoardId: string | null;
}

/**
 * Fetch board name, columns, groups, and subitem board ID in a single query.
 * Replaces four separate calls (fetchBoardName, fetchBoardColumns,
 * fetchBoardGroups, fetchSubitemBoardId) with one round-trip.
 */
export async function fetchBoardSchema(
  token: string,
  boardId: string,
): Promise<BoardSchema> {
  const query = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        name
        columns { id title type settings_str }
        groups { id title }
      }
    }
  `;
  const data = await gql<{
    boards: { name: string; columns: MondayColumn[]; groups: MondayGroup[] }[];
  }>(token, query, { boardId: [boardId] });

  const board = data.boards[0];
  if (!board) return { name: "", columns: [], groups: [], subitemBoardId: null };

  return {
    name: board.name,
    columns: board.columns,
    groups: board.groups,
    subitemBoardId: extractSubitemBoardId(board.columns),
  };
}

/**
 * Pull the subitem board ID out of a columns list by parsing the
 * `subtasks` column's settings_str (monday doesn't expose this directly).
 */
function extractSubitemBoardId(columns: MondayColumn[]): string | null {
  const subCol = columns.find((c) => c.type === "subtasks");
  if (!subCol?.settings_str) return null;
  try {
    const settings = JSON.parse(subCol.settings_str);
    return settings.boardIds?.[0]?.toString() ?? null;
  } catch {
    return null;
  }
}

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
  const data = await gql<{ boards: { groups: MondayGroup[] }[] }>(token, query, {
    boardId: [boardId],
  });
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
  const data = await gql<{ boards: { columns: MondayColumn[] }[] }>(token, query, {
    boardId: [parentBoardId],
  });

  return extractSubitemBoardId(data.boards[0]?.columns ?? []);
}

/**
 * Fetch board name.
 */
export async function fetchBoardName(
  token: string,
  boardId: string,
): Promise<string> {
  const query = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) { name }
    }
  `;
  const data = await withRetry(() =>
    gql<{ boards: { name: string }[] }>(token, query, { boardId: [boardId] }),
  );
  return data.boards?.[0]?.name ?? "Unknown Board";
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

/**
 * Delete an item by ID.
 */
export async function deleteItem(token: string, itemId: string): Promise<void> {
  const mutation = `
    mutation ($itemId: ID!) {
      delete_item(item_id: $itemId) {
        id
      }
    }
  `;
  await withRetry(() =>
    gql<{ delete_item: { id: string } }>(token, mutation, { itemId }),
  );
}

// ── Inspector read/write APIs ────────────────────────────────────────

/**
 * Fetch all items on a board with full column values (paginated).
 *
 * Streams pages to `onPage` as they arrive so the UI can render the first
 * 200 items immediately while later pages keep loading in the background —
 * this is the biggest perceived-performance win on large boards.
 *
 * Page size starts large (500) and falls back automatically: monday.com's
 * complexity budget can reject a 500-page request on heavy column setups,
 * in which case `withRetry`'s rate-limit handling is bypassed and we
 * adaptively halve the page size for the rest of the run.
 */
export async function fetchBoardItemsWithColumns(
  token: string,
  boardId: string,
  onPage?: (page: MondayItem[], total: number) => void,
): Promise<MondayItem[]> {
  const allItems: MondayItem[] = [];
  let cursor: string | null = null;
  let pageSize = 200; // sweet spot for big boards — bigger blows complexity budget

  const fetchFirst = (limit: number) =>
    withRetry(() =>
      gql<{ boards: { items_page: { cursor: string | null; items: MondayItem[] } }[] }>(
        token,
        `query ($boardId: [ID!]!) {
          boards(ids: $boardId) {
            items_page(limit: ${limit}) {
              cursor
              items {
                id
                name
                group { id title }
                column_values { id text value type }
              }
            }
          }
        }`,
        { boardId: [boardId] },
      ),
    );

  // First page — try `pageSize`, fall back to 100 if monday rejects complexity
  let firstPage: { cursor: string | null; items: MondayItem[] } | null;
  try {
    const data = await fetchFirst(pageSize);
    firstPage = data.boards?.[0]?.items_page ?? null;
  } catch (err) {
    if (/complex/i.test((err as Error).message)) {
      pageSize = 100;
      const data = await fetchFirst(pageSize);
      firstPage = data.boards?.[0]?.items_page ?? null;
    } else {
      throw err;
    }
  }

  if (firstPage) {
    allItems.push(...firstPage.items);
    onPage?.(firstPage.items, allItems.length);
    cursor = firstPage.cursor;
  }

  while (cursor) {
    const nextQuery = `
      query ($cursor: String!) {
        next_items_page(limit: ${pageSize}, cursor: $cursor) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id text value type }
          }
        }
      }
    `;
    const next = await withRetry(() =>
      gql<{ next_items_page: { cursor: string | null; items: MondayItem[] } }>(
        token,
        nextQuery,
        { cursor },
      ),
    );
    const items = next.next_items_page.items;
    allItems.push(...items);
    onPage?.(items, allItems.length);
    cursor = next.next_items_page.cursor;
  }

  return allItems;
}

/**
 * Batch-fetch subitems for many parent items in one round-trip.
 * Avoids the N+1 fetchSubitems() pattern when expanding multiple rows.
 */
export async function fetchSubitemsForMany(
  token: string,
  parentItemIds: string[],
): Promise<Record<string, MondayItem[]>> {
  if (parentItemIds.length === 0) return {};
  const query = `
    query ($itemIds: [ID!]!) {
      items(ids: $itemIds) {
        id
        subitems {
          id
          name
          column_values { id text value type }
        }
      }
    }
  `;
  const data = await withRetry(() =>
    gql<{ items: { id: string; subitems: MondayItem[] }[] }>(token, query, {
      itemIds: parentItemIds,
    }),
  );
  const out: Record<string, MondayItem[]> = {};
  for (const it of data.items ?? []) {
    out[it.id] = it.subitems ?? [];
  }
  return out;
}

/**
 * Fetch subitems for a specific parent item, including column values.
 */
export async function fetchSubitems(
  token: string,
  parentItemId: string,
): Promise<MondayItem[]> {
  const query = `
    query ($itemId: [ID!]!) {
      items(ids: $itemId) {
        subitems {
          id
          name
          column_values { id text value type }
        }
      }
    }
  `;
  const data = await withRetry(() =>
    gql<{ items: { subitems: MondayItem[] }[] }>(token, query, {
      itemId: [parentItemId],
    }),
  );
  return data.items?.[0]?.subitems ?? [];
}

/**
 * Change a single column value on an item.
 */
export async function changeColumnValue(
  token: string,
  boardId: string,
  itemId: string,
  columnId: string,
  value: unknown,
): Promise<void> {
  const mutation = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id: $boardId
        item_id: $itemId
        column_id: $columnId
        value: $value
      ) { id }
    }
  `;
  await withRetry(() =>
    gql(token, mutation, {
      boardId,
      itemId,
      columnId,
      value: JSON.stringify(value),
    }),
  );
}
