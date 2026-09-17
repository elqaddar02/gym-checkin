import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getDashboard } from "@/lib/queries";

export async function GET() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  return NextResponse.json(await getDashboard());
}
