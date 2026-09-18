import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneQueryDigits, phoneSearchKey } from "./phone";

describe("normalizePhone", () => {
  it("accepts every way a receptionist might type a Moroccan mobile", () => {
    for (const input of [
      "0612345678",
      "612345678",
      "212612345678",
      "00212612345678",
      "+212612345678",
      "+212 6 12 34 56 78",
      "06 12 34 56 78",
      "06-12-34-56-78",
      "06.12.34.56.78",
      "(0)612345678",
      "  0612345678  ",
      "+212-612-345-678",
    ]) {
      expect(normalizePhone(input), input).toBe("+212612345678");
    }
  });

  it("accepts the 5, 6 and 7 national prefixes", () => {
    expect(normalizePhone("0512345678")).toBe("+212512345678");
    expect(normalizePhone("0612345678")).toBe("+212612345678");
    expect(normalizePhone("0712345678")).toBe("+212712345678");
  });

  it("rejects prefixes that are not Moroccan mobile or fixed lines", () => {
    expect(normalizePhone("0412345678")).toBeNull();
    expect(normalizePhone("0812345678")).toBeNull();
    expect(normalizePhone("0912345678")).toBeNull();
    expect(normalizePhone("0012345678")).toBeNull();
  });

  it("rejects the wrong number of digits", () => {
    expect(normalizePhone("061234567")).toBeNull();
    expect(normalizePhone("06123456789")).toBeNull();
    expect(normalizePhone("212612345")).toBeNull();
    expect(normalizePhone("6")).toBeNull();
  });

  it("rejects input with no digits at all", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("+")).toBeNull();
  });

  it("keeps an explicitly international number in E.164 form", () => {
    expect(normalizePhone("+33612345678")).toBe("+33612345678");
    expect(normalizePhone("+1 202 555 0137")).toBe("+12025550137");
    expect(normalizePhone("+34 600 000 000")).toBe("+34600000000");
  });

  it("rejects an international number of implausible length", () => {
    expect(normalizePhone("+1234567")).toBeNull();
    expect(normalizePhone("+1234567890123456")).toBeNull();
  });

  it("only treats a number as foreign when it is written with a leading +", () => {
    // Without the "+" there is no way to tell "33612345678" from a mistyped local
    // number, so it is rejected rather than guessed at.
    expect(normalizePhone("33612345678")).toBeNull();
    expect(normalizePhone("0033612345678")).toBeNull();
  });

  it("is idempotent on an already normalized number", () => {
    const normalized = normalizePhone("0612345678");
    expect(normalized).toBe("+212612345678");
    expect(normalizePhone(normalized!)).toBe(normalized);
  });
});

describe("formatPhone", () => {
  it("renders a Moroccan number the way it is written locally", () => {
    expect(formatPhone("+212612345678")).toBe("06 12 34 56 78");
    expect(formatPhone("+212512345678")).toBe("05 12 34 56 78");
  });

  it("leaves a non-Moroccan number untouched", () => {
    expect(formatPhone("+33612345678")).toBe("+33612345678");
    expect(formatPhone("0612345678")).toBe("0612345678");
  });

  it("round-trips through normalizePhone", () => {
    const stored = "+212612345678";
    expect(normalizePhone(formatPhone(stored))).toBe(stored);
  });
});

describe("phoneSearchKey", () => {
  it("returns the digits a receptionist would type for a Moroccan number", () => {
    expect(phoneSearchKey("+212612345678")).toBe("0612345678");
  });

  it("returns bare digits for a foreign number", () => {
    expect(phoneSearchKey("+33612345678")).toBe("33612345678");
  });
});

describe("phoneQueryDigits", () => {
  it("strips separators", () => {
    expect(phoneQueryDigits("06 12 34")).toBe("061234");
    expect(phoneQueryDigits("06-12")).toBe("0612");
  });

  it("rewrites international prefixes to the local form", () => {
    expect(phoneQueryDigits("+212 612")).toBe("0612");
    expect(phoneQueryDigits("212612")).toBe("0612");
    expect(phoneQueryDigits("00212612")).toBe("0612");
  });

  it("leaves a partial local number alone", () => {
    expect(phoneQueryDigits("0612")).toBe("0612");
    expect(phoneQueryDigits("612")).toBe("612");
    expect(phoneQueryDigits("")).toBe("");
  });

  it("matches the stored search key for every way of typing the same number", () => {
    const key = phoneSearchKey(normalizePhone("0612345678")!);
    for (const query of ["0612345678", "+212612345678", "212 612 345 678", "00212612345678", "06 12 34 56 78"]) {
      expect(key.includes(phoneQueryDigits(query)), query).toBe(true);
    }
  });
});
