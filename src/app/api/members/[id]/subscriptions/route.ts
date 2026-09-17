import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { ymdToDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { firstError, subscriptionSchema } from "@/lib/validation";

// Every payment/renewal is a new row, so revenue history is preserved.
export async function POST(request: Request, ctx: RouteContext<"/api/members/[id]/subscriptions">) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const { id } = await ctx.params;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });

  const member = await prisma.member.findUnique({ where: { id }, select: { id: true } }).catch(() => null);
  if (!member) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });

  const created = await prisma.subscription.create({
    data: {
      ...parsed.data,
      memberId: id,
      startDate: ymdToDbDate(parsed.data.startDate),
      endDate: ymdToDbDate(parsed.data.endDate),
      createdBy: owner,
    },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
