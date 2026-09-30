import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { dbDateToYmd, todayYmd } from "@/lib/dates";
import { buildPdfReport, toCsv } from "@/lib/export";
import { prisma } from "@/lib/prisma";

// One row per subscription (members without one get a single row), so the file is a full backup.
export async function GET(request: Request) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "members";
  const format = url.searchParams.get("format") ?? "csv";

  let rows: unknown[][];
  let title: string;
  if (type === "checkins") {
    const checkIns = await prisma.checkIn.findMany({
      orderBy: { checkedInAt: "desc" },
      include: { member: { select: { name: true, phone: true } } },
    });
    title = "Gym Check-In — Historique des entrées";
    rows = [
      ["checkin_id", "member_id", "name", "phone", "checked_in_at", "override_reason"],
      ...checkIns.map((c) => [c.id, c.memberId, c.member.name, c.member.phone, c.checkedInAt.toISOString(), c.overrideReason]),
    ];
  } else {
    const members = await prisma.member.findMany({
      orderBy: { name: "asc" },
      include: { subscriptions: { orderBy: { startDate: "desc" } } },
    });
    title = "Gym Check-In — Membres et abonnements";
    const header = [
      "member_id", "name", "phone", "member_notes", "member_created_at",
      "subscription_id", "status", "amount_mad", "start_date", "end_date",
      "payment_method", "receipt_number", "subscription_notes", "subscription_created_at", "created_by",
    ];
    rows = [header];
    for (const m of members) {
      const base = [m.id, m.name, m.phone, m.notes, m.createdAt.toISOString()];
      if (m.subscriptions.length === 0) rows.push([...base, "", "", "", "", "", "", "", "", ""]);
      for (const s of m.subscriptions) {
        rows.push([
          ...base, s.id, s.status, s.amount, dbDateToYmd(s.startDate), dbDateToYmd(s.endDate),
          s.paymentMethod, s.receiptNumber, s.notes, s.createdAt.toISOString(), s.createdBy,
        ]);
      }
    }
  }

  if (format === "pdf") {
    const pdf = buildPdfReport({
      title,
      subtitle: `Exporté le ${todayYmd()}`,
      rows,
    });
    return new NextResponse(Buffer.from(pdf, "latin1"), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="gym-${type}-${todayYmd()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = toCsv(rows);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gym-${type}-${todayYmd()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
