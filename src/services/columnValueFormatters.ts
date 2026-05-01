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

/**
 * Parse a 1–5 rating cell. Accepts "4", "4 stars", "★★★★", etc.
 * Returns null if no integer 1–5 can be inferred.
 */
export function parseRatingValue(raw: string): { rating: number } | null {
  const stars = (raw.match(/[★⭐✦]/g) ?? []).length;
  if (stars >= 1 && stars <= 5) return { rating: stars };
  const m = raw.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 5) return null;
  return { rating: n };
}

/**
 * Parse a country cell. Accepts:
 *   "US"
 *   "United States"
 *   "US:United States"  (preferred — both halves)
 * Returns null when a 2-letter code can't be inferred.
 */
export function parseCountryValue(
  raw: string,
): { countryCode: string; countryName: string } | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes(":")) {
    const [code, name] = v.split(":", 2).map((s) => s.trim());
    if (code.length === 2 && name) {
      return { countryCode: code.toUpperCase(), countryName: name };
    }
  }
  // Bare ISO-2 code
  if (/^[A-Za-z]{2}$/.test(v)) {
    return { countryCode: v.toUpperCase(), countryName: v.toUpperCase() };
  }
  // Bare full name — monday accepts countryCode + countryName, but without the
  // code we can't be precise. Fall back to a heuristic that lets the user
  // self-correct in the UI: send the value as both, monday will reject if the
  // code is invalid and the row gets a clear error.
  if (v.length >= 3 && v.length <= 56) {
    return { countryCode: v.slice(0, 2).toUpperCase(), countryName: v };
  }
  return null;
}

/**
 * Parse an "hour" cell (24h or 12h). Returns null when unparseable.
 *   "14:30"     → { hour: 14, minute: 30 }
 *   "2:30 PM"   → { hour: 14, minute: 30 }
 *   "9"         → { hour: 9, minute: 0 }
 */
export function parseHourValue(
  raw: string,
): { hour: number; minute: number } | null {
  const v = raw.trim();
  if (!v) return null;
  const ampmMatch = v.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM|am|pm)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = /PM/i.test(ampmMatch[3]);
    if (h === 12) h = 0;
    if (isPm) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
    return null;
  }
  const hm = v.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return { hour: h, minute: m };
  }
  return null;
}

/**
 * Parse a "week" cell — monday expects { week: { startDate, endDate } }.
 * Accepts the same combined-date syntax as timeline ("YYYY-MM-DD - YYYY-MM-DD")
 * or a single date that gets used as both endpoints.
 */
export function parseWeekValue(
  raw: string,
): { week: { startDate: string; endDate: string } } | null {
  const tl = parseTimelineValue(raw);
  if (!tl) return null;
  return { week: { startDate: tl.from, endDate: tl.to } };
}

/**
 * Parse a "location" cell. Optional lat/lng can be included via
 *   "address|lat,lng"
 * otherwise just sends the address string and lets monday geocode.
 */
export function parseLocationValue(
  raw: string,
): { address: string; lat?: number; lng?: number } | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.includes("|")) {
    const [addr, coords] = v.split("|", 2).map((s) => s.trim());
    const parts = coords.split(",").map((s) => s.trim());
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        return { address: addr, lat, lng };
      }
    }
    return { address: addr };
  }
  return { address: v };
}

/** Parse a world-clock cell — IANA timezone string, e.g. "America/New_York" */
export function parseWorldClockValue(raw: string): { timezone: string } | null {
  const v = raw.trim();
  if (!v || !/^[A-Za-z_]+\/[A-Za-z_]+/.test(v)) return null;
  return { timezone: v };
}

/** Parse a phone cell. Optional country: "+1 555 1234 | US". */
export function parsePhoneValue(raw: string): {
  phone: string;
  countryShortName: string;
} {
  const v = raw.trim();
  if (v.includes("|")) {
    const [phone, country] = v.split("|", 2).map((s) => s.trim());
    return { phone, countryShortName: country.toUpperCase().slice(0, 2) || "US" };
  }
  return { phone: v, countryShortName: "US" };
}

/**
 * Parse an email cell. Format: "user@host" or "user@host|Display Name".
 */
export function parseEmailValue(raw: string): { email: string; text: string } {
  const v = raw.trim();
  if (v.includes("|")) {
    const [email, text] = v.split("|", 2).map((s) => s.trim());
    return { email, text: text || email };
  }
  return { email: v, text: v };
}

/**
 * Parse a connect-boards / dependency cell (comma- or semicolon-separated
 * monday item IDs). The actual id resolution from item NAMES is handled in
 * the import orchestrator (it has board context); this helper only handles
 * the case where the user already has IDs in their CSV.
 */
export function parseItemIdsValue(raw: string): { item_ids: number[] } | null {
  const v = raw.trim();
  if (!v) return null;
  const ids = v
    .split(/[,;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
  if (ids.length === 0) return null;
  return { item_ids: ids };
}

/**
 * Single source of truth for which monday.com column types CANNOT be set
 * via the API at all (mirror columns are computed; formulas are computed;
 * file requires a separate upload mutation; etc.). Used by the importer to
 * filter out non-mappable columns from both parent and subitem mapping
 * tables, plus to grey them out in the schema viewer.
 */
export const READ_ONLY_COLUMN_TYPES: ReadonlySet<string> = new Set([
  // Computed columns — values come from other cells / boards
  "mirror",
  "formula",
  "auto_number",
  "lookup",
  "creation_log",
  "last_updated",
  "item_id",
  // UI-only
  "button",
  "color_picker",
  // Files need a separate upload mutation we don't implement
  "file",
  // Subitems metadata, not a real column
  "subtasks",
]);

/**
 * Column types we DO support writing to via the API. Used as a positive
 * allowlist when surfacing the "what we can map" count in the importer.
 */
export const SUPPORTED_COLUMN_TYPES: ReadonlySet<string> = new Set([
  "text",
  "long_text",
  "numbers",
  "status",
  "dropdown",
  "date",
  "timeline",
  "people",
  "person",
  "checkbox",
  "link",
  "email",
  "phone",
  "rating",
  "country",
  "hour",
  "week",
  "location",
  "world_clock",
  "tags", // accepts a comma-separated list of tag IDs (best-effort)
  "board_relation", // connect boards — accepts item ids
  "dependency", // accepts item ids
  "name", // handled separately as the row name
]);
