import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/lib/auth";
import { ymdToDbDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { listMembers } from "@/lib/queries";
import { firstError, memberCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("phone") ?? searchParams.get("q") ?? undefined;
  return NextResponse.json({ members: await listMembers(q) });
}

export async function POST(request: Request) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const parsed = memberCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
  const { subscription, ...member } = parsed.data;

  try {
    const created = await prisma.member.create({
      data: {
        ...member,
        subscriptions: subscription
          ? {
              create: {
                ...subscription,
                startDate: ymdToDbDate(subscription.startDate),
                endDate: ymdToDbDate(subscription.endDate),
                createdBy: owner,
              },
            }
          : undefined,
      },
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ce numéro existe déjà" }, { status: 409 });
    }
    throw e;
  }
}
