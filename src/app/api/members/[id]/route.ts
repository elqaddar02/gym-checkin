import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMemberDetail } from "@/lib/queries";
import { firstError, memberUpdateSchema } from "@/lib/validation";

export async function GET(_request: Request, ctx: RouteContext<"/api/members/[id]">) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const { id } = await ctx.params;
  const member = await getMemberDetail(id).catch(() => null);
  if (!member) return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
  return NextResponse.json({ member });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/members/[id]">) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  const { id } = await ctx.params;
  const parsed = memberUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });

  try {
    await prisma.member.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return NextResponse.json({ error: "Ce numéro existe déjà" }, { status: 409 });
      if (e.code === "P2025") return NextResponse.json({ error: "Membre introuvable" }, { status: 404 });
    }
    throw e;
  }
}
