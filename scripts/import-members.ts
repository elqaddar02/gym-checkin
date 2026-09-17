// Import members from a CSV (comma or semicolon separated, UTF-8, header row).
// Columns: name, phone, notes, start_date, end_date, amount, payment_method, receipt_number, status
// Dates: YYYY-MM-DD or DD/MM/YYYY. Only name + phone are required.
// Usage: npm run import:members -- members.csv [--dry-run]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizePhone } from "../src/lib/phone";

const CREATED_BY = "import";

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function parseDate(s: string | undefined): string | null {
  const v = s?.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!file) {
    console.error("Usage: npm run import:members -- <file.csv> [--dry-run]");
    process.exit(1);
  }

  const [header, ...rows] = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = {
    name: col("name"), phone: col("phone"), notes: col("notes"),
    start: col("start_date"), end: col("end_date"), amount: col("amount"),
    method: col("payment_method"), receipt: col("receipt_number"), status: col("status"),
  };
  if (idx.name < 0 || idx.phone < 0) {
    console.error(`CSV needs at least "name" and "phone" columns. Found: ${header.join(", ")}`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let created = 0, updated = 0, subs = 0;
  const errors: string[] = [];

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const get = (k: number) => (k >= 0 ? r[k]?.trim() ?? "" : "");
    const name = get(idx.name);
    const phone = normalizePhone(get(idx.phone));
    if (!name || !phone) {
      errors.push(`line ${line}: missing name or invalid phone "${get(idx.phone)}"`);
      continue;
    }
    const start = parseDate(get(idx.start));
    const end = parseDate(get(idx.end));
    const amount = get(idx.amount) ? Number(get(idx.amount).replace(/\s/g, "").replace(",", ".")) : null;
    const method = (get(idx.method) || "cash").toLowerCase();
    const status = (get(idx.status) || "active").toLowerCase();

    const hasSub = start || end || amount !== null;
    if (hasSub) {
      if (!start || !end || amount === null || Number.isNaN(amount)) {
        errors.push(`line ${line}: subscription needs start_date, end_date and amount`);
        continue;
      }
      if (!["cash", "card", "transfer"].includes(method) || !["active", "expired", "paused"].includes(status)) {
        errors.push(`line ${line}: payment_method must be cash|card|transfer, status active|expired|paused`);
        continue;
      }
    }
    if (dryRun) { created++; if (hasSub) subs++; continue; }

    const existing = await prisma.member.findUnique({ where: { phone } });
    const member = existing
      ? await prisma.member.update({ where: { phone }, data: { name, notes: get(idx.notes) || existing.notes } })
      : await prisma.member.create({ data: { name, phone, notes: get(idx.notes) || null } });
    if (existing) updated++; else created++;

    if (hasSub) {
      const dup = await prisma.subscription.findFirst({
        where: { memberId: member.id, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`) },
      });
      if (!dup) {
        await prisma.subscription.create({
          data: {
            memberId: member.id,
            status: status as "active" | "expired" | "paused",
            amount: Math.round(amount!),
            startDate: new Date(`${start}T00:00:00Z`),
            endDate: new Date(`${end}T00:00:00Z`),
            paymentMethod: method as "cash" | "card" | "transfer",
            receiptNumber: get(idx.receipt) || null,
            createdBy: CREATED_BY,
          },
        });
        subs++;
      }
    }
  }

  console.log(`${dryRun ? "[dry run] " : ""}members created: ${created}, updated: ${updated}, subscriptions added: ${subs}`);
  if (errors.length) console.log(`Skipped ${errors.length} row(s):\n  ${errors.join("\n  ")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
