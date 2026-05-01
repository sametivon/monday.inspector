import {
  MAX_RETRIES,
  MONDAY_API_URL,
  RETRY_BASE_DELAY_MS,
} from "../../utils/constants";

// Shared low-level GraphQL client for the monday.com REST endpoint. Owns:
//   • single `postGraphQL()` primitive with headers + rate-limit detection
//   • `gql()` wrapper that unwraps `data` and throws on any GraphQL error
//   • `executeRawQuery()` pass-through for the Query Editor tab (keeps
//     complexity + errors intact)
//   • `withRetry()` helper with rate-limit-aware exponential backoff

interface GraphQLRawResponse<T = unknown> {
  data?: T;
  errors?: { message: string }[];
  error_message?: string;
  status_code?: number;
  complexity?: { before: number; after: number; query: number };
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Single POST to the monday.com GraphQL endpoint.
 * Centralises headers, rate-limit detection, and HTTP error handling so the
 * caller only has to deal with the parsed response body.
 */
async function postGraphQL<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLRawResponse<T>> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      // 2026-04 unlocks multi-level boards: hierarchy_types argument,
      // hierarchy_scope_config, and rollup column capabilities. Classic
      // boards continue to work the same — additive change.
      "API-Version": "2026-04",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429) {
    throw new RateLimitError("Rate limited by monday.com API");
  }
  if (!res.ok) {
    throw new Error(`monday.com API HTTP ${res.status}: ${res.statusText}`);
  }

  return (await res.json()) as GraphQLRawResponse<T>;
}

/**
 * Execute a GraphQL query and return the `data` field, throwing on any
 * error surface reported by monday.com.
 */
export async function gql<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const json = await postGraphQL<T>(token, query, variables);

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (json.error_message) {
    throw new Error(json.error_message);
  }

  return json.data as T;
}

export interface RawQueryResult {
  data: unknown;
  complexity?: { before: number; after: number; query: number };
  errors?: { message: string }[];
}

/**
 * Execute an arbitrary GraphQL query and return the full response
 * (data + complexity + errors). Used by the Query Editor tab.
 */
export async function executeRawQuery(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<RawQueryResult> {
  const json = await postGraphQL(token, query, variables);
  return {
    data: json.data ?? null,
    complexity: json.complexity ?? undefined,
    errors: json.errors ?? undefined,
  };
}

/**
 * Retry an async operation. Uses exponential backoff for rate-limit errors
 * specifically (since monday.com's budget recovers over time), and a short
 * flat backoff for transient network/HTTP failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: Error = new Error("Unknown error");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
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

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
