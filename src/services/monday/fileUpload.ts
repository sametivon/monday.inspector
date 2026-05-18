import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from "../../utils/constants";
import { RateLimitError, sleep } from "./graphqlClient";

// File uploads use a different endpoint shape than the rest of the API:
//
//   POST https://api.monday.com/v2/file
//   Authorization: <token>
//   Content-Type: multipart/form-data
//   Form fields:
//     query           — the GraphQL mutation as a string, with item_id and
//                       column_id embedded as INLINE LITERALS (not GraphQL
//                       variables). Only $file is a variable.
//     variables[file] — the binary file under the GraphQL variable name
//                       referenced by $file in the mutation
//
// What about a `variables` JSON field?
//   Earlier versions of this client posted variables as a JSON field plus a
//   `variables[file]` field for the binary. monday's GraphQL multipart
//   parser doesn't merge those reliably (it returns 400 for some boards),
//   so we follow the documented working pattern: inline item_id and
//   column_id directly into the mutation, send only the file as a variable.
//
// References:
//   • https://developer.monday.com/api-reference/reference/files
//   • https://community.monday.com/t/upload-files-on-column-from-apis-monday-using-node-js/25328

const MONDAY_FILE_URL = "https://api.monday.com/v2/file";

/**
 * Escape a string value for safe inlining into a GraphQL double-quoted
 * string literal. Column IDs are practically always alphanumeric+underscore
 * (no quote / backslash hazards), but a strict escape costs nothing and
 * protects against future column-id changes.
 */
function escapeGraphQLString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/**
 * Upload a single file blob to a monday.com File column on a specific item.
 *
 * `data` may be a Uint8Array (what excelImageExtractor returns) or a Blob.
 * `fileName` is what shows up in the monday.com File column UI — we keep
 * the original Excel media filename when possible.
 */
export async function addFileToColumn(
  token: string,
  itemId: string | number,
  columnId: string,
  fileName: string,
  data: Uint8Array | Blob,
  mimeType: string,
): Promise<{ id: string }> {
  // Item IDs are 64-bit integers in monday's data model and arrive as
  // strings from our orchestrator. Validate before inlining so we don't
  // generate a mutation that 400s with a confusing parse error from
  // monday's side.
  const itemIdNumeric = String(itemId).trim();
  if (!/^\d+$/.test(itemIdNumeric)) {
    throw new Error(`Invalid monday item id "${itemId}" — expected digits only`);
  }
  const safeColumnId = escapeGraphQLString(columnId);

  const mutation = `mutation ($file: File!) {
    add_file_to_column (item_id: ${itemIdNumeric}, column_id: "${safeColumnId}", file: $file) {
      id
    }
  }`;

  const form = new FormData();
  form.append("query", mutation);

  // Reconstruct a Blob from Uint8Array if needed. We slice the buffer
  // first so we never accidentally hand a SharedArrayBuffer view to Blob.
  let blob: Blob;
  if (data instanceof Blob) {
    blob = data;
  } else {
    const slice = new Uint8Array(data.byteLength);
    slice.set(data);
    blob = new Blob([slice], { type: mimeType });
  }
  form.append("variables[file]", blob, fileName);

  // Do NOT set Content-Type by hand — the browser/fetch needs to set the
  // multipart boundary automatically. Manually setting Content-Type
  // suppresses the boundary parameter and the API rejects the request.
  const res = await fetch(MONDAY_FILE_URL, {
    method: "POST",
    headers: { Authorization: token },
    body: form,
  });

  if (res.status === 429) {
    throw new RateLimitError("Rate limited by monday.com API");
  }

  // Always read the body — both for success (asset id) and error (server
  // detail). If we trusted just `res.ok` here we'd lose the explanation
  // that monday's API returns in the JSON body on 200 with `errors`.
  const bodyText = await res.text();
  if (!res.ok) {
    // monday returns useful JSON detail in the body on 4xx. Surface it so
    // the per-row error column shows the actual problem (e.g. "Item not
    // found", "File column not found", "exceeds max file size").
    let detail = bodyText.slice(0, 400);
    try {
      const parsed = JSON.parse(bodyText) as {
        error_message?: string;
        errors?: { message: string }[];
      };
      if (parsed.errors?.length) detail = parsed.errors.map((e) => e.message).join("; ");
      else if (parsed.error_message) detail = parsed.error_message;
    } catch {
      /* not JSON — already have bodyText */
    }
    throw new Error(`monday.com file upload HTTP ${res.status}: ${detail}`);
  }

  let json: {
    data?: { add_file_to_column?: { id: string } };
    errors?: { message: string }[];
    error_message?: string;
  };
  try {
    json = JSON.parse(bodyText) as typeof json;
  } catch {
    throw new Error(`monday.com returned non-JSON response: ${bodyText.slice(0, 200)}`);
  }

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (json.error_message) {
    throw new Error(json.error_message);
  }

  const id = json.data?.add_file_to_column?.id;
  if (!id) {
    throw new Error(
      `monday.com returned no asset id from add_file_to_column: ${bodyText.slice(0, 200)}`,
    );
  }
  return { id };
}

/**
 * Wrap addFileToColumn in the same rate-limit-aware retry helper the rest
 * of the API client uses. Exponential backoff for 429s, flat retry for
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
