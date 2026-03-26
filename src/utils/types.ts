// ── Monday.com API types ──────────────────────────────────────────────

export interface MondayBoard {
  id: string;
  name: string;
  columns: MondayColumn[];
}

export interface MondayColumn {
  id: string;
  title: string;
  type: string;
  settings_str?: string;
}

export interface MondayItem {
  id: string;
  name: string;
  group?: { id: string; title: string };
  column_values?: MondayColumnValue[];
  subitems?: MondayItem[];
}

export interface MondayColumnValue {
  id: string;
  text: string;
  value: string | null;
  type?: string;
}

export interface CreateItemResult {
  id: string;
  name: string;
}

export interface CreateSubitemResult {
  id: string;
  name: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

// ── File parsing types ────────────────────────────────────────────────

/** A flat file (CSV or user-created XLSX) */
export interface ParsedFileFlat {
  kind: "flat";
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
  rowCount: number;
}

/** A monday.com hierarchical export */
export interface ParsedFileMondayExport {
  kind: "monday_export";
  boardName: string;
  fileName: string;
  /** Parent-item column headers from the export (e.g. Name, Status, Date) */
  parentHeaders: string[];
  /** Subitem column headers from the export (e.g. Name, Owner, Status, Date) */
  subitemHeaders: string[];
  /** All parent items grouped by their group name */
  groups: MondayExportGroup[];
  /** Flattened subitem rows ready for import (one row per subitem) */
  flatSubitems: FlatSubitemRow[];
  rowCount: number;
}

export interface MondayExportGroup {
  groupName: string;
  items: MondayExportItem[];
}

export interface MondayExportItem {
  name: string;
  /** Column values for the parent item itself */
  values: Record<string, string>;
  /** Subitems found under this parent */
  subitems: MondayExportSubitem[];
}

export interface MondayExportSubitem {
  name: string;
  values: Record<string, string>;
}

/** Flattened row: parent info + subitem data, ready for column mapping */
export interface FlatSubitemRow {
  /** Group this subitem belongs to */
  groupName: string;
  /** Parent item name (used to resolve parent ID via API) */
  parentItemName: string;
  /** Subitem name */
  subitemName: string;
  /** All subitem column values keyed by subitem header name */
  values: Record<string, string>;
}

export type ParsedFile = ParsedFileFlat | ParsedFileMondayExport;

// ── Column mapping types ──────────────────────────────────────────────

export interface ColumnMapping {
  /** CSV/XLSX header name */
  fileColumn: string;
  /** monday.com column id (or "__subitem_name__" for the subitem title) */
  mondayColumnId: string;
}

export interface ImportConfig {
  boardId: string;
  parentIdentifier: ParentIdentifier;
  subitemNameColumn: string;
  columnMappings: ColumnMapping[];
}

export type ParentIdentifier =
  | { type: "item_id"; fileColumn: string }
  | { type: "item_name"; fileColumn: string };

// ── Import progress types ─────────────────────────────────────────────

export type RowStatus = "pending" | "importing" | "success" | "error";

export interface RowResult {
  rowIndex: number;
  /** "parent" for parent item creation, "subitem" for subitem creation */
  kind: "parent" | "subitem";
  /** Name of the item being created */
  itemName: string;
  /** For subitems: the parent item ID; for parents: the board ID */
  parentItemId: string;
  /** @deprecated Use itemName instead */
  subitemName: string;
  status: RowStatus;
  error?: string;
  createdItemId?: string;
  /** @deprecated Use createdItemId instead */
  createdSubitemId?: string;
}

export interface ImportProgress {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  rows: RowResult[];
}

// ── Storage types ─────────────────────────────────────────────────────

export interface ExtensionSettings {
  apiToken: string;
}

// ── Messages between content script ↔ background ─────────────────────

export type ExtensionMessage =
  | { type: "OPEN_PANEL" }
  | { type: "GET_BOARD_ID" }
  | { type: "BOARD_ID_RESULT"; boardId: string | null };
