import { describe, it, expect, beforeEach, vi } from "vitest";
import { runImageImportWithCreate } from "./imageImportOrchestrator";
import type { ColumnMapping, MondayColumn } from "../../utils/types";

// The orchestrator is the integration point that ties create_item to the
// file-upload mutation. We stub global.fetch so the test doesn't talk to
// monday's real API but still exercises the full call sequence: build
// column-values → POST to /v2 → POST to /v2/file → mark row success.

const COLUMNS: MondayColumn[] = [
  { id: "name", title: "Name", type: "text", settings_str: "{}" },
  { id: "status", title: "Status", type: "status", settings_str: "{}" },
];

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);

function makeFetchResponses(...responses: Array<{ ok: boolean; body: unknown }>) {
  // We pop from this array on every call, oldest first, so the test can
  // declare the expected call sequence in the same order as the runtime.
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected extra fetch() call");
    return {
      ok: next.ok,
      status: next.ok ? 200 : 400,
      statusText: next.ok ? "OK" : "Bad Request",
      text: async () => JSON.stringify(next.body),
      json: async () => next.body,
    } as Response;
  });
}

describe("runImageImportWithCreate", () => {
  beforeEach(() => {
    // Real timers — withRetry uses setTimeout for exponential backoff and
    // fake timers would require manual advancement at every retry. Test
    // worst-case is ~6s for the all-retries-exhausted path, which is fine.
    vi.useRealTimers();
  });

  it("creates an item per row and attaches the row's image", async () => {
    // Fetch sequence per row:
    //   1) create_item → returns { data: { create_item: { id: "1234" } } }
    //   2) file upload → returns { data: { add_file_to_column: { id: "ast" } } }
    const fetchMock = makeFetchResponses(
      { ok: true, body: { data: { create_item: { id: "1234" } } } },
      { ok: true, body: { data: { add_file_to_column: { id: "ast1" } } } },
    );
    vi.stubGlobal("fetch", fetchMock);

    const onRowUpdate = vi.fn();
    const onBatchComplete = vi.fn();

    const result = await runImageImportWithCreate(
      "test-token",
      "board-1",
      undefined, // no group — drop into default
      [], // no extra column mappings
      "files",
      COLUMNS,
      [
        {
          rowIndex: 3,
          itemName: "Widget A",
          rowValues: { Name: "Widget A" },
          images: [{ fileName: "img.png", data: PNG, mimeType: "image/png" }],
        },
      ],
      { onRowUpdate, onBatchComplete },
    );

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.rows[0].createdItemId).toBe("1234");
    expect(result.rows[0].imagesSucceeded).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks the row as error and skips upload if create_item fails", async () => {
    // createItem -> gql() -> withRetry wraps GraphQL calls with retries.
    // Default is 3 retries → 4 attempts total. Queue one error per
    // attempt so we test the realistic "all attempts failed" path.
    const errorBody = { errors: [{ message: "Group not found" }] };
    const fetchMock = makeFetchResponses(
      { ok: true, body: errorBody },
      { ok: true, body: errorBody },
      { ok: true, body: errorBody },
      { ok: true, body: errorBody },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runImageImportWithCreate(
      "tok",
      "b",
      "missing-group",
      [],
      "files",
      COLUMNS,
      [
        {
          rowIndex: 1,
          itemName: "X",
          rowValues: { Name: "X" },
          images: [{ fileName: "i.png", data: PNG, mimeType: "image/png" }],
        },
      ],
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.rows[0].error).toContain("create_item failed");
    // Four create attempts, no file upload — the orchestrator must NOT
    // attempt to upload to a non-existent item id.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  }, 30_000);

  it("succeeds without image when the row has none (data-only row)", async () => {
    const fetchMock = makeFetchResponses({
      ok: true,
      body: { data: { create_item: { id: "9" } } },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runImageImportWithCreate(
      "tok",
      "b",
      undefined,
      [],
      "files",
      COLUMNS,
      [
        {
          rowIndex: 2,
          itemName: "data only",
          rowValues: { Name: "data only" },
          images: [], // no image for this row
        },
      ],
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.succeeded).toBe(1);
    expect(result.rows[0].createdItemId).toBe("9");
    expect(result.rows[0].imagesTotal).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects rows with empty item names without calling the API", async () => {
    const fetchMock = makeFetchResponses();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runImageImportWithCreate(
      "tok",
      "b",
      undefined,
      [] as ColumnMapping[],
      "files",
      COLUMNS,
      [
        {
          rowIndex: 1,
          itemName: "  ",
          rowValues: {},
          images: [],
        },
      ],
      { onRowUpdate: () => {}, onBatchComplete: () => {} },
    );

    expect(result.failed).toBe(1);
    expect(result.rows[0].error).toContain("Item name is empty");
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
