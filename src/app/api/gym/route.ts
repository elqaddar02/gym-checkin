import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firstError, gymBrandSchema } from "@/lib/validation";

/** One gym per installation today: the first row is the one every screen reads. */
export async function PUT(request: Request) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const parsed = gymBrandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });

  const existing = await prisma.gym.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const gym = existing
    ? await prisma.gym.update({ where: { id: existing.id }, data: parsed.data })
    : await prisma.gym.create({ data: parsed.data });

  return NextResponse.json({ id: gym.id });
}
