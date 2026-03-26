import type { MondayColumn, MondayItem } from "../../utils/types";

/**
 * Export items to CSV string.
 */
export function exportToCSV(
  items: MondayItem[],
  columns: MondayColumn[],
): string {
  const headers = ["ID", "Name", "Group", ...columns.map((c) => c.title)];
  const rows = items.map((item) => {
    const colValues = columns.map((col) => {
      const cv = item.column_values?.find((v) => v.id === col.id);
      return cv?.text ?? "";
    });
    return [
      item.id,
      item.name,
      item.group?.title ?? "",
      ...colValues,
    ];
  });

  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  return [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\n");
}

/**
 * Export items to formatted JSON.
 */
export function exportToJSON(
  items: MondayItem[],
  columns: MondayColumn[],
): string {
  const data = items.map((item) => {
    const values: Record<string, string> = {};
    for (const col of columns) {
      const cv = item.column_values?.find((v) => v.id === col.id);
      values[col.title] = cv?.text ?? "";
    }
    return {
      id: item.id,
      name: item.name,
      group: item.group?.title ?? "",
      values,
    };
  });
  return JSON.stringify(data, null, 2);
}

/**
 * Export items + subitems combined CSV. Parent rows get a "Type" of "Item",
 * subitem rows get "Subitem" and a "Parent Name" column.
 */
export function exportCombinedCSV(
  items: MondayItem[],
  columns: MondayColumn[],
  subitemColumns: MondayColumn[],
): string {
  const escape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const allColTitles = [
    ...columns.map((c) => c.title),
    ...subitemColumns
      .filter((sc) => !columns.some((c) => c.title === sc.title))
      .map((c) => c.title),
  ];
  const headers = ["Type", "ID", "Name", "Parent Name", "Group", ...allColTitles];
  const rows: string[][] = [];

  for (const item of items) {
    const colValues = allColTitles.map((title) => {
      const col = columns.find((c) => c.title === title);
      if (!col) return "";
      const cv = item.column_values?.find((v) => v.id === col.id);
      return cv?.text ?? "";
    });
    rows.push(["Item", item.id, item.name, "", item.group?.title ?? "", ...colValues]);

    if (item.subitems) {
      for (const sub of item.subitems) {
        const subValues = allColTitles.map((title) => {
          const col = subitemColumns.find((c) => c.title === title);
          if (!col) return "";
          const cv = sub.column_values?.find((v) => v.id === col.id);
          return cv?.text ?? "";
        });
        rows.push(["Subitem", sub.id, sub.name, item.name, item.group?.title ?? "", ...subValues]);
      }
    }
  }

  return [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\n");
}

/**
 * Export items as nested JSON with subitems array per item.
 */
export function exportNestedJSON(
  items: MondayItem[],
  columns: MondayColumn[],
  subitemColumns: MondayColumn[],
): string {
  const data = items.map((item) => {
    const values: Record<string, string> = {};
    for (const col of columns) {
      const cv = item.column_values?.find((v) => v.id === col.id);
      values[col.title] = cv?.text ?? "";
    }
    const subitems = (item.subitems ?? []).map((sub) => {
      const subValues: Record<string, string> = {};
      for (const col of subitemColumns) {
        const cv = sub.column_values?.find((v) => v.id === col.id);
        subValues[col.title] = cv?.text ?? "";
      }
      return { id: sub.id, name: sub.name, values: subValues };
    });
    return {
      id: item.id,
      name: item.name,
      group: item.group?.title ?? "",
      values,
      subitems,
    };
  });
  return JSON.stringify(data, null, 2);
}

/**
 * Copy text to clipboard.
 */
export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text);
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
