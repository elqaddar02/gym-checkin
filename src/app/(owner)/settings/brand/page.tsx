import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { BrandForm } from "./brand-form";

export const metadata: Metadata = { title: "Identité & couleurs" };

export default async function BrandSettingsPage() {
  const brand = await getBrand();

  return (
    <>
      <header>
        <h1 className="text-[26px] font-semibold uppercase">Identité &amp; couleurs</h1>
        <p className="text-muted-foreground text-[13px]">
          Le nom, le logo et les couleurs de la salle. Ils s&apos;appliquent à l&apos;écran
          d&apos;accueil, au tableau de bord et à la page de connexion.
        </p>
      </header>
      <BrandForm brand={brand} />
    </>
  );
}
