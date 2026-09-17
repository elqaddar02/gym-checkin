import "server-only";
import { addDays, localDate, localHour, todayYmd } from "./dates";
import { phoneQueryDigits, phoneSearchKey } from "./phone";
import { prisma } from "./prisma";
import { toSubscriptionDTO } from "./serialize";
import { currentSubscription, memberStatus, statusSortKey, type MemberStatus } from "./status";
import type { OverrideReason, PaymentMethod, SubscriptionDTO } from "./types";

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

export interface DashboardData {
  month: string; // YYYY-MM
  revenue: { total: number; byMethod: Record<PaymentMethod, number>; count: number };
  expiringSoon: { id: string; name: string; phone: string; until: string; daysLeft: number }[];
  checkInsToday: { total: number; byHour: number[] };
  activeMembers: number;
  totalMembers: number;
  recentCheckIns: { id: string; memberId: string; name: string; checkedInAt: string; overrideReason: OverrideReason | null }[];
}

export async function getDashboard(): Promise<DashboardData> {
  const today = todayYmd();
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const nextMonthStart = addDays(`${month}-28`, 7).slice(0, 7) + "-01";

  // Revenue = payments whose period starts this month (so imported history doesn't inflate it).
  const monthSubs = await prisma.subscription.findMany({
    where: { startDate: { gte: new Date(`${monthStart}T00:00:00Z`), lt: new Date(`${nextMonthStart}T00:00:00Z`) } },
    select: { amount: true, paymentMethod: true },
  });
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, transfer: 0 };
  for (const s of monthSubs) byMethod[s.paymentMethod] += s.amount;

  const members = await listMembers();
  const expiringSoon = members
    .filter((m) => m.status.kind === "active" && m.status.daysLeft <= 7)
    .map((m) => {
      const s = m.status as Extract<MemberStatus, { kind: "active" }>;
      return { id: m.id, name: m.name, phone: m.phone, until: s.until, daysLeft: s.daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // Look back 36h and filter by local date: avoids timezone math in SQL.
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
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

  return {
    month,
    revenue: { total: byMethod.cash + byMethod.card + byMethod.transfer, byMethod, count: monthSubs.length },
    expiringSoon,
    checkInsToday: { total: todays.length, byHour },
    activeMembers: members.filter((m) => m.status.kind === "active").length,
    totalMembers: members.length,
    recentCheckIns: last20.map((c) => ({
      id: c.id,
      memberId: c.memberId,
      name: c.member.name,
      checkedInAt: c.checkedInAt.toISOString(),
      overrideReason: c.overrideReason,
    })),
  };
}
