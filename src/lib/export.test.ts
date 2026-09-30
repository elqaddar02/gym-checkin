import { describe, expect, it } from "vitest";
import { buildPdfReport, toCsv } from "./export";

describe("toCsv", () => {
  it("escapes spreadsheet values and preserves commas", () => {
    expect(
      toCsv([
        ["name", "notes"],
        ["Ahmed", "VIP, premium"],
        ["Mourad", "line 1\nline 2"],
      ]),
    ).toBe('name,notes\r\nAhmed,"VIP, premium"\r\nMourad,"line 1\nline 2"');
  });
});

describe("buildPdfReport", () => {
  it("creates a valid PDF payload for member export", () => {
    const pdf = buildPdfReport({ title: "Gym Report", rows: [["Name", "Phone"], ["Ahmed", "+212600000000"]] });
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pdf.includes("Gym Report")).toBe(true);
    expect(pdf.includes("Ahmed")).toBe(true);
  });
});
