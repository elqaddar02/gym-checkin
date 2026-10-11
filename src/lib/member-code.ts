import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** Any number that identifies one lock; it only has to be the same everywhere a code is handed out. */
const CODE_LOCK = 7_301_001;

/**
 * Create a member with the next reception code: the last code in use + 1.
 *
 * The lock is held until the transaction ends, so two members created at the
 * same moment (the owner's screen and an import, say) can never read the same
 * last code. Not in a "server-only" module because the import script uses it too.
 */
export async function createMemberWithCode(
  prisma: PrismaClient,
  data: Omit<Prisma.MemberCreateInput, "code">,
) {
  return prisma.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: the lock function returns void, which has no column type to read back.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CODE_LOCK})`;
    const last = await tx.member.aggregate({ _max: { code: true } });
    return tx.member.create({ data: { ...data, code: nextCode(last._max.code) } });
  });
}

export function nextCode(lastCode: number | null | undefined): number {
  return (lastCode ?? 0) + 1;
}

/** "N° 7" — how the code is written everywhere a person reads it. */
export function formatCode(code: number | null | undefined): string {
  return code ? `N° ${code}` : "N° —";
}
