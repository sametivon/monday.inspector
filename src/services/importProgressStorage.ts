import type { ImportProgress } from "../utils/types";

// Persists the last-known import progress snapshot to chrome.storage.local
// (falls back to localStorage in dev) so that reloading the panel mid-import
// — or coming back after one — doesn't lose what the user just did.
//
// This is NOT a resume mechanism: once the service worker / page reloads, any
// in-flight fetch() calls are gone. The snapshot is informational: show the
// user which rows succeeded/failed so they can fix and retry what didn't.

const STORAGE_KEY = "last_import_progress";

export interface PersistedImportProgress {
  progress: ImportProgress;
  /** epoch-ms when the snapshot was last written */
  updatedAt: number;
  /** whether the import had finished (runXXXImport resolved) by the time it was saved */
  finished: boolean;
  fileName: string;
  boardId: string;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

/** Save (overwrite) the current snapshot. Silent on error — never breaks the import. */
export async function saveImportProgress(
  snapshot: Omit<PersistedImportProgress, "updatedAt">,
): Promise<void> {
  const payload: PersistedImportProgress = { ...snapshot, updatedAt: Date.now() };
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Non-critical — progress persistence should never surface an error.
  }
}

/** Return the most recent snapshot, or null if none / storage unavailable. */
export async function loadImportProgress(): Promise<PersistedImportProgress | null> {
  try {
    if (hasChromeStorage()) {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (result[STORAGE_KEY] as PersistedImportProgress) ?? null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedImportProgress) : null;
  } catch {
    return null;
  }
}

/** Forget the stored snapshot (e.g. after the user dismisses the "last import" banner). */
export async function clearImportProgress(): Promise<void> {
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.remove(STORAGE_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}
