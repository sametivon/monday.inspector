import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "../../utils/constants";
import { RateLimitError, sleep } from "./graphqlClient";

// File uploads use a different endpoint shape than the rest of the API:
//   POST https://api.monday.com/v2/file
//   Content-Type: multipart/form-data
//   Fields:
//     query     — the GraphQL mutation as a string
//     variables — JSON string of variables
//     <upload>  — the binary file under the variable name referenced by $file
//
// We can't pipe this through the existing `gql()` helper because that one
// only does JSON-bodied requests. Live with one bespoke fetch here rather
// than reshape the entire client for a single mutation.

const MONDAY_FILE_URL = "https://api.monday.com/v2/file";

const ADD_FILE_MUTATION = `
mutation ($itemId: ID!, $columnId: String!, $file: File!) {
  add_file_to_column(item_id: $itemId, column_id: $columnId, file: $file) {
    id
  }
}`;

/**
 * Upload a single file blob to a monday.com File column on a specific item.
 *
 * `data` may be a Uint8Array (what excelImageExtractor returns) or a Blob.
 * `fileName` is what shows up in the monday.com File column UI — we keep the
 * original Excel media filename when possible, falling back to a generated
 * name when callers don't have one (e.g. URL-based imports).
 */
export async function addFileToColumn(
  token: string,
  itemId: string | number,
  columnId: string,
  fileName: string,
  data: Uint8Array | Blob,
  mimeType: string,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("query", ADD_FILE_MUTATION);
  form.append(
    "variables",
    JSON.stringify({
      itemId: String(itemId),
      columnId,
      file: null,
    }),
  );

  // Reconstruct a Blob from Uint8Array if needed. We slice the buffer first
  // so we never accidentally hand a SharedArrayBuffer view to Blob (some TS
  // configs treat Uint8Array.buffer as ArrayBuffer | SharedArrayBuffer).
  let blob: Blob;
  if (data instanceof Blob) {
    blob = data;
  } else {
    const slice = new Uint8Array(data.byteLength);
    slice.set(data);
    blob = new Blob([slice], { type: mimeType });
  }

  // monday's docs are vague on the exact form-field name. Empirically:
  //   • The field name must match the GraphQL variable referenced in the
  //     mutation, here `variables[file]`. monday accepts the bracket form
  //     used by GraphQL multipart spec implementations.
  form.append("variables[file]", blob, fileName);

  const res = await fetch(MONDAY_FILE_URL, {
    method: "POST",
    headers: {
      Authorization: token,
      "API-Version": "2026-04",
    },
    body: form,
  });

  if (res.status === 429) {
    throw new RateLimitError("Rate limited by monday.com API");
  }
  if (!res.ok) {
    throw new Error(`monday.com file upload HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as {
    data?: { add_file_to_column?: { id: string } };
    errors?: { message: string }[];
    error_message?: string;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (json.error_message) {
    throw new Error(json.error_message);
  }

  const id = json.data?.add_file_to_column?.id;
  if (!id) {
    throw new Error("monday.com returned no asset id from add_file_to_column");
  }
  return { id };
}

/**
 * Wrap addFileToColumn in the same rate-limit-aware retry helper the rest of
 * the API client uses. Same exponential backoff for 429s, flat retry for
 * transient network errors.
 */
export async function uploadWithRetry(
  fn: () => Promise<{ id: string }>,
  retries = MAX_RETRIES,
): Promise<{ id: string }> {
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
