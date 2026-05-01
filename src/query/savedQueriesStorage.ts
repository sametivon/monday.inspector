// Saved query library — persists user-built queries to chrome.storage so
// they survive reloads and can be shared across the popup, panel, and the
// new full Query Inspector page.

const STORAGE_KEY = "saved_queries_v1";

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  variables?: string; // JSON string so the editor round-trips it cleanly
  createdAt: number;
  updatedAt: number;
}

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

export async function loadSavedQueries(): Promise<SavedQuery[]> {
  try {
    if (hasChromeStorage()) {
      const out = await chrome.storage.local.get(STORAGE_KEY);
      return (out[STORAGE_KEY] as SavedQuery[]) ?? [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedQuery[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: SavedQuery[]): Promise<void> {
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [STORAGE_KEY]: list });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    // Non-critical
  }
}

/**
 * Insert or overwrite a saved query. Returns the persisted record.
 * If `id` is omitted a new one is generated.
 */
export async function upsertSavedQuery(
  partial: Omit<SavedQuery, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Promise<SavedQuery> {
  const list = await loadSavedQueries();
  const now = Date.now();

  if (partial.id) {
    const idx = list.findIndex((q) => q.id === partial.id);
    if (idx >= 0) {
      const updated: SavedQuery = {
        ...list[idx],
        name: partial.name,
        query: partial.query,
        variables: partial.variables,
        updatedAt: now,
      };
      list[idx] = updated;
      await writeAll(list);
      return updated;
    }
  }

  const created: SavedQuery = {
    id: partial.id ?? `q-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: partial.name,
    query: partial.query,
    variables: partial.variables,
    createdAt: now,
    updatedAt: now,
  };
  list.unshift(created);
  await writeAll(list);
  return created;
}

export async function deleteSavedQuery(id: string): Promise<void> {
  const list = await loadSavedQueries();
  await writeAll(list.filter((q) => q.id !== id));
}

/** Export the entire saved-query library as a downloadable JSON blob. */
export function exportSavedQueriesAsJson(list: SavedQuery[]): string {
  return JSON.stringify({ version: 1, queries: list }, null, 2);
}

/** Best-effort import; returns the count successfully merged in. */
export async function importSavedQueries(json: string): Promise<number> {
  try {
    const parsed = JSON.parse(json) as { version?: number; queries?: SavedQuery[] };
    const incoming = parsed.queries ?? [];
    const existing = await loadSavedQueries();
    const byId = new Map(existing.map((q) => [q.id, q]));
    let added = 0;
    for (const q of incoming) {
      if (!q.id || !q.name || !q.query) continue;
      byId.set(q.id, q);
      added++;
    }
    await writeAll(Array.from(byId.values()));
    return added;
  } catch {
    return 0;
  }
}
