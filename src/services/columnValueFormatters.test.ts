import { describe, expect, it } from "vitest";
import {
  isCheckedValue,
  parseLinkValue,
  parseTimelineValue,
  parseToYYYYMMDD,
  resolveStatusLabel,
} from "./columnValueFormatters";
import type { MondayColumn } from "../utils/types";

describe("isCheckedValue", () => {
  it.each([
    ["true", true],
    ["True", true],
    ["TRUE", true],
    ["yes", true],
    ["YES", true],
    ["1", true],
    ["x", true],
    ["X", true],
    ["checked", true],
    ["✓", true],
    ["  true  ", true],
    ["false", false],
    ["no", false],
    ["0", false],
    ["", false],
    ["something else", false],
  ])("returns %s for %s", (input, expected) => {
    expect(isCheckedValue(input)).toBe(expected);
  });
});

describe("parseToYYYYMMDD", () => {
  it("passes through ISO format", () => {
    expect(parseToYYYYMMDD("2024-03-15")).toBe("2024-03-15");
  });

  it("trims whitespace", () => {
    expect(parseToYYYYMMDD("  2024-03-15  ")).toBe("2024-03-15");
  });

  it("returns null for empty / whitespace-only", () => {
    expect(parseToYYYYMMDD("")).toBeNull();
    expect(parseToYYYYMMDD("   ")).toBeNull();
  });

  it("returns null for unparseable garbage", () => {
    expect(parseToYYYYMMDD("not-a-date")).toBeNull();
  });

  it("parses unambiguous EU format DD/MM/YYYY (day > 12)", () => {
    expect(parseToYYYYMMDD("15/03/2024")).toBe("2024-03-15");
    expect(parseToYYYYMMDD("31/12/2024")).toBe("2024-12-31");
  });

  it("parses unambiguous US format MM/DD/YYYY (day > 12)", () => {
    expect(parseToYYYYMMDD("03/15/2024")).toBe("2024-03-15");
    expect(parseToYYYYMMDD("12/31/2024")).toBe("2024-12-31");
  });

  it("defaults ambiguous dates to US format (MM/DD/YYYY)", () => {
    // When both components <= 12 we can't tell, so we pick US.
    expect(parseToYYYYMMDD("03/04/2024")).toBe("2024-03-04");
  });

  it("accepts dots and hyphens as separators", () => {
    expect(parseToYYYYMMDD("15.03.2024")).toBe("2024-03-15");
    expect(parseToYYYYMMDD("15-03-2024")).toBe("2024-03-15");
  });

  it("pads single-digit month and day", () => {
    expect(parseToYYYYMMDD("5/3/2024")).toBe("2024-05-03");
  });

  it("handles verbose date strings via Date fallback", () => {
    // The Date constructor accepts these; we use UTC getters to avoid timezone drift.
    const result = parseToYYYYMMDD("March 15, 2024 UTC");
    expect(result).toBe("2024-03-15");
  });
});

describe("parseTimelineValue", () => {
  it("parses combined 'date - date' with ASCII hyphen", () => {
    expect(parseTimelineValue("2024-01-01 - 2024-01-31")).toEqual({
      from: "2024-01-01",
      to: "2024-01-31",
    });
  });

  it("parses combined 'date – date' with en-dash", () => {
    expect(parseTimelineValue("2024-01-01 – 2024-01-31")).toEqual({
      from: "2024-01-01",
      to: "2024-01-31",
    });
  });

  it("treats a single date as both from and to", () => {
    expect(parseTimelineValue("2024-03-15")).toEqual({
      from: "2024-03-15",
      to: "2024-03-15",
    });
  });

  it("returns null for garbage", () => {
    expect(parseTimelineValue("not-a-date")).toBeNull();
    expect(parseTimelineValue("")).toBeNull();
  });

  it("does not mis-split a simple hyphen-only date", () => {
    // The regex requires whitespace around the hyphen, so '2024-03-15'
    // must be treated as a single date, not split into '2024' - '03-15'.
    expect(parseTimelineValue("2024-03-15")).toEqual({
      from: "2024-03-15",
      to: "2024-03-15",
    });
  });

  it("parses EU-formatted ranges", () => {
    expect(parseTimelineValue("15/03/2024 - 20/03/2024")).toEqual({
      from: "2024-03-15",
      to: "2024-03-20",
    });
  });
});

