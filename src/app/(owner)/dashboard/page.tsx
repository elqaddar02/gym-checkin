import { Banknote, CreditCard, FileDown, ArrowRightLeft, Plus, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Module, StatTile } from "@/components/module";
import { TrafficChart } from "@/components/traffic-chart";
import { Button } from "@/components/ui/button";
import { formatDayMonth, formatFullDate, formatTime, localDate, todayYmd } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { getDashboard, type ActivityEntry } from "@/lib/queries";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const METHOD_ICONS = { cash: Banknote, card: CreditCard, transfer: ArrowRightLeft } as const;

const ACTIVITY_TAGS: Record<ActivityEntry["kind"], { label: string; className: string }> = {
  checkin: { label: "Entrée", className: "bg-ok-soft text-ok-ink" },
  override: { label: "Accès exceptionnel", className: "bg-stop-soft text-stop-ink" },
  payment: { label: "Paiement", className: "bg-brand-soft text-brand-ink" },
  member: { label: "Nouveau membre", className: "bg-muted text-muted-foreground" },
};

function mad(n: number) {
  return n.toLocaleString("fr-FR");
}

/** "+12 %" against last month, or nothing when there is no basis to compare. */
function trend(current: number, previous: number) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, up: pct >= 0, label: `${pct >= 0 ? "+" : ""}${pct} %` };
}

