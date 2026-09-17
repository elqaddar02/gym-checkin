import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/lib/auth";
import { ymdToDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { firstError, subscriptionSchema } from "@/lib/validation";

// Correct a subscription (typo in dates/amount, pause, mark expired).
export async function PATCH(request: Request, ctx: RouteContext<"/api/subscriptions/[id]">) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const { id } = await ctx.params;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });

  try {
    await prisma.subscription.update({
      where: { id },
      data: {
        ...parsed.data,
        startDate: ymdToDbDate(parsed.data.startDate),
        endDate: ymdToDbDate(parsed.data.endDate),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
    }
    throw e;
  }
}
