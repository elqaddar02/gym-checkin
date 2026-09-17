import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { dbDateToYmd, todayYmd } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralize spreadsheet formula injection (but keep phone numbers like +212… intact).
  if (/^[=@\t\r]|^[+\-][^\d]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// One row per subscription (members without one get a single row), so the file is a full backup.
export async function GET(request: Request) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const type = new URL(request.url).searchParams.get("type") ?? "members";

  let csv: string;
  if (type === "checkins") {
    const checkIns = await prisma.checkIn.findMany({
      orderBy: { checkedInAt: "desc" },
      include: { member: { select: { name: true, phone: true } } },
    });
    csv = toCsv([
      ["checkin_id", "member_id", "name", "phone", "checked_in_at", "override_reason"],
      ...checkIns.map((c) => [c.id, c.memberId, c.member.name, c.member.phone, c.checkedInAt.toISOString(), c.overrideReason]),
    ]);
  } else {
    const members = await prisma.member.findMany({
      orderBy: { name: "asc" },
      include: { subscriptions: { orderBy: { startDate: "desc" } } },
    });
    const header = [
      "member_id", "name", "phone", "member_notes", "member_created_at",
      "subscription_id", "status", "amount_mad", "start_date", "end_date",
      "payment_method", "receipt_number", "subscription_notes", "subscription_created_at", "created_by",
    ];
    const rows: unknown[][] = [header];
    for (const m of members) {
      const base = [m.id, m.name, m.phone, m.notes, m.createdAt.toISOString()];
      if (m.subscriptions.length === 0) rows.push([...base, "", "", "", "", "", "", "", "", "", ""]);
      for (const s of m.subscriptions) {
        rows.push([
          ...base, s.id, s.status, s.amount, dbDateToYmd(s.startDate), dbDateToYmd(s.endDate),
          s.paymentMethod, s.receiptNumber, s.notes, s.createdAt.toISOString(), s.createdBy,
        ]);
      }
    }
    csv = toCsv(rows);
  }

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gym-${type}-${todayYmd()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
