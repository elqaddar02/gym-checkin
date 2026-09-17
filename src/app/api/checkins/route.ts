import { NextResponse } from "next/server";
import { recordCheckIns } from "@/lib/checkins";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await recordCheckIns([body]);
  if (result.rejected.length > 0) {
    return NextResponse.json({ error: result.rejected[0].error, ...result }, { status: 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
