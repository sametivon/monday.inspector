import { useState, useEffect, useCallback, useRef } from "react";
import type { MondayColumn, MondayGroup, MondayItem } from "../../utils/types";
import {
  fetchBoardSchema,
  fetchSubitemColumns,
  fetchBoardItemsWithColumns,
} from "../services/inspectorApi";

export interface BoardData {
  boardName: string;
  columns: MondayColumn[];
  groups: MondayGroup[];
  items: MondayItem[];
  subitemBoardId: string | null;
  subitemColumns: MondayColumn[];
  /** True while schema (columns/groups) is loading */
  loading: boolean;
  /** True while items are loading separately */
  itemsLoading: boolean;
  error: string | null;
  refresh: () => void;
  /** Trigger item fetch on demand (e.g. when switching to Items/Actions tab) */
  loadItems: () => void;
}

export function useBoard(token: string, boardId: string | null): BoardData {
  const [boardName, setBoardName] = useState("");
  const [columns, setColumns] = useState<MondayColumn[]>([]);
  const [groups, setGroups] = useState<MondayGroup[]>([]);
  const [items, setItems] = useState<MondayItem[]>([]);
  const [subitemBoardId, setSubitemBoardId] = useState<string | null>(null);
  const [subitemColumns, setSubitemColumns] = useState<MondayColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which token:boardId combo we've fetched schema/items for
  const schemaKeyRef = useRef<string | null>(null);
  const itemsKeyRef = useRef<string | null>(null);

  // ── Schema load (name + columns + groups + subitem board ID) ──────────
  const loadSchema = useCallback(async (force = false) => {
    if (!token || !boardId) return;

    const key = `${token}:${boardId}`;
    if (!force && schemaKeyRef.current === key) return;
    schemaKeyRef.current = key;

    setLoading(true);
    setError(null);

    try {
      const schema = await fetchBoardSchema(token, boardId);
      setBoardName(schema.name);
      setColumns(schema.columns);
      setGroups(schema.groups);
      setSubitemBoardId(schema.subitemBoardId);

      if (schema.subitemBoardId) {
        const subCols = await fetchSubitemColumns(token, schema.subitemBoardId);
        setSubitemColumns(subCols);
      } else {
        setSubitemColumns([]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, boardId]);

  // ── Items load (on demand) ────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    if (!token || !boardId) return;

    const key = `${token}:${boardId}`;
    if (itemsKeyRef.current === key) return; // already loaded
    itemsKeyRef.current = key;

    setItemsLoading(true);
    try {
      const fetched = await fetchBoardItemsWithColumns(token, boardId);
      setItems(fetched);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setItemsLoading(false);
    }
  }, [token, boardId]);

  // Auto-load schema when token or boardId changes
  useEffect(() => {
    if (token && boardId) {
      loadSchema();
    }
  }, [token, boardId, loadSchema]);

  const refresh = useCallback(() => {
    schemaKeyRef.current = null;
    itemsKeyRef.current = null;
    setItems([]);
    loadSchema(true);
  }, [loadSchema]);

  return {
    boardName,
    columns,
    groups,
    items,
    subitemBoardId,
    subitemColumns,
    loading,
    itemsLoading,
    error,
    refresh,
    loadItems,
  };
}
