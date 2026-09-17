// All "calendar" logic runs in the gym's timezone, regardless of server/tablet clock zone.
export const GYM_TZ = process.env.NEXT_PUBLIC_GYM_TZ || "Africa/Casablanca";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: GYM_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hmFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: GYM_TZ,
  hour: "2-digit",
  minute: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: GYM_TZ,
  hour: "2-digit",
  hourCycle: "h23",
});

/** Local calendar date (YYYY-MM-DD) of an instant, in the gym timezone. */
export function localDate(instant: Date | string = new Date()): string {
  return ymdFormatter.format(new Date(instant));
}

export function todayYmd(): string {
  return localDate(new Date());
}

/** "17:42" */
export function formatTime(instant: Date | string): string {
  return hmFormatter.format(new Date(instant));
}

/** Hour 0-23 in the gym timezone. */
export function localHour(instant: Date | string): number {
  return Number(hourFormatter.format(new Date(instant)));
}

/** "2026-09-30" -> "30/09" */
export function formatDayMonth(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

/** "2026-09-30" -> "30/09/2026" */
export function formatFullDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((ymdToUtcMs(b) - ymdToUtcMs(a)) / 86_400_000);
}

export function addDays(ymd: string, days: number): string {
  return new Date(ymdToUtcMs(ymd) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Prisma @db.Date values come back as UTC midnight. */
export function dbDateToYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ymdToDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}
