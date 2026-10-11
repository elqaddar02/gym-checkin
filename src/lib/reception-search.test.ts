import { describe, expect, it } from "vitest";
import { nextCode } from "./member-code";
import { searchMembers } from "./reception-search";

const members = [
  { name: "Youssef Amrani", phone: "+212612345678", code: 1 },
  { name: "Salma Bennani", phone: "+212612349911", code: 10 },
  { name: "Karim El Idrissi", phone: "+212661234500", code: 12 },
  { name: "Nadia Tazi", phone: "+212700112233", code: 2 },
  { name: "Old Cache", phone: "+212655555555" }, // cached before codes existed
];

describe("searchMembers", () => {
  it("finds a member by code, exact match first", () => {
    const r = searchMembers(members, "1");
    expect(r.mode).toBe("code");
    expect(r.results.map((m) => m.code)).toEqual([1, 10, 12]);
    expect(r.exact?.name).toBe("Youssef Amrani");
  });

  it("has no exact match when only a prefix matches", () => {
    const r = searchMembers(members, "3");
    expect(r.results).toEqual([]);
    expect(r.exact).toBeNull();
    expect(searchMembers(members, "12").exact?.name).toBe("Karim El Idrissi");
  });

  it("searches phones when the number starts with 0 or +", () => {
    const r = searchMembers(members, "0661");
    expect(r.mode).toBe("phone");
    expect(r.results.map((m) => m.name)).toEqual(["Karim El Idrissi"]);
    expect(searchMembers(members, "+212 700").results[0].name).toBe("Nadia Tazi");
  });

  it("searches names when letters are typed, ignoring accents and case", () => {
    const r = searchMembers(members, "SALMA");
    expect(r.mode).toBe("name");
    expect(r.results.map((m) => m.code)).toEqual([10]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchMembers(members, "  ").results).toEqual([]);
  });
});

describe("nextCode", () => {
  it("is the last code + 1, starting at 1", () => {
    expect(nextCode(null)).toBe(1);
    expect(nextCode(5)).toBe(6);
  });
});
