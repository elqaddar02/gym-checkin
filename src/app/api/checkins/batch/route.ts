import { NextResponse } from "next/server";
import { recordCheckIns } from "@/lib/checkins";
import { checkInBatchSchema } from "@/lib/validation";

// Offline queue flush. Partial success is normal: the client drops synced and rejected ids.
export async function POST(request: Request) {
  const parsed = checkInBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Format attendu: { checkIns: [...] }" }, { status: 400 });
  }
  return NextResponse.json(await recordCheckIns(parsed.data.checkIns));
}