describe("resolveStatusLabel", () => {
  function makeColumn(labels: Record<string, unknown>): MondayColumn {
    return {
      id: "status",
      title: "Status",
      type: "status",
      settings_str: JSON.stringify({ labels }),
    };
  }

  it("returns raw value when no column given", () => {
    expect(resolveStatusLabel("Done")).toBe("Done");
  });

  it("returns raw value when settings_str missing", () => {
    expect(
      resolveStatusLabel("done", {
        id: "s",
        title: "S",
        type: "status",
      }),
    ).toBe("done");
  });

  it("matches plain-string labels case-insensitively", () => {
    const col = makeColumn({ "0": "Working on it", "1": "Done", "2": "Stuck" });
    expect(resolveStatusLabel("done", col)).toBe("Done");
    expect(resolveStatusLabel("STUCK", col)).toBe("Stuck");
    expect(resolveStatusLabel("working on it", col)).toBe("Working on it");
  });

  it("matches object-shaped labels case-insensitively", () => {
    const col = makeColumn({
      "0": { label: "In Review" },
      "1": { label: "Approved" },
    });
    expect(resolveStatusLabel("in review", col)).toBe("In Review");
    expect(resolveStatusLabel("APPROVED", col)).toBe("Approved");
  });

  it("falls back to raw value for unknown labels", () => {
    const col = makeColumn({ "0": "Done" });
    expect(resolveStatusLabel("Mystery", col)).toBe("Mystery");
  });

  it("handles invalid JSON settings gracefully", () => {
    const col: MondayColumn = {
      id: "status",
      title: "Status",
      type: "status",
      settings_str: "{not valid json",
    };
    expect(resolveStatusLabel("anything", col)).toBe("anything");
  });
});

describe("parseLinkValue", () => {
  it("splits 'url|text' syntax", () => {
    expect(parseLinkValue("https://example.com|Example Site")).toEqual({
      url: "https://example.com",
      text: "Example Site",
    });
  });

  it("trims whitespace around parts", () => {
    expect(parseLinkValue("  https://example.com  |  Example  ")).toEqual({
      url: "https://example.com",
      text: "Example",
    });
  });

  it("uses the raw value for both url and text when no pipe", () => {
    expect(parseLinkValue("https://example.com")).toEqual({
      url: "https://example.com",
      text: "https://example.com",
    });
  });

  it("falls back to raw value if a side is empty", () => {
    expect(parseLinkValue("|just text")).toEqual({
      url: "|just text",
      text: "just text",
    });
  });
});

import {
  parseRatingValue,
  parseCountryValue,
  parseHourValue,
  parseWeekValue,
  parseLocationValue,
  parseWorldClockValue,
  parsePhoneValue,
  parseEmailValue,
  parseItemIdsValue,
  READ_ONLY_COLUMN_TYPES,
  SUPPORTED_COLUMN_TYPES,
} from "./columnValueFormatters";

describe("parseRatingValue", () => {
  it.each([
    ["1", { rating: 1 }],
    ["3", { rating: 3 }],
    ["5 stars", { rating: 5 }],
    ["★★★★", { rating: 4 }],
    ["6", null],
    ["0", null],
    ["", null],
    ["abc", null],
  ])("parses %s", (input, expected) => {
    expect(parseRatingValue(input)).toEqual(expected);
  });
});

describe("parseCountryValue", () => {
  it("accepts ISO-2 + name combined", () => {
    expect(parseCountryValue("US:United States")).toEqual({
      countryCode: "US",
      countryName: "United States",
    });
  });
  it("uppercases bare ISO-2 codes", () => {
    expect(parseCountryValue("us")).toEqual({
      countryCode: "US",
      countryName: "US",
    });
  });
  it("returns null for empty", () => {
    expect(parseCountryValue("")).toBeNull();
    expect(parseCountryValue("  ")).toBeNull();
  });
  it("makes a best-effort guess from a full name", () => {
    const r = parseCountryValue("Germany");
    expect(r?.countryName).toBe("Germany");
    expect(r?.countryCode).toMatch(/^[A-Z]{2}$/);
  });
});

describe("parseHourValue", () => {
  it.each([
    ["14:30", { hour: 14, minute: 30 }],
    ["09:05", { hour: 9, minute: 5 }],
    ["9", { hour: 9, minute: 0 }],
    ["2:30 PM", { hour: 14, minute: 30 }],
    ["12:00 AM", { hour: 0, minute: 0 }],
    ["12:00 PM", { hour: 12, minute: 0 }],
    ["25:00", null],
    ["abc", null],
  ])("parses %s", (input, expected) => {
    expect(parseHourValue(input)).toEqual(expected);
  });
});

