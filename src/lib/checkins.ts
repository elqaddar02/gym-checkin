import "server-only";
import { prisma } from "./prisma";
import { checkInSchema } from "./validation";

const MAX_FUTURE_MS = 10 * 60 * 1000; // tablet clock drift
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // offline for two months is not realistic

export interface CheckInResult {
  synced: string[];
  rejected: { id: string | null; error: string }[];
}

/**
 * Store check-ins idempotently (the tablet generates the id, so retries are no-ops).
 * An entry is "synced" if it is stored now or was stored before.
 */
export async function recordCheckIns(items: unknown[]): Promise<CheckInResult> {
  const result: CheckInResult = { synced: [], rejected: [] };
  const valid: { id: string; memberId: string; checkedInAt: Date; overrideReason: "cash_paid" | "owner_approved" | "other" | null }[] = [];
  const now = Date.now();

  for (const item of items) {
    const parsed = checkInSchema.safeParse(item);
    const id = (item as { id?: unknown })?.id;
    if (!parsed.success) {
      result.rejected.push({ id: typeof id === "string" ? id : null, error: "Données invalides" });
      continue;
    }
    const at = new Date(parsed.data.checkedInAt);
    if (at.getTime() > now + MAX_FUTURE_MS || at.getTime() < now - MAX_AGE_MS) {
      result.rejected.push({ id: parsed.data.id, error: "Horodatage invalide" });
      continue;
    }
    valid.push({
      id: parsed.data.id,
      memberId: parsed.data.memberId,
      checkedInAt: at,
      overrideReason: parsed.data.overrideReason ?? null,
    });
  }

  if (valid.length === 0) return result;

  const existingMembers = await prisma.member.findMany({
    where: { id: { in: [...new Set(valid.map((v) => v.memberId))] } },
    select: { id: true },
  });
  const memberIds = new Set(existingMembers.map((m) => m.id));

  const toInsert = valid.filter((v) => {
    if (memberIds.has(v.memberId)) return true;
    result.rejected.push({ id: v.id, error: "Membre introuvable" });
    return false;
  });

  if (toInsert.length > 0) {
    await prisma.checkIn.createMany({
      data: toInsert.map((v) => ({ ...v, synced: true })),
      skipDuplicates: true,
    });
    result.synced.push(...toInsert.map((v) => v.id));
  }

  return result;
}
