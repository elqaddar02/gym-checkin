import {
  Banknote,
  CalendarClock,
  ChartColumn,
  ChevronRight,
  Clock,
  FileDown,
  LogIn,
  Plus,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { MethodBars, RevenueChart, StatusDonut, TrafficChart } from "@/components/dashboard/charts";
import { ChartCard, KpiCard, cardClass } from "@/components/dashboard/kpi-card";
import { Button } from "@/components/ui/button";
import { formatDayMonth, formatFullDate, formatTime, localDate, todayYmd } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import type { ActivityEntry, DashboardData } from "@/lib/queries";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const MONTHS_SHORT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const ACTIVITY: Record<ActivityEntry["kind"], { icon: typeof LogIn; className: string }> = {
  checkin: { icon: LogIn, className: "bg-ok-soft text-ok-ink" },
  override: { icon: ShieldAlert, className: "bg-stop-soft text-stop-ink" },
  payment: { icon: Banknote, className: "bg-brand-soft text-brand-ink" },
  member: { icon: UserPlus, className: "bg-muted text-muted-foreground" },
};

function mad(n: number) {
  return n.toLocaleString("fr-FR");
}

function monthName(yyyyMm: string) {
  return MONTHS[Number(yyyyMm.slice(5, 7)) - 1];
}

/** "+12 %" against last month, or nothing when there is no basis to compare. */
function percentTrend(current: number, previous: number) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { up: pct >= 0, label: `${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %` };
}

