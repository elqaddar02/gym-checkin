import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toReceptionMember } from "@/lib/serialize";

// Public: the reception tablet has no login. Returns only what the check-in screen needs.
export async function GET() {
  const members = await prisma.member.findMany({
    orderBy: { name: "asc" },
    include: {
      subscriptions: { orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], take: 5 },
      checkIns: { orderBy: { checkedInAt: "desc" }, take: 1, select: { checkedInAt: true } },
    },
  });

  return NextResponse.json(
    { members: members.map(toReceptionMember), fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
