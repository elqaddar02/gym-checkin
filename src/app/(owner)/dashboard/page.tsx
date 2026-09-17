import type { Metadata } from "next";
import Link from "next/link";
import { HourlyChart } from "@/components/hourly-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayMonth, formatTime, localDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { getDashboard } from "@/lib/queries";
import { OVERRIDE_LABELS, PAYMENT_LABELS, type PaymentMethod } from "@/lib/types";

export const metadata: Metadata = { title: "Tableau de bord" };

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function mad(n: number) {
  return `${n.toLocaleString("fr-FR")} MAD`;
}

export default async function DashboardPage() {
  const d = await getDashboard();
  const monthLabel = `${MONTHS[Number(d.month.slice(5, 7)) - 1]} ${d.month.slice(0, 4)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><a href="/api/export?type=members">Export CSV membres</a></Button>
          <Button asChild variant="outline" size="sm"><a href="/api/export?type=checkins">Export CSV entrées</a></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Revenus — {monthLabel}</CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">{mad(d.revenue.total)}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <div key={m} className="rounded-lg bg-muted/60 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{PAYMENT_LABELS[m]}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{mad(d.revenue.byMethod[m])}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">{d.revenue.count} paiement{d.revenue.count > 1 ? "s" : ""} dont la période commence ce mois-ci.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Membres actifs</CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">{d.activeMembers}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">sur {d.totalMembers} membres</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Entrées aujourd&apos;hui</CardDescription>
            <CardTitle className="text-4xl font-bold tabular-nums">{d.checkInsToday.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <HourlyChart byHour={d.checkInsToday.byHour} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expirent dans 7 jours</CardTitle>
            <CardDescription>{d.expiringSoon.length === 0 ? "Aucun" : `${d.expiringSoon.length} membre${d.expiringSoon.length > 1 ? "s" : ""}`}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {d.expiringSoon.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatPhone(m.phone)} · {m.daysLeft === 0 ? "expire aujourd'hui" : `le ${formatDayMonth(m.until)} (J-${m.daysLeft})`}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button asChild size="sm" variant="outline"><Link href={`/members/${m.id}?renew=1`}>Renouveler</Link></Button>
                    <Button asChild size="sm" variant="ghost"><Link href={`/members/${m.id}`}>Modifier</Link></Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Entrées récentes</CardTitle></CardHeader>
        <CardContent>
          {d.recentCheckIns.length === 0 ? (
            <p className="text-muted-foreground">Aucune entrée.</p>
          ) : (
            <ul className="divide-y">
              {d.recentCheckIns.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2 text-sm">
                  <span>
                    <span className="text-muted-foreground tabular-nums">{formatDayMonth(localDate(c.checkedInAt))} {formatTime(c.checkedInAt)}</span>{" "}
                    <Link href={`/members/${c.memberId}`} className="font-medium hover:underline">{c.name}</Link>
                  </span>
                  {c.overrideReason && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900 dark:bg-red-950 dark:text-red-100">
                      Accès exceptionnel · {OVERRIDE_LABELS[c.overrideReason]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