/** The dashboard drawn from its figures; the page fetches them. */
export function DashboardView({ d, ownerName }: { d: DashboardData; ownerName: string | null }) {
  const today = todayYmd();
  const weekday = DAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
  const previousMonth = d.revenueByMonth.at(-2)?.month;

  const revenueTrend = percentTrend(d.revenue.total, d.revenue.previousTotal);
  const entriesDiff = d.checkInsToday.total - d.checkInsToday.lastWeek;
  const toRecover = d.expiringSoon.reduce((sum, m) => sum + m.amount, 0);
  const activeShare = d.members.total > 0 ? Math.round((d.members.active / d.members.total) * 100) : 0;
  const peakHour = d.checkInsToday.byHour.indexOf(Math.max(...d.checkInsToday.byHour));

  const months = d.revenueByMonth.map((m, i, all) => ({
    key: m.month,
    label: MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1],
    total: m.total,
    current: i === all.length - 1,
  }));
  const sixMonthTotal = d.revenueByMonth.reduce((sum, m) => sum + m.total, 0);

  const statusSlices = [
    { key: "active", label: "Actifs", value: d.members.active, color: "var(--ok)" },
    { key: "expired", label: "Expirés", value: d.members.expired, color: "var(--stop)" },
    { key: "paused", label: "En pause", value: d.members.paused, color: "var(--warn)" },
    { key: "none", label: "Sans abonnement", value: d.members.none, color: "var(--chart-5)" },
  ];

  const methodRows = (Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => ({
    label: PAYMENT_LABELS[m],
    amount: d.revenue.byMethod[m],
  }));

  return (
    <>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Bonjour{ownerName ? `, ${ownerName}` : ""}</h1>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
            <span className="capitalize">{weekday}</span> {formatFullDate(today)} · voici ce qui se passe dans votre
            salle.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap items-center gap-2" action="/api/export" method="get">
            <label className="sr-only" htmlFor="export-type">Type d’export</label>
            <select id="export-type" name="type" defaultValue="members" className="bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm">
              <option value="members">Membres</option>
              <option value="checkins">Entrées</option>
            </select>
            <label className="sr-only" htmlFor="export-format">Format</label>
            <select id="export-format" name="format" defaultValue="pdf" className="bg-card border-border text-foreground h-9 rounded-md border px-2 text-sm">
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
            </select>
            <Button type="submit" variant="outline" size="sm">
              <FileDown aria-hidden className="size-4" />
              Télécharger
            </Button>
          </form>
          <Button asChild size="sm">
            <Link href="/members/new">
              <Plus aria-hidden className="size-4" />
              Membre
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={`Revenus · ${monthName(d.month)}`}
          value={d.revenue.total}
          unit="MAD"
          icon={<Wallet />}
          trend={revenueTrend}
          support={
            revenueTrend && previousMonth
              ? `vs ${monthName(previousMonth)}`
              : `${d.revenue.count} paiement${d.revenue.count > 1 ? "s" : ""}`
          }
        />
        <KpiCard
          label="Membres actifs"
          value={d.members.active}
          unit={`/ ${d.members.total}`}
          icon={<Users />}
          tone="ok"
          support={`${activeShare} % de vos membres`}
          href="/members"
        />
        <KpiCard
          label="Entrées aujourd'hui"
          value={d.checkInsToday.total}
          icon={<LogIn />}
          tone="muted"
          trend={
            d.checkInsToday.lastWeek > 0
              ? { up: entriesDiff >= 0, label: `${entriesDiff >= 0 ? "+" : "−"}${Math.abs(entriesDiff)}` }
              : null
          }
          support={d.checkInsToday.lastWeek > 0 ? `vs ${weekday} dernier` : "Aucune entrée il y a une semaine"}
        />
        <KpiCard
          label="Expirent sous 7 jours"
          value={d.expiringSoon.length}
          icon={<CalendarClock />}
          tone={d.expiringSoon.length > 0 ? "warn" : "muted"}
          support={toRecover > 0 ? `${mad(toRecover)} MAD à renouveler` : "Rien à renouveler"}
          href="/members?filter=expiring"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenus des 6 derniers mois"
          description="Par mois de début d'abonnement · le mois en cours est en pointillés."
          aside={sixMonthTotal > 0 ? <span className="tnum font-semibold">{mad(sixMonthTotal)} MAD</span> : null}
        >
          <div className="h-[240px]">
            <RevenueChart months={months} emptyIcon={<ChartColumn />} />
          </div>
        </ChartCard>

        <ChartCard title="Statut des membres" description="Selon l'abonnement en cours de chacun.">
          <div className="h-[240px]">
            <StatusDonut slices={statusSlices} emptyIcon={<Users />} />
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Affluence du jour"
          description={
            d.checkInsToday.total > 0
              ? `Pic à ${peakHour}h avec ${d.checkInsToday.byHour[peakHour]} entrée${d.checkInsToday.byHour[peakHour] > 1 ? "s" : ""}.`
              : "Entrées par heure, aujourd'hui."
          }
        >
          <div className="h-[200px]">
            <TrafficChart byHour={d.checkInsToday.byHour} emptyIcon={<Clock />} />
          </div>
        </ChartCard>

        <ChartCard title="Encaissements" description={`Par mode de paiement, en ${monthName(d.month)}.`}>
          <div className="h-[200px]">
            <MethodBars rows={methodRows} emptyIcon={<Banknote />} />
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title="À renouveler"
          description="Abonnements qui se terminent dans les 7 prochains jours."
          aside={
            d.expiringSoon.length > 5 ? (
              <Link href="/members?filter=expiring" className="text-brand-ink font-semibold hover:underline">
                Voir les {d.expiringSoon.length}
              </Link>
            ) : null
          }
        >
          {d.expiringSoon.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              Aucun abonnement n&apos;expire cette semaine.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {d.expiringSoon.slice(0, 5).map((m) => {
                const urgent = m.daysLeft <= 1;
                return (
                  <li key={m.id}>
                    <Link
                      href={`/members/${m.id}?renew=1`}
                      className="hover:bg-brand-soft/60 hover:border-brand-line group flex items-center gap-3 rounded-lg border p-3 transition-colors"
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg",
                          urgent ? "bg-stop-soft text-stop-ink" : "bg-warn-soft text-warn-ink",
                        )}
                      >
                        <CalendarClock aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{m.name}</span>
                        <span className="tnum text-muted-foreground block truncate text-xs">
                          {formatPhone(m.phone)}
                          {m.amount > 0 && ` · ${mad(m.amount)} MAD`}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "tnum shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          urgent ? "bg-stop-soft text-stop-ink" : "bg-warn-soft text-warn-ink",
                        )}
                      >
                        {m.daysLeft === 0
                          ? "Aujourd'hui"
                          : m.daysLeft === 1
                            ? "Demain"
                            : `${formatDayMonth(m.until)} · J-${m.daysLeft}`}
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Activité récente" description="Entrées, paiements et inscriptions.">
          {d.activity.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              Rien encore. L&apos;activité apparaîtra ici dès la première entrée.
            </p>
          ) : (
            <ul className="flex flex-col">
              {d.activity.slice(0, 8).map((a) => {
                const { icon: Icon, className } = ACTIVITY[a.kind];
                const day = localDate(a.at);
                return (
                  <li key={a.id} className="flex items-center gap-3 border-t py-2.5 first:border-t-0 first:pt-0">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", className)}>
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/members/${a.memberId}`} className="block truncate text-sm font-semibold hover:underline">
                        {a.name}
                      </Link>
                      <span className="text-muted-foreground block truncate text-xs">{a.detail}</span>
                    </span>
                    <span className="tnum text-muted-foreground shrink-0 text-xs">
                      {day === today ? formatTime(a.at) : `${formatDayMonth(day)} · ${formatTime(a.at)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>

      {d.members.total === 0 && (
        <section className={cn(cardClass, "flex flex-col gap-3 p-5")}>
          <h2 className="text-base font-semibold">Premiers pas</h2>
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
        </section>
      )}
    </>
  );
}
