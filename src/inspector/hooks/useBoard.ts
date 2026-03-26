import { useState, useEffect, useCallback, useRef } from "react";
import type { MondayColumn, MondayGroup, MondayItem } from "../../utils/types";
import {
  fetchBoardColumns,
  fetchBoardGroups,
  fetchBoardItemsWithColumns,
  fetchSubitemBoardId,
  fetchSubitemColumns,
  fetchBoardName,
} from "../services/inspectorApi";

export interface BoardData {
  boardName: string;
  columns: MondayColumn[];
  groups: MondayGroup[];
  items: MondayItem[];
  subitemBoardId: string | null;
  subitemColumns: MondayColumn[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBoard(token: string, boardId: string | null): BoardData {
  const [boardName, setBoardName] = useState("");
  const [columns, setColumns] = useState<MondayColumn[]>([]);
  const [groups, setGroups] = useState<MondayGroup[]>([]);
  const [items, setItems] = useState<MondayItem[]>([]);
  const [subitemBoardId, setSubitemBoardId] = useState<string | null>(null);
  const [subitemColumns, setSubitemColumns] = useState<MondayColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (!token || !boardId) return;

    // Skip if already fetched for this token:boardId combo (unless forced)
    const key = `${token}:${boardId}`;
    if (!force && fetchedRef.current === key) return;
    fetchedRef.current = key;

    setLoading(true);
    setError(null);

    try {
      const [name, cols, grps, itms, subBoardId] = await Promise.all([
        fetchBoardName(token, boardId),
        fetchBoardColumns(token, boardId),
        fetchBoardGroups(token, boardId),
        fetchBoardItemsWithColumns(token, boardId),
        fetchSubitemBoardId(token, boardId),
      ]);

      setBoardName(name);
      setColumns(cols);
      setGroups(grps);
      setItems(itms);
      setSubitemBoardId(subBoardId);

      if (subBoardId) {
        const subCols = await fetchSubitemColumns(token, subBoardId);
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

  // Auto-load when token or boardId changes
  useEffect(() => {
    if (token && boardId) {
      load();
    }
  }, [token, boardId, load]);

  const refresh = useCallback(() => {
    fetchedRef.current = null; // Force reload
    load(true);
  }, [load]);

  return {
    boardName,
    columns,
    groups,
    items,
    subitemBoardId,
    subitemColumns,
    loading,
    error,
    refresh,
  };
}
