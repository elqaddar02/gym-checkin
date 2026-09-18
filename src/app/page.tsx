import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";

export default async function Home() {
  // Owner's desk: go to dashboard if signed in, otherwise login.
  // Reception tablet stays on /checkin with a direct link in the kiosk screen.
  const owner = await getOwnerSession();
  redirect(owner ? "/dashboard" : "/login");
}
