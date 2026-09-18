import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Module } from "@/components/module";
import { Runway } from "@/components/runway";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayMonth, formatTime, localDate, todayYmd } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { listMembers, type MemberRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Membres" };

const FILTERS = {
  all: { label: "Tous", match: () => true },
  active: { label: "Actifs", match: (m: MemberRow) => m.status.kind === "active" },
  expiring: {
    label: "Expirent sous 7 j",
    match: (m: MemberRow) => m.status.kind === "active" && m.status.daysLeft <= 7,
  },
  expired: { label: "Expirés", match: (m: MemberRow) => m.status.kind === "expired" },
  paused: { label: "En pause", match: (m: MemberRow) => m.status.kind === "paused" },
} as const;

type FilterKey = keyof typeof FILTERS;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function lastCheckIn(iso: string | null, today: string) {
  if (!iso) return "Jamais";
  const day = localDate(iso);
  return day === today ? `Aujourd'hui ${formatTime(iso)}` : `${formatDayMonth(day)} ${formatTime(iso)}`;
}

export default async function MembersPage(props: PageProps<"/members">) {
  const { q, filter } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const active: FilterKey = typeof filter === "string" && filter in FILTERS ? (filter as FilterKey) : "all";

  const all = await listMembers(query);
  const today = todayYmd();
  const members = all.filter(FILTERS[active].match);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold uppercase">Membres</h1>
          <p className="text-muted-foreground tnum text-[13px]">
            {all.length} membre{all.length > 1 ? "s" : ""}
            {query && " correspondant à la recherche"}
          </p>
        </div>
        <Button asChild>
          <Link href="/members/new">
            <Plus aria-hidden className="size-4" />
            Ajouter un membre
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex min-w-[220px] flex-1 gap-2" action="/members">
          {active !== "all" && <input type="hidden" name="filter" value={active} />}
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Nom ou téléphone…"
              className="bg-card h-9 pl-9"
            />
          </div>
          <Button type="submit" variant="outline" className="h-9">
            Rechercher
          </Button>
        </form>

        <nav className="flex flex-wrap gap-1.5" aria-label="Filtrer par statut">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => {
            const count = all.filter(FILTERS[key].match).length;
            const on = key === active;
            return (
              <Link
                key={key}
                href={{ pathname: "/members", query: { ...(query ? { q: query } : {}), ...(key === "all" ? {} : { filter: key }) } }}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                  on
                    ? "border-brand-line bg-brand-soft text-foreground font-semibold"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTERS[key].label} <span className="tnum opacity-70">{count}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <Module bodyClassName="gap-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membre</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="min-w-[140px]">Reste</TableHead>
                <TableHead>Dernière entrée</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                    {query
                      ? "Aucun membre ne correspond à cette recherche."
                      : active === "all"
                        ? "Aucun membre. Ajoutez le premier."
                        : `Aucun membre dans « ${FILTERS[active].label} ».`}
                  </TableCell>
                </TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="bg-brand-soft text-brand-ink font-display grid size-8 shrink-0 place-items-center rounded-[9px] text-[13px] font-bold"
                      >
                        {initials(m.name)}
                      </span>
                      <span className="min-w-0">
                        <Link href={`/members/${m.id}`} className="block font-semibold hover:underline">
                          {m.name}
                        </Link>
                        {m.notes && (
                          <span className="text-muted-foreground block max-w-[22ch] truncate text-xs">{m.notes}</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tnum">{formatPhone(m.phone)}</TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} size="sm" short />
                  </TableCell>
                  <TableCell>
                    <Runway status={m.status} />
                  </TableCell>
                  <TableCell className="tnum text-muted-foreground text-xs">
                    {lastCheckIn(m.lastCheckInAt, today)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      size="sm"
                      variant={m.status.kind === "active" && m.status.daysLeft > 7 ? "outline" : "default"}
                    >
                      <Link href={`/members/${m.id}?renew=1`}>Renouveler</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Module>
    </>
  );
}