describe("parseWeekValue", () => {
  it("wraps a timeline-style range as { week: { startDate, endDate } }", () => {
    expect(parseWeekValue("2026-04-01 - 2026-04-07")).toEqual({
      week: { startDate: "2026-04-01", endDate: "2026-04-07" },
    });
  });
  it("treats a single date as both endpoints", () => {
    expect(parseWeekValue("2026-04-01")).toEqual({
      week: { startDate: "2026-04-01", endDate: "2026-04-01" },
    });
  });
  it("returns null for unparseable input", () => {
    expect(parseWeekValue("not a date")).toBeNull();
  });
});

describe("parseLocationValue", () => {
  it("accepts a bare address", () => {
    expect(parseLocationValue("221B Baker Street")).toEqual({
      address: "221B Baker Street",
    });
  });
  it("parses the optional |lat,lng suffix", () => {
    expect(parseLocationValue("221B Baker Street|51.5237,-0.1585")).toEqual({
      address: "221B Baker Street",
      lat: 51.5237,
      lng: -0.1585,
    });
  });
  it("ignores invalid coords gracefully", () => {
    expect(parseLocationValue("Office|nope")).toEqual({ address: "Office" });
  });
});

describe("parseWorldClockValue", () => {
  it("accepts an IANA timezone", () => {
    expect(parseWorldClockValue("America/New_York")).toEqual({
      timezone: "America/New_York",
    });
  });
  it("rejects bare names", () => {
    expect(parseWorldClockValue("New York")).toBeNull();
  });
});

describe("parsePhoneValue / parseEmailValue", () => {
  it("phone defaults country to US", () => {
    expect(parsePhoneValue("+1 555 1234")).toEqual({
      phone: "+1 555 1234",
      countryShortName: "US",
    });
  });
  it("phone honours the |COUNTRY suffix", () => {
    expect(parsePhoneValue("+44 20 1234 5678 | GB")).toEqual({
      phone: "+44 20 1234 5678",
      countryShortName: "GB",
    });
  });
  it("email uses display-name suffix when present", () => {
    expect(parseEmailValue("sam@x.io|Sam K")).toEqual({
      email: "sam@x.io",
      text: "Sam K",
    });
  });
  it("email defaults display name to the address", () => {
    expect(parseEmailValue("sam@x.io")).toEqual({
      email: "sam@x.io",
      text: "sam@x.io",
    });
  });
});

describe("parseItemIdsValue (board_relation / dependency)", () => {
  it("parses comma-separated IDs", () => {
    expect(parseItemIdsValue("123,456")).toEqual({
      item_ids: [123, 456],
    });
  });
  it("parses semicolon-separated IDs", () => {
    expect(parseItemIdsValue("123; 456; 789")).toEqual({
      item_ids: [123, 456, 789],
    });
  });
  it("ignores non-numeric tokens", () => {
    expect(parseItemIdsValue("123, abc, 456")).toEqual({
      item_ids: [123, 456],
    });
  });
  it("returns null when nothing numeric", () => {
    expect(parseItemIdsValue("abc, xyz")).toBeNull();
    expect(parseItemIdsValue("")).toBeNull();
  });
});

describe("READ_ONLY_COLUMN_TYPES", () => {
  it("flags computed columns as read-only", () => {
    for (const t of [
      "mirror",
      "formula",
      "auto_number",
      "lookup",
      "creation_log",
      "last_updated",
      "item_id",
      "button",
      "color_picker",
      "file",
      "subtasks",
    ]) {
      expect(READ_ONLY_COLUMN_TYPES.has(t)).toBe(true);
    }
  });

  it("does not flag writable types as read-only", () => {
    for (const t of [
      "text",
      "status",
      "date",
      "people",
      "board_relation",
      "dependency",
      "rating",
    ]) {
      expect(READ_ONLY_COLUMN_TYPES.has(t)).toBe(false);
    }
  });

  it("supported set covers everything that's writable in the importer", () => {
    expect(SUPPORTED_COLUMN_TYPES.has("board_relation")).toBe(true);
    expect(SUPPORTED_COLUMN_TYPES.has("dependency")).toBe(true);
    expect(SUPPORTED_COLUMN_TYPES.has("rating")).toBe(true);
  });
});
