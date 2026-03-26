/**
 * In-memory operation history for undo support.
 * Tracks created/updated items so they can be reverted.
 */

export interface OperationRecord {
  id: string;
  type: "create" | "update" | "delete";
  itemIds: string[];
  boardId: string;
  timestamp: number;
  description: string;
}

type HistoryListener = (records: OperationRecord[]) => void;

const MAX_RECORDS = 50;
const history: OperationRecord[] = [];
const listeners = new Set<HistoryListener>();
let nextId = 0;

function notify(): void {
  const snapshot = [...history];
  for (const l of listeners) l(snapshot);
}

export function addOperation(
  type: OperationRecord["type"],
  itemIds: string[],
  boardId: string,
  description: string,
): string {
  const id = `op-${++nextId}`;
  history.unshift({ id, type, itemIds, boardId, timestamp: Date.now(), description });
  if (history.length > MAX_RECORDS) history.pop();
  notify();
  return id;
}

export function getHistory(): OperationRecord[] {
  return [...history];
}

export function removeOperation(id: string): void {
  const idx = history.findIndex((r) => r.id === id);
  if (idx >= 0) {
    history.splice(idx, 1);
    notify();
  }
}

export function onHistoryChange(listener: HistoryListener): () => void {
  listeners.add(listener);
  listener([...history]);
  return () => listeners.delete(listener);
}
