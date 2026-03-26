/**
 * Central request queue with concurrency control, retry, and stats tracking.
 * All bulk operations should use this instead of raw API calls.
 */

import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "../../utils/constants";

export interface QueueStats {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
}

interface QueueEntry<T = unknown> {
  id: string;
  fn: () => Promise<T>;
  resolve: (val: T) => void;
  reject: (err: Error) => void;
  retries: number;
  status: "pending" | "running" | "succeeded" | "failed";
  error?: Error;
}

type StatsListener = (stats: QueueStats) => void;

const CONCURRENCY = 3;
let entryId = 0;

const queue: QueueEntry[] = [];
const failedEntries: QueueEntry[] = [];
let running = 0;
let succeeded = 0;
let failed = 0;
const listeners = new Set<StatsListener>();

function getStats(): QueueStats {
  return {
    pending: queue.filter((e) => e.status === "pending").length,
    running,
    succeeded,
    failed,
  };
}

function notify(): void {
  const stats = getStats();
  for (const l of listeners) l(stats);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function processEntry(entry: QueueEntry): Promise<void> {
  entry.status = "running";
  running++;
  notify();

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= entry.retries; attempt++) {
    try {
      const result = await entry.fn();
      entry.status = "succeeded";
      running--;
      succeeded++;
      notify();
      entry.resolve(result);
      drain();
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRateLimit = lastError.message.includes("Rate limited") || lastError.message.includes("429");
      if (attempt < entry.retries) {
        const delay = isRateLimit
          ? RETRY_BASE_DELAY_MS * 2 ** attempt
          : RETRY_BASE_DELAY_MS;
        await sleep(delay);
      }
    }
  }

  entry.status = "failed";
  entry.error = lastError;
  running--;
  failed++;
  failedEntries.push(entry);
  notify();
  entry.reject(lastError);
  drain();
}

function drain(): void {
  while (running < CONCURRENCY) {
    const next = queue.find((e) => e.status === "pending");
    if (!next) break;
    processEntry(next);
  }
}

/**
 * Enqueue a function for execution with concurrency + retry.
 */
export function enqueue<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry<T> = {
      id: `q-${++entryId}`,
      fn,
      resolve: resolve as (val: unknown) => void,
      reject,
      retries,
      status: "pending",
    };
    queue.push(entry as QueueEntry);
    drain();
  });
}

/**
 * Retry all failed entries.
 */
export function retryFailed(): Promise<void[]> {
  const toRetry = failedEntries.splice(0);
  failed -= toRetry.length;
  notify();

  return Promise.all(
    toRetry.map(
      (entry) =>
        enqueue(entry.fn, entry.retries).then(
          () => {},
          () => {},
        ),
    ),
  );
}

/**
 * Reset stats counters.
 */
export function resetStats(): void {
  succeeded = 0;
  failed = 0;
  failedEntries.length = 0;
  notify();
}

/**
 * Subscribe to stats changes. Returns unsubscribe function.
 */
export function onStatsChange(listener: StatsListener): () => void {
  listeners.add(listener);
  listener(getStats());
  return () => listeners.delete(listener);
}

/**
 * Get current stats snapshot.
 */
export { getStats };
