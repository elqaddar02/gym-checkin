"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/members", label: "Membres" },
  { href: "/checkin", label: "Accueil" },
];

export function OwnerNav({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <nav className="flex flex-1 flex-wrap gap-1" aria-label="Navigation">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted",
                pathname.startsWith(l.href) ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
          Déconnexion
        </Button>
      </div>
    </header>
  );
}
