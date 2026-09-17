import { daysBetween, formatDayMonth, todayYmd } from "./dates";
import type { SubscriptionStatus } from "./types";

type SubLike = {
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
};

export type MemberStatus =
  | { kind: "active"; until: string; daysLeft: number }
  | { kind: "expired"; since: string; days: number }
  | { kind: "paused"; until: string }
  | { kind: "none" };

/**
 * The subscription that defines membership today: the most recently started one
 * (future-dated renewals only count if nothing has started yet).
 */
export function currentSubscription<T extends SubLike>(subs: T[], today = todayYmd()): T | null {
  if (subs.length === 0) return null;
  const started = subs.filter((s) => s.startDate <= today);
  const pool = started.length > 0 ? started : subs;
  return [...pool].sort(
    (a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt),
  )[0];
}

export function memberStatus(subs: SubLike[], today = todayYmd()): MemberStatus {
  const sub = currentSubscription(subs, today);
  if (!sub) return { kind: "none" };
  if (sub.status === "paused") return { kind: "paused", until: sub.endDate };
  if (sub.status === "active" && sub.endDate >= today) {
    return { kind: "active", until: sub.endDate, daysLeft: daysBetween(today, sub.endDate) };
  }
  return { kind: "expired", since: sub.endDate, days: Math.max(0, daysBetween(sub.endDate, today)) };
}

export function statusLabel(status: MemberStatus): string {
  switch (status.kind) {
    case "active":
      return `Payé jusqu'au ${formatDayMonth(status.until)}`;
    case "expired":
      if (status.days === 0) return "Expiré aujourd'hui";
      return `Expiré depuis ${status.days} jour${status.days > 1 ? "s" : ""}`;
    case "paused":
      return `En pause (retour ${formatDayMonth(status.until)})`;
    case "none":
      return "Aucun abonnement";
  }
}

export const STATUS_EMOJI: Record<MemberStatus["kind"], string> = {
  active: "🟢",
  expired: "🔴",
  paused: "🟡",
  none: "⚫",
};

/** Sort key for the owner's list: expired first (most recent first), then soonest expiry. */
export function statusSortKey(status: MemberStatus): number {
  switch (status.kind) {
    case "expired":
      return -100_000 + status.days;
    case "active":
      return status.daysLeft;
    case "paused":
      return 50_000;
    case "none":
      return 100_000;
  }
}
