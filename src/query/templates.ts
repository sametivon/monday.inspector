// Curated GraphQL templates for the full-page Query Inspector.
//
// Each template is a small, well-commented monday.com query that the user
// can run as-is or treat as a starting point. Categories help discovery.
//
// Variables follow monday.com's GraphQL convention: declared at the top
// of the query, passed via the variables panel in the editor.

export interface QueryTemplate {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  query: string;
  /** Default variables shown in the editor's vars panel */
  variables?: Record<string, unknown>;
  /** Estimated complexity (rough — for budget hints) */
  complexity?: "low" | "medium" | "high";
}

export type TemplateCategory =
  | "Boards"
  | "Items"
  | "Subitems"
  | "Users"
  | "Workspaces"
  | "Audit"
  | "Schema";

export const TEMPLATES: QueryTemplate[] = [
  // ── Boards ───────────────────────────────────────────────────────────
  {
    id: "list-boards",
    title: "List all my boards",
    description:
      "Fetches every board you have access to, with id, name, item count, and group count. Good first query.",
    category: "Boards",
    complexity: "low",
    query: `query ListBoards {
  boards(limit: 200) {
    id
    name
    state
    items_count
    groups { id title }
  }
}`,
  },
  {
    id: "list-multi-level-boards",
    title: "List multi-level boards (new in 2026-04)",
    description:
      "Filters to monday.com's new multi-level boards (up to 5 nested levels). Requires API-Version 2026-04 — check the Inspector's logs tab for any errors.",
    category: "Boards",
    complexity: "low",
    query: `query MultiLevelBoards {
  boards(hierarchy_types: [multi_level], limit: 50) {
    id
    name
    hierarchy_type
    items_count
  }
}`,
  },
  {
    id: "board-schema",
    title: "Get a board's full schema",
    description:
      "Columns (with types + settings), groups, and item count. Perfect for documenting a board.",
    category: "Schema",
    complexity: "low",
    variables: { boardId: "1234567890" },
    query: `query BoardSchema($boardId: [ID!]!) {
  boards(ids: $boardId) {
    id
    name
    description
    items_count
    columns { id title type settings_str }
    groups { id title color }
  }
}`,
  },

  // ── Items ────────────────────────────────────────────────────────────
  {
    id: "all-items-paged",
    title: "All items on a board (first page)",
    description:
      "Returns up to 200 items with names, group, and column values. Use the cursor to paginate further.",
    category: "Items",
    complexity: "medium",
    variables: { boardId: "1234567890" },
    query: `query BoardItems($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_page(limit: 200) {
      cursor
      items {
        id
        name
        group { id title }
        column_values { id text value type }
      }
    }
  }
}`,
  },
  {
    id: "items-by-status",
    title: "Items in a specific status",
    description:
      "Server-side filter by a status column. Replace the columnId and the label name with yours.",
    category: "Items",
    complexity: "medium",
    variables: {
      boardId: "1234567890",
      columnId: "status",
      label: "Done",
    },
    query: `query ItemsByStatus($boardId: ID!, $columnId: String!, $label: CompareValue!) {
  items_page_by_column_values(
    board_id: $boardId
    columns: [{ column_id: $columnId, column_values: [$label] }]
    limit: 200
  ) {
    cursor
    items { id name }
  }
}`,
  },
  {
    id: "find-overdue",
    title: "Find overdue items (date column)",
    description:
      "Date columns with a value before today. Replace the columnId with your date column. Common request for status reports.",
    category: "Items",
    complexity: "medium",
    variables: {
      boardId: "1234567890",
      dateColumnId: "date4",
      cutoff: "2026-01-01",
    },
    query: `query Overdue($boardId: ID!, $dateColumnId: String!, $cutoff: CompareValue!) {
  items_page_by_column_values(
    board_id: $boardId
    columns: [
      { column_id: $dateColumnId, column_values: [$cutoff], operator: lower_than }
    ]
    limit: 200
  ) {
    items { id name column_values(ids: [$dateColumnId]) { text } }
  }
}`,
  },
  {
    id: "items-by-id",
    title: "Look up specific items by ID",
    description:
      "Quick lookup for known IDs. Returns full column values. Useful for debugging a specific row.",
    category: "Items",
    complexity: "low",
    variables: { itemIds: ["1234567890", "1234567891"] },
    query: `query ItemsById($itemIds: [ID!]!) {
  items(ids: $itemIds) {
    id
    name
    state
    board { id name }
    group { id title }
    column_values { id text value type }
    updates(limit: 5) { id body created_at }
  }
}`,
  },

  // ── Subitems ─────────────────────────────────────────────────────────
  {
    id: "all-subitems",
    title: "All subitems for a parent",
    description:
      "Returns subitems and their column values for a single parent item.",
    category: "Subitems",
    complexity: "low",
    variables: { parentItemId: "1234567890" },
    query: `query Subitems($parentItemId: [ID!]!) {
  items(ids: $parentItemId) {
    id
    name
    subitems {
      id
      name
      column_values { id text value type }
    }
  }
}`,
  },
  {
    id: "subitems-with-rollup",
    title: "Multi-level board: leaves with rollup values",
    description:
      "For multi-level boards: gets calculated rollup values along with raw cell values. Includes BatteryValue handling for status rollups.",
    category: "Subitems",
    complexity: "high",
    variables: { boardId: "1234567890" },
    query: `query MultiLevelLeaves($boardId: [ID!]!) {
  boards(ids: $boardId) {
    items_page(hierarchy_scope_config: "allItems", limit: 200) {
      cursor
      items {
        id
        name
        parent_item { id }
        column_values(capabilities: [CALCULATED]) {
          id
          text
          ... on NumbersValue { number is_leaf }
          ... on BatteryValue { battery_value { key count } }
        }
      }
    }
  }
}`,
  },

  // ── Users + Workspaces ───────────────────────────────────────────────
  {
    id: "current-user",
    title: "Current user (me)",
    description: "Quick token sanity check + your account info.",
    category: "Users",
    complexity: "low",
    query: `query Me {
  me {
    id
    name
    email
    is_admin
    is_guest
    teams { id name }
    account { id name slug tier }
  }
}`,
  },
  {
    id: "list-users",
    title: "List all workspace users",
    description: "Paginated list of users in your account. Default 100/page.",
    category: "Users",
    complexity: "medium",
    variables: { limit: 100, page: 1 },
    query: `query Users($limit: Int!, $page: Int!) {
  users(limit: $limit, page: $page) {
    id
    name
    email
    enabled
    is_guest
    is_admin
    title
  }
}`,
  },
  {
    id: "list-workspaces",
    title: "List all workspaces",
    description: "Workspaces visible to you. Useful before navigating boards.",
    category: "Workspaces",
    complexity: "low",
    query: `query Workspaces {
  workspaces(limit: 200) {
    id
    name
    kind
    description
  }
}`,
  },

  // ── Audit ─────────────────────────────────────────────────────────────
  {
    id: "recent-updates",
    title: "Recent updates on a board",
    description:
      "Returns the last 50 update posts (comments) across items on the board.",
    category: "Audit",
    complexity: "medium",
    variables: { boardId: "1234567890" },
    query: `query Updates($boardId: [ID!]!) {
  boards(ids: $boardId) {
    updates(limit: 50) {
      id
      body
      created_at
      creator { id name }
      item_id
    }
  }
}`,
  },
  {
    id: "complexity-budget",
    title: "Check your complexity budget",
    description:
      "Returns the remaining complexity budget for your account. Run this if you're hitting rate limits.",
    category: "Audit",
    complexity: "low",
    query: `query Complexity {
  complexity {
    before
    after
    query
    reset_in_x_seconds
  }
}`,
  },
];

export const CATEGORIES: TemplateCategory[] = [
  "Boards",
  "Items",
  "Subitems",
  "Schema",
  "Users",
  "Workspaces",
  "Audit",
];
