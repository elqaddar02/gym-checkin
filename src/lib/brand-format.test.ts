import { describe, expect, it } from "vitest";
import { brandVars, DEFAULT_BRAND, initialsOf, safeHex, safeLogoUrl } from "./brand-format";

describe("safeHex", () => {
  it("accepts #rrggbb and normalises the case", () => {
    expect(safeHex("#E3A008", "#000000")).toBe("#e3a008");
    expect(safeHex("#000000", "#ffffff")).toBe("#000000");
  });

  it("falls back on anything that is not a six-digit hex", () => {
    for (const bad of ["", "red", "#fff", "#12345", "#1234567", "rgb(1,2,3)", null, undefined]) {
      expect(safeHex(bad, "#e3a008")).toBe("#e3a008");
    }
  });

  it("refuses values that would escape the style attribute", () => {
    // These land in style="--brand: …", so a fallback here is a security boundary.
    expect(safeHex("#fff; background:url(https://evil.example)", "#e3a008")).toBe("#e3a008");
    expect(safeHex("red;}body{display:none", "#e3a008")).toBe("#e3a008");
  });
});

describe("safeLogoUrl", () => {
  it("keeps same-origin paths", () => {
    expect(safeLogoUrl("/logos/gym.png")).toBe("/logos/gym.png");
  });

  it("keeps base64 image data URIs", () => {
    expect(safeLogoUrl("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(safeLogoUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe("data:image/svg+xml;base64,PHN2Zz4=");
  });

  it("drops anything that would call out to another host or run script", () => {
    for (const bad of [
      "//evil.example/logo.png",
      "https://evil.example/logo.png",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "",
      null,
    ]) {
      expect(safeLogoUrl(bad)).toBeNull();
    }
  });
});

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("Iron Club")).toBe("IC");
    expect(initialsOf("Atlas Fitness Marrakech")).toBe("AF");
    expect(initialsOf("Oxygen")).toBe("O");
    expect(initialsOf("  salle   du   sport ")).toBe("SD");
  });

  it("falls back when there is nothing to take", () => {
    expect(initialsOf("")).toBe("MS");
    expect(initialsOf("   ")).toBe("MS");
  });
});

describe("brandVars", () => {
  it("exposes exactly the three variables the stylesheet mixes from", () => {
    expect(brandVars(DEFAULT_BRAND)).toEqual({
      "--brand": "#e3a008",
      "--brand-2": "#b45309",
      "--on-brand": "#1b1403",
    });
  });
});
