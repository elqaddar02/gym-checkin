import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { brandVars, getBrand } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * The gym's identity is read per request, so changing a logo or a colour shows up
 * on the next page load instead of waiting for a rebuild.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: brand.name, template: `%s · ${brand.name}` },
    description: "Entrées et abonnements de la salle",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const brand = await getBrand();

  return (
    <html
      lang="fr"
      // The gym's identity, injected once. Every colour below is mixed from these.
      style={brandVars(brand) as React.CSSProperties}
      className={`${inter.variable} world-console h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
