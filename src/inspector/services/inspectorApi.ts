/**
 * Wrapped API calls that log every request/response to the LogsTab store.
 */
import { addLogEntry, type ApiLogEntry } from "../components/LogsTab";
import {
  fetchBoardName as _fetchBoardName,
  fetchBoardColumns as _fetchBoardColumns,
  fetchBoardGroups as _fetchBoardGroups,
  fetchBoardItemsWithColumns as _fetchBoardItemsWithColumns,
  fetchSubitemBoardId as _fetchSubitemBoardId,
  fetchSubitemColumns as _fetchSubitemColumns,
  fetchSubitems as _fetchSubitems,
  fetchSubitemsForMany as _fetchSubitemsForMany,
  fetchBoardSchema as _fetchBoardSchema,
  changeColumnValue as _changeColumnValue,
  deleteItem as _deleteItem,
  executeRawQuery as _executeRawQuery,
  type RawQueryResult,
  type BoardSchema,
  formatColumnValueForApi,
} from "../../services/mondayApi";
import { addComplexity } from "../services/complexityStore";
import type { MondayColumn, MondayGroup, MondayItem } from "../../utils/types";

let logId = 0;

async function logged<T>(
  operation: string,
  variables: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const id = `log-${++logId}-${Date.now()}`;
  const entry: ApiLogEntry = {
    id,
    timestamp: Date.now(),
    operation,
    variables,
    durationMs: 0,
    status: "pending",
  };
  addLogEntry(entry);

  const start = performance.now();
  try {
    const result = await fn();
    entry.durationMs = Math.round(performance.now() - start);
    entry.status = "success";
    entry.response = result;
    // Trigger re-render by re-adding (updates in-place since same id, but we need to notify listeners)
    addLogEntry({ ...entry });
    return result;
  } catch (err) {
    entry.durationMs = Math.round(performance.now() - start);
    entry.status = "error";
    entry.error = (err as Error).message;
    addLogEntry({ ...entry });
    throw err;
  }
}

export async function fetchBoardSchema(token: string, boardId: string): Promise<BoardSchema> {
  return logged("fetchBoardSchema", { boardId }, () => _fetchBoardSchema(token, boardId));
}

export async function fetchBoardName(token: string, boardId: string): Promise<string> {
  return logged("fetchBoardName", { boardId }, () => _fetchBoardName(token, boardId));
}

export async function fetchBoardColumns(token: string, boardId: string): Promise<MondayColumn[]> {
  return logged("fetchBoardColumns", { boardId }, () => _fetchBoardColumns(token, boardId));
}

export async function fetchBoardGroups(token: string, boardId: string): Promise<MondayGroup[]> {
  return logged("fetchBoardGroups", { boardId }, () => _fetchBoardGroups(token, boardId));
}

export async function fetchBoardItemsWithColumns(
  token: string,
  boardId: string,
  onPage?: (page: MondayItem[], total: number) => void,
): Promise<MondayItem[]> {
  return logged("fetchBoardItemsWithColumns", { boardId }, () =>
    _fetchBoardItemsWithColumns(token, boardId, onPage),
  );
}

export async function fetchSubitemBoardId(token: string, parentBoardId: string): Promise<string | null> {
  return logged("fetchSubitemBoardId", { parentBoardId }, () =>
    _fetchSubitemBoardId(token, parentBoardId),
  );
}

export async function fetchSubitemColumns(token: string, boardId: string): Promise<MondayColumn[]> {
  return logged("fetchSubitemColumns", { boardId }, () => _fetchSubitemColumns(token, boardId));
}

export async function fetchSubitems(token: string, parentItemId: string): Promise<MondayItem[]> {
  return logged("fetchSubitems", { parentItemId }, () => _fetchSubitems(token, parentItemId));
}

export async function fetchSubitemsForMany(
  token: string,
  parentItemIds: string[],
): Promise<Record<string, MondayItem[]>> {
  return logged("fetchSubitemsForMany", { count: parentItemIds.length }, () =>
    _fetchSubitemsForMany(token, parentItemIds),
  );
}

export async function changeColumnValue(
  token: string,
  boardId: string,
  itemId: string,
  columnId: string,
  value: unknown,
): Promise<void> {
  return logged("changeColumnValue", { boardId, itemId, columnId, value }, () =>
    _changeColumnValue(token, boardId, itemId, columnId, value),
  );
}

export async function deleteItem(
  token: string,
  itemId: string,
): Promise<void> {
  return logged("deleteItem", { itemId }, () => _deleteItem(token, itemId));
}

export async function executeRawQuery(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<RawQueryResult> {
  const result = await logged("executeRawQuery", { query: query.slice(0, 80) }, () =>
    _executeRawQuery(token, query, variables),
  );
  // Feed complexity data to the budget monitor
  if (result.complexity) {
    addComplexity(result.complexity);
  }
  return result;
}

// Re-export formatColumnValueForApi directly (no logging needed, it's local formatting)
export { formatColumnValueForApi };
