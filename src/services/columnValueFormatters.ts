import type { MondayColumn } from "../utils/types";

// Pure helpers for translating CSV/XLSX cell strings into the JSON shapes
// that monday.com's API expects for each column type.
//
// Kept separate from mondayApi.ts because nothing here touches the network —
// which makes the date/status/timeline/checkbox logic easy to unit test.

/** Check if value represents "checked" for checkbox columns */
export function isCheckedValue(val: string): boolean {
  const v = val.toLowerCase().trim();
  return (
    v === "true" ||
    v === "yes" ||
    v === "1" ||
    v === "x" ||
    v === "checked" ||
    v === "✓"
  );
}

/**
 * Resolve a status label case-insensitively from column settings.
 * Monday.com rejects status values that don't match the exact casing.
 */
export function resolveStatusLabel(
  value: string,
  column?: MondayColumn,
): string {
  if (!column?.settings_str) return value;
  try {
    const settings = JSON.parse(column.settings_str);
    const labels = settings.labels ?? {};
    const lower = value.toLowerCase();
    for (const entry of Object.values(labels)) {
      // monday.com stores labels as either plain strings or { label: "..." } objects
      if (typeof entry === "string" && entry.toLowerCase() === lower) {
        return entry;
      }
      if (
        entry &&
        typeof entry === "object" &&
        (entry as { label?: string }).label
      ) {
        const label = (entry as { label: string }).label;
        if (label.toLowerCase() === lower) return label;
      }
    }
  } catch {
    // settings_str not parseable — use raw value
  }
  return value;
}

/** Parse date string to YYYY-MM-DD for Monday.com API */
export function parseToYYYYMMDD(val: string): string | null {
  const s = val.trim();
  if (!s) return null;

  // Already in YYYY-MM-DD format — pass through directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try DD/MM/YYYY or DD-MM-YYYY (EU format: day > 12 disambiguates)
  const euMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (euMatch) {
    const [, a, b, yr] = euMatch;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    // If first number > 12, it must be a day (EU format DD/MM/YYYY)
    if (aNum > 12 && bNum <= 12) {
      return `${yr}-${String(bNum).padStart(2, "0")}-${String(aNum).padStart(2, "0")}`;
    }
    // If second number > 12, it must be a day (US format MM/DD/YYYY)
    if (bNum > 12 && aNum <= 12) {
      return `${yr}-${String(aNum).padStart(2, "0")}-${String(bNum).padStart(2, "0")}`;
    }
    // Ambiguous (both <= 12): default to MM/DD/YYYY (US format)
    return `${yr}-${String(aNum).padStart(2, "0")}-${String(bNum).padStart(2, "0")}`;
  }

  // Fallback: use Date constructor with UTC methods to avoid timezone off-by-one
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a timeline value that may be in combined format "date1 - date2"
 * or a single date (used as both from and to).
 */
export function parseTimelineValue(
  value: string,
): { from: string; to: string } | null {
  // Try combined format: "2024-01-01 - 2024-01-31" or "2024-01-01 – 2024-01-31"
  // Use " - " or " – " (with spaces) to avoid splitting date hyphens
  const combinedMatch = value.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (combinedMatch) {
    const from = parseToYYYYMMDD(combinedMatch[1].trim());
    const to = parseToYYYYMMDD(combinedMatch[2].trim());
    if (from && to) return { from, to };
  }
  // Single date — use as both from and to
  const single = parseToYYYYMMDD(value);
  if (single) return { from: single, to: single };
  return null;
}

/**
 * Parse "url|text" link syntax. Returns both sides, falling back to raw value.
 */
export function parseLinkValue(raw: string): { url: string; text: string } {
  const trimmed = raw.trim();
  if (trimmed.includes("|")) {
    const [url, text] = trimmed.split("|", 2).map((s) => s.trim());
    return { url: url || trimmed, text: text || trimmed };
  }
  return { url: trimmed, text: trimmed };
}
