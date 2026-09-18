import { describe, expect, it, vi } from "vitest";
import {
  STATUS_EMOJI,
  type MemberStatus,
  currentSubscription,
  memberStatus,
  statusLabel,
  statusShort,
  statusSortKey,
  statusTone,
} from "./status";
import type { SubscriptionStatus } from "./types";

const TODAY = "2026-09-18";

type Sub = {
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  createdAt: string;
  label?: string;
};

function sub(overrides: Partial<Sub> = {}): Sub {
  return {
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("currentSubscription", () => {
  it("returns null for a member with no subscription", () => {
    expect(currentSubscription([], TODAY)).toBeNull();
  });

  it("returns the only subscription", () => {
    const only = sub();
    expect(currentSubscription([only], TODAY)).toBe(only);
  });

  it("prefers a subscription that has started over a future renewal", () => {
    const started = sub({ label: "started", startDate: "2026-09-01", endDate: "2026-09-30" });
    const future = sub({ label: "future", startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(currentSubscription([future, started], TODAY)?.label).toBe("started");
  });

  it("falls back to a future renewal when nothing has started yet", () => {
    const soon = sub({ label: "soon", startDate: "2026-10-01", endDate: "2026-10-31" });
    const later = sub({ label: "later", startDate: "2026-11-01", endDate: "2026-11-30" });
    expect(currentSubscription([soon, later], TODAY)?.label).toBe("later");
  });

  it("counts a subscription starting today as started", () => {
    const today = sub({ label: "today", startDate: TODAY, endDate: "2026-10-17" });
    const future = sub({ label: "future", startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(currentSubscription([future, today], TODAY)?.label).toBe("today");
  });

  it("takes the most recently started of several started subscriptions", () => {
    const old = sub({ label: "old", startDate: "2026-07-01", endDate: "2026-07-31" });
    const recent = sub({ label: "recent", startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(currentSubscription([old, recent], TODAY)?.label).toBe("recent");
    expect(currentSubscription([recent, old], TODAY)?.label).toBe("recent");
  });

  it("breaks a same-start-date tie with the later createdAt", () => {
    const first = sub({ label: "first", createdAt: "2026-09-01T09:00:00.000Z" });
    const corrected = sub({ label: "corrected", createdAt: "2026-09-01T18:00:00.000Z" });
    expect(currentSubscription([first, corrected], TODAY)?.label).toBe("corrected");
    expect(currentSubscription([corrected, first], TODAY)?.label).toBe("corrected");
  });

  it("does not reorder the caller's array", () => {
    const a = sub({ label: "a", startDate: "2026-07-01" });
    const b = sub({ label: "b", startDate: "2026-09-01" });
    const subs = [a, b];
    currentSubscription(subs, TODAY);
    expect(subs.map((s) => s.label)).toEqual(["a", "b"]);
  });

  it("defaults today to the gym's current date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00.000Z"));
    try {
      const started = sub({ label: "started", startDate: "2026-09-01" });
      const future = sub({ label: "future", startDate: "2026-10-01" });
      expect(currentSubscription([future, started])?.label).toBe("started");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("memberStatus", () => {
  it("is 'none' when the member has never subscribed", () => {
    expect(memberStatus([], TODAY)).toEqual({ kind: "none" });
  });

  it("is 'active' while a paid subscription still runs", () => {
    expect(memberStatus([sub({ endDate: "2026-09-30" })], TODAY)).toEqual({
      kind: "active",
      until: "2026-09-30",
      daysLeft: 12,
    });
  });

  it("is still 'active' on the last paid day", () => {
    expect(memberStatus([sub({ endDate: TODAY })], TODAY)).toEqual({
      kind: "active",
      until: TODAY,
      daysLeft: 0,
    });
  });

  it("is 'expired' the day after the end date", () => {
    expect(memberStatus([sub({ endDate: "2026-09-17" })], TODAY)).toEqual({
      kind: "expired",
      since: "2026-09-17",
      days: 1,
    });
  });

  it("counts how long a lapsed member has been expired", () => {
    expect(memberStatus([sub({ endDate: "2026-08-18" })], TODAY)).toEqual({
      kind: "expired",
      since: "2026-08-18",
      days: 31,
    });
  });

  it("is 'paused' whenever the subscription is marked paused", () => {
    expect(memberStatus([sub({ status: "paused", endDate: "2026-10-15" })], TODAY)).toEqual({
      kind: "paused",
      until: "2026-10-15",
    });
  });

  it("keeps a paused subscription paused even once its end date has passed", () => {
    expect(memberStatus([sub({ status: "paused", endDate: "2026-09-10" })], TODAY)).toEqual({
      kind: "paused",
      until: "2026-09-10",
    });
  });

  it("honours an explicit 'expired' status even when the dates still look valid", () => {
    // The owner can end a subscription early; the stored status wins over the dates,
    // and the member is not shown as owing days.
    expect(memberStatus([sub({ status: "expired", endDate: "2026-09-30" })], TODAY)).toEqual({
      kind: "expired",
      since: "2026-09-30",
      days: 0,
    });
  });

  it("goes active again when a renewal starts", () => {
    const lapsed = sub({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const renewal = sub({ startDate: TODAY, endDate: "2026-10-17" });
    expect(memberStatus([lapsed, renewal], TODAY)).toEqual({
      kind: "active",
      until: "2026-10-17",
      daysLeft: 29,
    });
  });

  it("does not let a future renewal hide a currently expired subscription", () => {
    const lapsed = sub({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const prepaid = sub({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(memberStatus([lapsed, prepaid], TODAY)).toEqual({
      kind: "expired",
      since: "2026-08-31",
      days: 18,
    });
  });

  it("reads a prepaid-only member off their future subscription", () => {
    const prepaid = sub({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(memberStatus([prepaid], TODAY)).toEqual({
      kind: "active",
      until: "2026-10-31",
      daysLeft: 43,
    });
  });
});

describe("statusLabel", () => {
  it("names each status in French", () => {
    expect(statusLabel({ kind: "active", until: "2026-09-30", daysLeft: 12 })).toBe("Payé jusqu'au 30/09");
    expect(statusLabel({ kind: "paused", until: "2026-10-15" })).toBe("En pause (retour 15/10)");
    expect(statusLabel({ kind: "none" })).toBe("Aucun abonnement");
  });

  it("says 'today' rather than '0 days' for a subscription expiring today", () => {
    expect(statusLabel({ kind: "expired", since: "2026-09-18", days: 0 })).toBe("Expiré aujourd'hui");
  });

  it("pluralizes the expired day count", () => {
    expect(statusLabel({ kind: "expired", since: "2026-09-17", days: 1 })).toBe("Expiré depuis 1 jour");
    expect(statusLabel({ kind: "expired", since: "2026-09-16", days: 2 })).toBe("Expiré depuis 2 jours");
  });
});

describe("STATUS_EMOJI", () => {
  it("has a colour for every status kind", () => {
    expect(STATUS_EMOJI).toEqual({ active: "🟢", expired: "🔴", paused: "🟡", none: "⚫" });
  });
});

describe("statusSortKey", () => {
  it("puts the owner's list in the order they need to act on it", () => {
    const statuses: MemberStatus[] = [
      { kind: "none" },
      { kind: "active", until: "2026-09-30", daysLeft: 12 },
      { kind: "expired", since: "2026-06-30", days: 80 },
      { kind: "paused", until: "2026-10-15" },
      { kind: "expired", since: "2026-09-17", days: 1 },
      { kind: "active", until: "2026-09-20", daysLeft: 2 },
    ];
    const sorted = [...statuses].sort((a, b) => statusSortKey(a) - statusSortKey(b));
    expect(sorted).toEqual([
      { kind: "expired", since: "2026-09-17", days: 1 },
      { kind: "expired", since: "2026-06-30", days: 80 },
      { kind: "active", until: "2026-09-20", daysLeft: 2 },
      { kind: "active", until: "2026-09-30", daysLeft: 12 },
      { kind: "paused", until: "2026-10-15" },
      { kind: "none" },
    ]);
  });

  it("sorts the most recently expired member first", () => {
    const today = statusSortKey({ kind: "expired", since: "2026-09-18", days: 0 });
    const lastWeek = statusSortKey({ kind: "expired", since: "2026-09-11", days: 7 });
    expect(today).toBeLessThan(lastWeek);
  });

  it("sorts the soonest expiring active member first", () => {
    const soon = statusSortKey({ kind: "active", until: "2026-09-20", daysLeft: 2 });
    const later = statusSortKey({ kind: "active", until: "2026-12-20", daysLeft: 93 });
    expect(soon).toBeLessThan(later);
  });

  it("keeps even a long-expired member ahead of every active one", () => {
    const longExpired = statusSortKey({ kind: "expired", since: "2020-01-01", days: 2452 });
    const expiringToday = statusSortKey({ kind: "active", until: "2026-09-18", daysLeft: 0 });
    expect(longExpired).toBeLessThan(expiringToday);
  });
});

describe("statusShort", () => {
  it("names the status in one word for dense lists", () => {
    expect(statusShort(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-04-01" })], "2026-03-10"))).toBe("Actif");
    expect(statusShort(memberStatus([sub({ startDate: "2026-02-01", endDate: "2026-03-01" })], "2026-03-10"))).toBe("Expiré");
    expect(
      statusShort(memberStatus([sub({ status: "paused", startDate: "2026-03-01", endDate: "2026-04-01" })], "2026-03-10")),
    ).toBe("En pause");
    expect(statusShort(memberStatus([], "2026-03-10"))).toBe("Sans abonnement");
  });

  it("counts down the last week, because that is the week to act on", () => {
    expect(statusShort(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-03-13" })], "2026-03-10"))).toBe("Expire J-3");
    expect(statusShort(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-03-17" })], "2026-03-10"))).toBe("Expire J-7");
    expect(statusShort(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-03-18" })], "2026-03-10"))).toBe("Actif");
  });
});

describe("statusTone", () => {
  it("turns a membership amber in its last week, before it expires", () => {
    expect(statusTone(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-03-18" })], "2026-03-10"))).toBe("ok");
    expect(statusTone(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-03-17" })], "2026-03-10"))).toBe(
      "warn",
    );
    expect(statusTone(memberStatus([sub({ startDate: "2026-03-01", endDate: "2026-03-10" })], "2026-03-10"))).toBe(
      "warn",
    );
  });

  it("keeps the other kinds on their own tone", () => {
    expect(statusTone(memberStatus([sub({ startDate: "2026-02-01", endDate: "2026-03-01" })], "2026-03-10"))).toBe(
      "stop",
    );
    expect(
      statusTone(memberStatus([sub({ status: "paused", startDate: "2026-03-01", endDate: "2026-04-01" })], "2026-03-10")),
    ).toBe("warn");
    expect(statusTone(memberStatus([], "2026-03-10"))).toBe("muted");
  });
});
