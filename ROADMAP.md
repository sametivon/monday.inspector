# Monday.com Inspector — Roadmap

Living doc. Pulls from monday.com community feature requests + Reddit + the
official monday API changelog. Items are ordered roughly by impact × effort.

---

## Shipped — v1.3.3 (Performance + DX)

- **Streaming pagination**: `fetchBoardItemsWithColumns` now streams pages
  (200 items each) into the UI as they arrive. On a 5k-item board that
  changes "wait 30s, see 5000 items" into "see the first 200 in ~600ms,
  rest paint in over the next few seconds." Adaptive: drops to 100/page if
  monday.com rejects the complexity budget.
- **Batched subitems fetch**: new `fetchSubitemsForMany(parentIds[])` does
  one round-trip for many parents — replaces the N+1 expand-all pattern.
- **Memoized HierarchyTab**: items-by-group Map + filtered list now in
  `useMemo`; the search box no longer triggers a full Map rebuild on each
  keystroke.
- **Native row virtualization**: `content-visibility: auto` on `.tree-item`
  lets the browser skip rendering offscreen rows — zero-dep, big win on
  expanded groups.
- **Loading-progress indicator**: Hierarchy now shows "loading more…" while
  pages stream in.
- **Project cleanup**: removed stale zips, malformed empty path folder, and
  orphaned `landing/email-sequences.md`.

---

## Next up — v1.3.4 candidates (pick 1–2)

### 🔥 Multi-level boards support
Monday released [multi-level boards](https://developer.monday.com/api-reference/docs/working-with-multi-level-boards) — up to 5 nested levels on the same board, no separate subitem board. The Inspector currently assumes the classic 2-level model.

What needs to change:
1. Bump GraphQL API-Version header `"2024-10"` → `"2026-04"` (required for
   `hierarchy_types` argument and multi-level fields).
2. Detect board type via `boards { hierarchy_type }` and branch UI:
   - Classic boards → today's behaviour (parent + subitem-board pair).
   - Multi-level → use `items_page(hierarchy_scope_config: "allItems")` and
     reconstruct hierarchy from `parent_item.id`.
3. Always use the **main board ID** for create/update/delete on multi-level
   boards (no separate subitem board).
4. Handle **rollup columns** — request `column_values(capabilities: [CALCULATED])`
   and add `BatteryValue` fragment for status-rollups (separate from
   `StatusValue`). Writes to rollup cells silently no-op; UI should disable
   editing on calculated cells.
5. List-board picker needs a `hierarchy_types: [classic, multi_level]` filter
   so multi-level boards actually show up.

Risk: bumping the API version is global. Test the import flow + Query tab
on a classic board first; fall through if a query depends on a 2024-10-only
shape.

### 🔥 Salesforce-Inspector-style Query page
Today's Query tab is inline + cramped. Salesforce Inspector opens query
work in its own page. Plan:
- New `src/query/` route mounted at `chrome.runtime.getURL("src/query/index.html")`
- Three-pane layout: schema browser (left) · editor (centre) · result table (right)
- Saved query library in `chrome.storage.local` with import/export
- Built-in templates (10–15): "All overdue items", "Items by status", "Audit
  log of last week's column changes", "Find duplicates by name", etc.
- One-click "convert to working code" for fetch/axios snippets
- CSV/JSON export of any result
- Complexity-budget meter that *predicts* cost before you hit run
- "Open in new tab" button on the existing inline Query tab routes here

### Bulk shift dates
Top community request: "shift all selected items' due dates by N days" (e.g.
yearly board reset). Quick add to ActionsTab → bulk update → "shift dates"
mode that takes a column + delta in days/weeks/months.

### Cross-board move/copy
Pick selected items → move (or duplicate) to a different board. Requires
`move_item_to_board` mutation. Common ask in monday community.

### Export with subitems on a single row
Today's Export menu CSV writes parents and subitems as separate sections.
Community wants a "wide" mode: one row per parent + repeated subitem
columns suffixed `_sub1`, `_sub2`, ... Add as a third Export option.

### Subitem updates export
Native monday export drops subitem column updates. We can fetch them via
`updates { id body created_at }` per item and include them in JSON exports.

---

## Backlog (no commitment yet)

- **Saved searches / pinned queries** in Hierarchy + Actions tab.
- **Diff view**: pick two items, side-by-side column diff.
- **Schema diff between boards**: highlight what's different to help align
  multiple project boards.
- **Workspace-wide search**: find item by name across all boards in a
  workspace (helpful for big tenants).
- **Time-travel logs**: replay/export the last N column changes (we already
  log API calls — extend to capture target state).
- **AI-assisted column mapping** during import (fall back gracefully if the
  user's monday.com tenant has no AI add-on).
- **Recurring import schedules** via `chrome.alarms` — re-import a remote
  CSV daily/weekly. Useful for syncing from external systems.
- **Rate-limit dashboard**: visualize complexity usage over time so power
  users plan around the 5M / minute budget.

---

## Things we will NOT build

- Mobile app fixes — we're a Chrome extension; mobile-monday limitations
  are out of scope.
- Anything that requires custom server infrastructure — privacy promise
  is "everything stays in your browser."
- Automations editor replacement — too entangled with monday's own UI.

---

## Sources / community signals

- [Working with multi-level boards (official)](https://developer.monday.com/api-reference/docs/working-with-multi-level-boards)
- [API support for multi-level boards (changelog)](https://developer.monday.com/api-reference/changelog/new-api-support-for-multi-level-boards)
- [Bulk subitem editing request](https://community.monday.com/t/ability-to-bulk-update-sub-items/79935)
- [Export with subitems on single row](https://community.monday.com/t/export-to-csv-in-excel-with-group-item-and-subitem-column-details-on-a-single-row/119618)
- [Export subitem updates](https://community.monday.com/t/export-subitem-updates/70758)
- [Mass updates via Export/Import](https://community.monday.com/t/mass-updates-using-export-import-excel/32447)
