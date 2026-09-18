import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GYM_TZ,
  addDays,
  daysBetween,
  dbDateToYmd,
  formatDayMonth,
  formatFullDate,
  formatTime,
  localDate,
  localHour,
  todayYmd,
  ymdToDbDate,
} from "./dates";

// Africa/Casablanca is UTC+1 all year, except that it drops to UTC+0 for Ramadan.
// The 2024 dates below sit either side of that shift, so they exercise both offsets.
const SUMMER_EVENING = "2026-09-18T23:30:00.000Z"; // 00:30 on the 19th, UTC+1
const RAMADAN_EVENING = "2024-03-20T23:30:00.000Z"; // 23:30 on the 20th, UTC+0

afterEach(() => {
  vi.useRealTimers();
});

describe("GYM_TZ", () => {
  it("defaults to the gym's timezone", () => {
    expect(GYM_TZ).toBe("Africa/Casablanca");
  });

  it("is not the zone the suite itself runs in", () => {
    // Guards the premise of every test below: they only prove that the helpers
    // ignore the machine's clock zone while the two zones actually differ.
    const hostZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(hostZone).not.toBe(GYM_TZ);
    // The machine is far enough east that it is already the 19th at this instant,
    // while the gym is still on the 18th.
    expect(new Date("2026-09-18T22:30:00.000Z").getDate()).toBe(19);
    expect(localDate("2026-09-18T22:30:00.000Z")).toBe("2026-09-18");
  });
});

describe("localDate", () => {
  it("uses the gym timezone, not the machine's", () => {
    // The suite runs under TZ=Pacific/Kiritimati, where this instant is already
    // the 19th at midday; in Casablanca it is 00:30 on the 19th.
    expect(localDate(SUMMER_EVENING)).toBe("2026-09-19");
    expect(localDate("2026-09-18T22:30:00.000Z")).toBe("2026-09-18");
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(localDate(new Date(SUMMER_EVENING))).toBe("2026-09-19");
  });

  it("follows the Ramadan offset shift", () => {
    // At UTC+0 the evening is still the 20th; a month later, at UTC+1, the same
    // wall-clock instant has rolled over to the next day.
    expect(localDate(RAMADAN_EVENING)).toBe("2024-03-20");
    expect(localDate("2024-04-20T23:30:00.000Z")).toBe("2024-04-21");
  });

  it("formats as YYYY-MM-DD so dates compare as strings", () => {
    expect(localDate("2026-01-05T12:00:00.000Z")).toBe("2026-01-05");
    expect(localDate("2026-01-05T12:00:00.000Z") < localDate("2026-01-06T12:00:00.000Z")).toBe(true);
  });
});

describe("todayYmd", () => {
  it("is the gym's calendar date for the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SUMMER_EVENING));
    expect(todayYmd()).toBe("2026-09-19");
  });

  it("agrees with localDate", () => {
    expect(todayYmd()).toBe(localDate(new Date()));
  });
});

describe("formatTime", () => {
  it("renders 24-hour gym-local time", () => {
    expect(formatTime("2026-09-18T22:30:00.000Z")).toBe("23:30");
    expect(formatTime("2026-09-18T10:05:00.000Z")).toBe("11:05");
  });

  it("wraps past midnight in the gym timezone", () => {
    expect(formatTime(SUMMER_EVENING)).toBe("00:30");
  });

  it("follows the Ramadan offset shift", () => {
    expect(formatTime(RAMADAN_EVENING)).toBe("23:30");
  });
});

describe("localHour", () => {
  it("returns the gym-local hour as a number from 0 to 23", () => {
    expect(localHour("2026-09-18T22:30:00.000Z")).toBe(23);
    expect(localHour("2026-09-18T10:05:00.000Z")).toBe(11);
  });

  it("returns 0 rather than NaN just after gym-local midnight", () => {
    expect(localHour(SUMMER_EVENING)).toBe(0);
  });

  it("follows the Ramadan offset shift", () => {
    expect(localHour(RAMADAN_EVENING)).toBe(23);
  });
});

describe("formatDayMonth", () => {
  it("renders a stored date the French way", () => {
    expect(formatDayMonth("2026-09-30")).toBe("30/09");
    expect(formatDayMonth("2026-01-01")).toBe("01/01");
  });
});

describe("formatFullDate", () => {
  it("renders a stored date the French way with the year", () => {
    expect(formatFullDate("2026-09-30")).toBe("30/09/2026");
    expect(formatFullDate("2026-01-01")).toBe("01/01/2026");
  });
});

describe("daysBetween", () => {
  it("counts whole days forwards", () => {
    expect(daysBetween("2026-09-18", "2026-09-18")).toBe(0);
    expect(daysBetween("2026-09-18", "2026-09-19")).toBe(1);
    expect(daysBetween("2026-09-18", "2026-10-18")).toBe(30);
  });

  it("goes negative when b is before a", () => {
    expect(daysBetween("2026-09-20", "2026-09-18")).toBe(-2);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetween("2026-09-30", "2026-10-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("handles leap and non-leap Februaries", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("is not thrown off by the Ramadan offset shift", () => {
    // A month bought on 20 March 2024 (UTC+0) runs into April (UTC+1); the span
    // is still exactly 30 days, with no offset-induced off-by-one.
    expect(daysBetween("2024-03-20", "2024-04-19")).toBe(30);
  });
});

describe("addDays", () => {
  it("moves a stored date forwards and backwards", () => {
    expect(addDays("2026-09-18", 1)).toBe("2026-09-19");
    expect(addDays("2026-09-18", -1)).toBe("2026-09-17");
    expect(addDays("2026-09-18", 0)).toBe("2026-09-18");
  });

  it("rolls over months and years", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles leap years", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("is the inverse of daysBetween", () => {
    for (const days of [1, 7, 30, 31, 90, 365, -14]) {
      expect(daysBetween("2026-09-18", addDays("2026-09-18", days)), `${days}`).toBe(days);
    }
  });

  it("is not thrown off by the Ramadan offset shift", () => {
    expect(addDays("2024-03-20", 30)).toBe("2024-04-19");
  });
});

describe("dbDateToYmd / ymdToDbDate", () => {
  it("reads a Prisma @db.Date value back as a plain date", () => {
    expect(dbDateToYmd(new Date("2026-09-18T00:00:00.000Z"))).toBe("2026-09-18");
  });

  it("writes a plain date as UTC midnight", () => {
    expect(ymdToDbDate("2026-09-18").toISOString()).toBe("2026-09-18T00:00:00.000Z");
  });

  it("round-trips in both directions", () => {
    for (const ymd of ["2026-09-18", "2024-03-20", "2024-02-29", "2026-12-31"]) {
      expect(dbDateToYmd(ymdToDbDate(ymd)), ymd).toBe(ymd);
    }
  });
});
