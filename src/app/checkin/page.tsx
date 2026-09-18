import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { getBrand } from "@/lib/brand";
import { CheckinScreen } from "./checkin-screen";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: `${brand.name} — Accueil`, manifest: "/manifest.webmanifest" };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrand();
  // The tablet's browser chrome takes the gym's colour too.
  return { themeColor: brand.primary };
}

// The shell is static apart from the gym's identity: every entry and every status
// comes from the tablet's own cache, so the screen keeps working offline.
export default async function CheckinPage() {
  const { name, city, logoUrl, initials } = await getBrand();

  return (
    <>
      <ServiceWorkerRegistration />
      <CheckinScreen brand={{ name, city, logoUrl, initials }} />
    </>
  );
}
