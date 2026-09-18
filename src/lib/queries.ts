import "server-only";
import { addDays, dbDateToYmd, formatDayMonth, localDate, localHour, todayYmd, ymdToDbDate } from "./dates";
import { phoneQueryDigits, phoneSearchKey } from "./phone";
import { prisma } from "./prisma";
import { toSubscriptionDTO } from "./serialize";
import { currentSubscription, memberStatus, statusSortKey, type MemberStatus } from "./status";
import { OVERRIDE_LABELS, PAYMENT_LABELS, type OverrideReason, type PaymentMethod, type SubscriptionDTO } from "./types";

export interface MemberRow {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  status: MemberStatus;
  current: SubscriptionDTO | null;
  lastCheckInAt: string | null;
}

export async function listMembers(query?: string): Promise<MemberRow[]> {
  const members = await prisma.member.findMany({
    include: {
      subscriptions: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], take: 5 },
      checkIns: { orderBy: { checkedInAt: "desc" }, take: 1, select: { checkedInAt: true } },
    },
  });
  const today = todayYmd();

  const q = query?.trim().toLowerCase() ?? "";
  const digits = phoneQueryDigits(q);

  return members
    .filter((m) => {
      if (!q) return true;
      if (m.name.toLowerCase().includes(q)) return true;
      return digits.length >= 2 && phoneSearchKey(m.phone).includes(digits);
    })
    .map((m) => {
      const subs = m.subscriptions.map(toSubscriptionDTO);
      const status = memberStatus(subs, today);
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        notes: m.notes,
        status,
        current: currentSubscription(subs, today),
        lastCheckInAt: m.checkIns[0]?.checkedInAt.toISOString() ?? null,
      };
    })
    .sort((a, b) => statusSortKey(a.status) - statusSortKey(b.status) || a.name.localeCompare(b.name));
}

export async function getMemberDetail(id: string) {
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      subscriptions: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }] },
      checkIns: { orderBy: { checkedInAt: "desc" }, take: 20 },
    },
  });
  if (!member) return null;
  const subscriptions = member.subscriptions.map(toSubscriptionDTO);
  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    notes: member.notes,
    createdAt: member.createdAt.toISOString(),
    status: memberStatus(subscriptions),
    subscriptions,
    checkIns: member.checkIns.map((c) => ({
      id: c.id,
      checkedInAt: c.checkedInAt.toISOString(),
      overrideReason: c.overrideReason,
    })),
  };
}

export type MemberDetail = NonNullable<Awaited<ReturnType<typeof getMemberDetail>>>;

/** One line of the activity module: entries, payments and sign-ups in one stream. */
export interface ActivityEntry {
  id: string;
  kind: "checkin" | "override" | "payment" | "member";
  at: string;
  memberId: string;
  name: string;
  detail: string;
}

export interface DashboardData {
  month: string; // YYYY-MM
  revenue: {
    total: number;
    byMethod: Record<PaymentMethod, number>;
    count: number;
    /** Same measure over the previous month, for the trend line. */
    previousTotal: number;
  };
  expiringSoon: { id: string; name: string; phone: string; until: string; daysLeft: number; amount: number }[];
  checkInsToday: { total: number; byHour: number[]; lastWeek: number };
  members: { total: number; active: number; expired: number; paused: number; none: number };
  /** Kept for the API's existing consumers; the dashboard reads `activity`. */
  recentCheckIns: { id: string; memberId: string; name: string; checkedInAt: string; overrideReason: OverrideReason | null }[];
  activity: ActivityEntry[];
}

export async function getDashboard(): Promise<DashboardData> {
  const today = todayYmd();
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonthStart = addDays(`${month}-28`, 7).slice(0, 7) + "-01";
  const prevMonthStart = addDays(monthStart, -1).slice(0, 7) + "-01";

  // Revenue = payments whose period starts this month (so imported history doesn't inflate it).
  const paidSince = await prisma.subscription.findMany({
    where: { startDate: { gte: ymdToDbDate(prevMonthStart), lt: ymdToDbDate(nextMonthStart) } },
    select: { amount: true, paymentMethod: true, startDate: true },
  });
  const monthSubs = paidSince.filter((s) => dbDateToYmd(s.startDate) >= monthStart);
  const prevSubs = paidSince.filter((s) => dbDateToYmd(s.startDate) < monthStart);

  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 };
  for (const s of monthSubs) byMethod[s.paymentMethod] += s.amount;

  const members = await listMembers();
  const expiringSoon = members
    .filter((m) => m.status.kind === "active" && m.status.daysLeft <= 7)
    .map((m) => {
      const s = m.status as Extract<MemberStatus, { kind: "active" }>;
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        until: s.until,
        daysLeft: s.daysLeft,
        // What renewing at the same price would bring in.
        amount: m.current?.amount ?? 0,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // Look back far enough to cover today and the same weekday last week, then
  // filter by local date: avoids timezone math in SQL.
  const lastWeekYmd = addDays(today, -7);
  const since = new Date(`${addDays(lastWeekYmd, -1)}T00:00:00Z`);
  const recent = await prisma.checkIn.findMany({
    where: { checkedInAt: { gte: since } },
    select: { checkedInAt: true },
  });
  const todays = recent.filter((c) => localDate(c.checkedInAt) === today);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const c of todays) byHour[localHour(c.checkedInAt)]++;

  const last20 = await prisma.checkIn.findMany({
    orderBy: { checkedInAt: "desc" },
    take: 20,
    include: { member: { select: { name: true } } },
  });

  const recentPayments = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { member: { select: { name: true } } },
  });
  const recentMembers = await prisma.member.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, name: true, createdAt: true },
  });

  const activity: ActivityEntry[] = [
    ...last20.map((c) => ({
      id: `c-${c.id}`,
      kind: (c.overrideReason ? "override" : "checkin") as ActivityEntry["kind"],
      at: c.checkedInAt.toISOString(),
      memberId: c.memberId,
      name: c.member.name,
      detail: c.overrideReason ? OVERRIDE_LABELS[c.overrideReason] : "Entrée validée",
    })),
    ...recentPayments.map((s) => ({
      id: `s-${s.id}`,
      kind: "payment" as const,
      at: s.createdAt.toISOString(),
      memberId: s.memberId,
      name: s.member.name,
      detail: `${s.amount} MAD · ${PAYMENT_LABELS[s.paymentMethod]} · jusqu'au ${formatDayMonth(dbDateToYmd(s.endDate))}`,
    })),
    ...recentMembers.map((m) => ({
      id: `m-${m.id}`,
      kind: "member" as const,
      at: m.createdAt.toISOString(),
      memberId: m.id,
      name: m.name,
      detail: "Nouveau membre",
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  const count = (kind: MemberStatus["kind"]) => members.filter((m) => m.status.kind === kind).length;

  return {
    month,
    revenue: {
      total: byMethod.cash + byMethod.card + byMethod.transfer,
      byMethod,
      count: monthSubs.length,
      previousTotal: prevSubs.reduce((sum, s) => sum + s.amount, 0),
    },
    expiringSoon,
    checkInsToday: {
      total: todays.length,
      byHour,
      lastWeek: recent.filter((c) => localDate(c.checkedInAt) === lastWeekYmd).length,
    },
    members: {
      total: members.length,
      active: count("active"),
      expired: count("expired"),
      paused: count("paused"),
      none: count("none"),
    },
    recentCheckIns: last20.map((c) => ({
      id: c.id,
      memberId: c.memberId,
      name: c.member.name,
      checkedInAt: c.checkedInAt.toISOString(),
      overrideReason: c.overrideReason,
    })),
    activity,
  };
}
