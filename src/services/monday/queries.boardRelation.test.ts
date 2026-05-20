import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BoardRelationResolveError,
  clearLinkedBoardItemsCache,
  resolveBoardRelationValue,
} from "./queries";
import type { MondayColumn } from "../../utils/types";

// Unit-level coverage of resolveBoardRelationValue. The resolver is the
// single most failure-prone part of the importer because it crosses board
// boundaries (one network round-trip per linked board) AND has to balance
// "fail loud" vs "skip silently" depending on which path actually broke.
// Every error class below maps to a specific user-actionable message in
// the per-row error column.

function makeFetchResponses(responses: Array<{ ok: boolean; body: unknown }>) {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("Unexpected extra fetch() call");
    return {
      ok: next.ok,
      status: next.ok ? 200 : 401,
      statusText: next.ok ? "OK" : "Unauthorized",
      text: async () => JSON.stringify(next.body),
      json: async () => next.body,
    } as Response;
  });
}

function colWithLinkedBoards(...boardIds: string[]): MondayColumn {
  return {
    id: "connect_col",
    title: "Project Board",
    type: "board_relation",
    settings_str: JSON.stringify({ boardIds: boardIds.map(Number) }),
  };
}

function colWithRawSettings(settings: object): MondayColumn {
  return {
    id: "connect_col",
    title: "Project Board",
    type: "board_relation",
    settings_str: JSON.stringify(settings),
  };
}

describe("resolveBoardRelationValue", () => {
  beforeEach(() => {
    clearLinkedBoardItemsCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("passes numeric IDs through without fetching the linked board", async () => {
    const fetchMock = makeFetchResponses([]); // no calls allowed
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBoardRelationValue(
      "tok",
      "123, 456",
      colWithLinkedBoards("9999"),
    );
    expect(result).toEqual({ item_ids: [123, 456] });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("accepts both comma and semicolon as separators", async () => {
    vi.stubGlobal("fetch", makeFetchResponses([]));
    const result = await resolveBoardRelationValue(
      "tok",
      "123; 456, 789",
      colWithLinkedBoards("9999"),
    );
    expect(result?.item_ids).toEqual([123, 456, 789]);
  });

  it("resolves names against the linked board", async () => {
    // Two API calls when there's one linked board: items_page primary,
    // then no cursor → no second page. Each fetch is one GraphQL POST.
    const fetchMock = makeFetchResponses([
      {
        ok: true,
        body: {
          data: {
            boards: [
              {
                items_page: {
                  cursor: null,
                  items: [
                    { id: "1001", name: "Alpha" },
                    { id: "1002", name: "Beta" },
                  ],
                },
              },
            ],
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveBoardRelationValue(
      "tok",
      "Alpha, Beta",
      colWithLinkedBoards("9999"),
    );
    expect(result?.item_ids.sort()).toEqual([1001, 1002]);
  });

  it("returns null (no throw) when the linked board has no matching names", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchResponses([
        {
          ok: true,
          body: {
            data: {
              boards: [
                {
                  items_page: { cursor: null, items: [{ id: "1", name: "Z" }] },
                },
              ],
            },
          },
        },
      ]),
    );
    const result = await resolveBoardRelationValue(
      "tok",
      "Nothing Matches",
      colWithLinkedBoards("9999"),
    );
    // No matching names + no numeric tokens = nothing to write, but
    // resolver had a fair shot at the linked board so we don't surface
    // it as an error. The importer omits the column for this row.
    expect(result).toBeNull();
  });

  it("throws BoardRelationResolveError when no boardIds are configured", async () => {
    const fetchMock = makeFetchResponses([]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(() =>
      resolveBoardRelationValue(
        "tok",
        "Some Name",
        colWithRawSettings({}),
      ),
    ).rejects.toThrow(BoardRelationResolveError);
    await expect(() =>
      resolveBoardRelationValue(
        "tok",
        "Some Name",
        colWithRawSettings({ boardIds: "not-an-array" }),
      ),
    ).rejects.toThrow(/no linked board configured/);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("throws when the linked board fetch fails AND we have no numeric fallback", async () => {
    // fetchBoardItems goes through withRetry — 4 attempts max. We queue
    // 4 401 responses so all retries exhaust.
    const errBody = { errors: [{ message: "Not authenticated" }] };
    vi.stubGlobal(
      "fetch",
      makeFetchResponses([
        { ok: true, body: errBody },
        { ok: true, body: errBody },
        { ok: true, body: errBody },
        { ok: true, body: errBody },
      ]),
    );

    await expect(() =>
      resolveBoardRelationValue(
        "tok",
        "Item A",
        colWithLinkedBoards("9999"),
      ),
    ).rejects.toThrow(BoardRelationResolveError);
    await expect(() =>
      resolveBoardRelationValue(
        "tok",
        "Item B",
        colWithLinkedBoards("8888"),
      ),
    ).rejects.toThrow(/cannot read the linked board/i);
  }, 60_000);

  it("does NOT throw when numeric IDs are present even if the linked board fetch fails", async () => {
    // Mixed input: name + numeric. Even though we can't resolve the name,
    // the numeric ID is enough to write — surface that, don't throw.
    const errBody = { errors: [{ message: "no auth" }] };
    vi.stubGlobal(
      "fetch",
      makeFetchResponses([
        { ok: true, body: errBody },
        { ok: true, body: errBody },
        { ok: true, body: errBody },
        { ok: true, body: errBody },
      ]),
    );

    const result = await resolveBoardRelationValue(
      "tok",
      "Item A, 555",
      colWithLinkedBoards("9999"),
    );
    expect(result?.item_ids).toEqual([555]);
  }, 60_000);

  it("caches the linked board's items map across calls with the same token+board", async () => {
    // 1 successful fetch, then a SECOND call should hit cache → no
    // additional API call. We queue exactly ONE response — the 2nd
    // resolveBoardRelationValue call must not consume another.
    const fetchMock = makeFetchResponses([
      {
        ok: true,
        body: {
          data: {
            boards: [
              {
                items_page: {
                  cursor: null,
                  items: [{ id: "1", name: "X" }],
                },
              },
            ],
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const a = await resolveBoardRelationValue(
      "tok",
      "X",
      colWithLinkedBoards("9999"),
    );
    const b = await resolveBoardRelationValue(
      "tok",
      "X",
      colWithLinkedBoards("9999"),
    );
    expect(a?.item_ids).toEqual([1]);
    expect(b?.item_ids).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clearLinkedBoardItemsCache forces a re-fetch on next call", async () => {
    const body = {
      ok: true,
      body: {
        data: {
          boards: [
            {
              items_page: { cursor: null, items: [{ id: "1", name: "X" }] },
            },
          ],
        },
      },
    };
    const fetchMock = makeFetchResponses([body, body]); // two calls expected
    vi.stubGlobal("fetch", fetchMock);

    await resolveBoardRelationValue("tok", "X", colWithLinkedBoards("9999"));
    clearLinkedBoardItemsCache();
    await resolveBoardRelationValue("tok", "X", colWithLinkedBoards("9999"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null for an empty cell value", async () => {
    vi.stubGlobal("fetch", makeFetchResponses([]));
    expect(
      await resolveBoardRelationValue("tok", "  ", colWithLinkedBoards("9999")),
    ).toBeNull();
    expect(
      await resolveBoardRelationValue("tok", "", colWithLinkedBoards("9999")),
    ).toBeNull();
  });
});
