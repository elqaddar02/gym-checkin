import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFullDate, formatTime, localDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { listMembers } from "@/lib/queries";

export const metadata: Metadata = { title: "Membres" };

function formatLastCheckIn(iso: string | null) {
  if (!iso) return "—";
  return `${formatFullDate(localDate(iso))} ${formatTime(iso)}`;
}

export default async function MembersPage(props: PageProps<"/members">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";
  const members = await listMembers(query);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Membres <span className="text-muted-foreground">({members.length})</span></h1>
        <Button asChild>
          <Link href="/members/new">+ Ajouter un membre</Link>
        </Button>
      </div>

      <form className="flex gap-2" action="/members">
        <Input name="q" defaultValue={query} placeholder="Rechercher par nom ou téléphone" className="h-10 max-w-md bg-background" type="search" />
        <Button type="submit" variant="outline" className="h-10">Rechercher</Button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière entrée</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {query ? "Aucun membre trouvé." : "Aucun membre. Ajoutez le premier."}
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <Link href={`/members/${m.id}`} className="hover:underline">{m.name}</Link>
                  {m.notes && <div className="max-w-xs truncate text-xs text-muted-foreground">{m.notes}</div>}
                </TableCell>
                <TableCell className="tabular-nums">{formatPhone(m.phone)}</TableCell>
                <TableCell><StatusBadge status={m.status} /></TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatLastCheckIn(m.lastCheckInAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/members/${m.id}?renew=1`}>Renouveler</Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/members/${m.id}`}>Modifier</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
