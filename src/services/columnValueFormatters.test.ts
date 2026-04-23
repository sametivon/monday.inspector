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