export default async function DashboardPage() {
  const d = await getDashboard();
  const today = todayYmd();
  const monthLabel = `${MONTHS[Number(d.month.slice(5, 7)) - 1]} ${d.month.slice(0, 4)}`;
  const weekday = DAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];

  const revenueTrend = trend(d.revenue.total, d.revenue.previousTotal);
  const entriesTrend = d.checkInsToday.total - d.checkInsToday.lastWeek;
  const maxMethod = Math.max(1, ...Object.values(d.revenue.byMethod));
  const toRecover = d.expiringSoon.reduce((sum, m) => sum + m.amount, 0);
  const activeShare = d.members.total > 0 ? Math.round((d.members.active / d.members.total) * 100) : 0;
  const peakHour = d.checkInsToday.byHour.indexOf(Math.max(...d.checkInsToday.byHour));

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold uppercase">Tableau de bord</h1>
          <p className="text-muted-foreground text-[13px]">
            {weekday} {formatFullDate(today)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/export?type=members">
              <FileDown aria-hidden className="size-4" />
              Membres
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/export?type=checkins">
              <FileDown aria-hidden className="size-4" />
              Entrées
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/members/new">
              <Plus aria-hidden className="size-4" />
              Membre
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          accent
          label={`Revenus · ${monthLabel}`}
          value={mad(d.revenue.total)}
          unit="MAD"
          detail={
            <>
              {revenueTrend && (
                <b className={cn("font-semibold", revenueTrend.up ? "text-ok-ink" : "text-stop-ink")}>
                  {revenueTrend.label}
                </b>
              )}
              {revenueTrend && " vs mois dernier · "}
              {d.revenue.count} paiement{d.revenue.count > 1 ? "s" : ""}
            </>
          }
        />
        <StatTile
          label="Membres actifs"
          value={d.members.active}
          unit={`/ ${d.members.total}`}
          detail={`${activeShare} % de la base`}
        />
        <StatTile
          label="Entrées aujourd'hui"
          value={d.checkInsToday.total}
          detail={
            d.checkInsToday.lastWeek > 0 ? (
              <>
                <b className={cn("font-semibold", entriesTrend >= 0 ? "text-ok-ink" : "text-stop-ink")}>
                  {entriesTrend >= 0 ? "+" : ""}
                  {entriesTrend}
                </b>{" "}
                vs {weekday} dernier
              </>
            ) : (
              "Première mesure de la semaine"
            )
          }
        />
        <StatTile
          label="Expirent sous 7 j"
          value={d.expiringSoon.length}
          detail={
            toRecover > 0 ? (
              <>
                <b className="text-warn-ink font-semibold">{mad(toRecover)} MAD</b> à relancer
              </>
            ) : (
              "Rien à relancer"
            )
          }
        />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Module title="Encaissements" aside={monthLabel}>
          <dl className="flex flex-col gap-2.5">
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => {
              const Icon = METHOD_ICONS[m];
              const amount = d.revenue.byMethod[m];
              return (
                <div key={m} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 text-[13.5px]">
                  <dt className="text-muted-foreground flex items-center gap-1.5">
                    <Icon aria-hidden className="size-3.5" />
                    {PAYMENT_LABELS[m]}
                  </dt>
                  <span aria-hidden className="bg-muted h-2 overflow-hidden rounded-full">
                    <span
                      className="bg-brand block h-full rounded-full"
                      style={{ width: `${(amount / maxMethod) * 100}%` }}
                    />
                  </span>
                  <dd className="tnum text-right font-semibold">{mad(amount)}</dd>
                </div>
              );
            })}
          </dl>
          <p className="text-muted-foreground text-xs">
            Paiements dont la période commence en {MONTHS[Number(d.month.slice(5, 7)) - 1]}.
          </p>
        </Module>

        <Module
          title="Affluence du jour"
          aside={
            d.checkInsToday.total > 0 ? (
              <span className="tnum">
                Pic {peakHour}h · {d.checkInsToday.byHour[peakHour]}
              </span>
            ) : null
          }
        >
          <TrafficChart byHour={d.checkInsToday.byHour} />
        </Module>

        <Module
          title="À relancer"
          aside={
            d.expiringSoon.length > 0 ? <Link href="/members?filter=expiring" className="text-brand-ink font-semibold">Voir les {d.expiringSoon.length}</Link> : null
          }
        >
          {d.expiringSoon.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Aucun abonnement n&apos;expire cette semaine.
            </p>
          ) : (
            <ul className="flex flex-col">
              {d.expiringSoon.slice(0, 5).map((m) => (
                <li key={m.id} className="flex items-center gap-2 border-t py-2 first:border-t-0 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/members/${m.id}`} className="block truncate text-sm font-semibold hover:underline">
                      {m.name}
                    </Link>
                    <span className="tnum text-muted-foreground block text-xs">{formatPhone(m.phone)}</span>
                  </div>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
                      m.daysLeft <= 1 ? "bg-stop-soft text-stop-ink" : "bg-warn-soft text-warn-ink",
                    )}
                  >
                    {m.daysLeft === 0 ? "aujourd'hui" : m.daysLeft === 1 ? "demain" : `J-${m.daysLeft} · ${formatDayMonth(m.until)}`}
                  </span>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href={`/members/${m.id}?renew=1`}>Renouveler</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Module>
      </div>

      <Module
        title="Activité"
        aside={<span>Entrées, paiements et inscriptions</span>}
        bodyClassName="gap-0"
      >
        {d.activity.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Rien encore. L&apos;activité apparaîtra ici dès la première entrée.
          </p>
        ) : (
          <ul className="flex flex-col">
            {d.activity.map((a) => {
              const tag = ACTIVITY_TAGS[a.kind];
              const day = localDate(a.at);
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 border-t py-2.5 first:border-t-0 first:pt-0 sm:grid-cols-[76px_minmax(0,1fr)_150px_minmax(0,1.3fr)] sm:items-center"
                >
                  <span className="tnum text-muted-foreground text-xs">
                    {day === today ? formatTime(a.at) : `${formatDayMonth(day)} ${formatTime(a.at)}`}
                  </span>
                  <Link href={`/members/${a.memberId}`} className="truncate text-sm font-semibold hover:underline">
                    {a.name}
                  </Link>
                  <span className={cn("col-start-2 justify-self-start rounded-md px-2 py-0.5 text-[11.5px] font-semibold sm:col-start-auto", tag.className)}>
                    {tag.label}
                  </span>
                  <span className="text-muted-foreground col-start-2 truncate text-xs sm:col-start-auto">{a.detail}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Module>

      {d.members.total === 0 && (
        <Module title="Premiers pas">
          <p className="text-muted-foreground text-sm">
            La salle n&apos;a pas encore de membres. Ajoutez le premier, puis ouvrez l&apos;écran
            d&apos;accueil sur la tablette de la réception.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/members/new">
                <UserPlus aria-hidden className="size-4" />
                Ajouter un membre
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/brand">Personnaliser l&apos;identité de la salle</Link>
            </Button>
          </div>
        </Module>
      )}
    </>
  );
}
