import type { Metadata } from "next";
import { getOwnerSession } from "@/lib/auth";
import { getDashboard } from "@/lib/queries";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const [d, owner] = await Promise.all([getDashboard(), getOwnerSession()]);
  return <DashboardView d={d} ownerName={owner?.username ?? null} />;
}
