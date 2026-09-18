import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { getBrand } from "@/lib/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion propriétaire" };

export default async function LoginPage() {
  const brand = await getBrand();

  return (
    <main className="bg-background flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandMark brand={brand} size="lg" />
        <div>
          <h1 className="text-2xl font-semibold uppercase">{brand.name}</h1>
          {brand.city && (
            <p className="text-muted-foreground text-xs tracking-wider uppercase">{brand.city}</p>
          )}
        </div>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-muted-foreground max-w-xs text-center text-xs">
        Cet espace est réservé au propriétaire. L&apos;écran d&apos;accueil de la réception
        n&apos;a pas besoin de connexion.
      </p>
    </main>
  );
}
