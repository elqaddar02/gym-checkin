import { describe, expect, it } from "vitest";
import { isValidUsername, normalizeUsername } from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases, so Mouad and mouad are the same account", () => {
    expect(normalizeUsername("  Mouad  ")).toBe("mouad");
    expect(normalizeUsername("MOUAD")).toBe("mouad");
  });

  it("leaves an already-clean identifiant alone", () => {
    expect(normalizeUsername("mouad")).toBe("mouad");
  });
});

describe("isValidUsername", () => {
  it("accepts the everyday shapes", () => {
    expect(isValidUsername("mouad")).toBe(true);
    expect(isValidUsername("mouad.el_qaddar-02")).toBe(true);
    expect(isValidUsername("02mouad")).toBe(true);
    expect(isValidUsername("a".repeat(32))).toBe(true);
  });

  it("refuses what would be confusing or unusable", () => {
    expect(isValidUsername("mo")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(isValidUsername(".mouad")).toBe(false);
    expect(isValidUsername("mouad@ironclub.ma")).toBe(false);
    expect(isValidUsername("mouad gym")).toBe(false);
    expect(isValidUsername("Mouad")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });
});
