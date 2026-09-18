import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

// Read per request so the installed tablet app picks up a rebrand without a rebuild.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();

  return {
    name: `${brand.name} — Accueil`,
    short_name: "Accueil",
    description: "Écran d'accueil de la salle : entrées et abonnements",
    lang: "fr",
    start_url: "/checkin",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0d1013",
    theme_color: brand.primary,
    icons: [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
  };
}
