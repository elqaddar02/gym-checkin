"use client";

import { LayoutDashboard, LogOut, Palette, ScanLine, Users } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import type { Brand } from "@/lib/brand-format";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    group: null,
    links: [
      { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/checkin", label: "Accueil / entrées", icon: ScanLine },
    ],
  },
  {
    group: "Gestion",
    links: [{ href: "/members", label: "Membres", icon: Users }],
  },
  {
    group: "Salle",
    links: [{ href: "/settings/brand", label: "Identité & couleurs", icon: Palette }],
  },
] as const;

export function OwnerShell({
  brand,
  email,
  children,
}: {
  brand: Pick<Brand, "name" | "city" | "logoUrl" | "initials">;
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isOn = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="bg-background flex min-h-dvh flex-col md:flex-row">
      <aside className="bg-sidebar flex shrink-0 flex-col gap-4 border-b p-3 md:w-56 md:border-r md:border-b-0 md:p-3">
        <div className="flex items-center gap-2.5 px-1 py-0.5">
          <BrandMark brand={brand} size="sm" />
          <span className="min-w-0">
            <span className="font-display block truncate text-[17px] leading-tight font-semibold uppercase">
              {brand.name}
            </span>
            {brand.city && (
              <span className="text-muted-foreground block truncate text-[11px] tracking-wider uppercase">
                {brand.city}
              </span>
            )}
          </span>
        </div>

        <nav
          className="-mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible"
          aria-label="Navigation"
        >
          {SECTIONS.map((section) => (
            <div key={section.group ?? "main"} className="contents md:block">
              {section.group && (
                <span className="eyebrow mt-3 hidden px-2.5 pb-1 md:block">{section.group}</span>
              )}
              <span className="contents md:flex md:flex-col md:gap-0.5">
                {section.links.map((link) => {
                  const Icon = link.icon;
                  const on = isOn(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                        on
                          ? "bg-accent text-foreground shadow-[inset_2px_0_0_var(--brand)] font-semibold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon aria-hidden className="size-4 shrink-0 opacity-80" />
                      {link.label}
                    </Link>
                  );
                })}
              </span>
            </div>
          ))}
        </nav>

        <div className="mt-auto hidden border-t pt-3 md:block">
          <p className="text-muted-foreground truncate text-xs" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-muted-foreground hover:text-foreground mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium"
          >
            <LogOut aria-hidden className="size-3.5" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">{children}</div>
      </main>
    </div>
  );
}
