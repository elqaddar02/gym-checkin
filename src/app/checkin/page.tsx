import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { CheckinScreen } from "./checkin-screen";

export const metadata: Metadata = {
  title: "Accueil — Entrées",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
};

// Static shell: all data comes from the tablet's cache / API, so the page works offline.
export default function CheckinPage() {
  return (
    <>
      <ServiceWorkerRegistration />
      <CheckinScreen />
    </>
  );
}
