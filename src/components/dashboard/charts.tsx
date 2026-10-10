"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(25, 26, 24, 0.08)",
} as const;

const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

/** Non-breaking, so Recharts never wraps the unit onto a line of its own. */
function mad(n: number) {
  return `${n.toLocaleString("fr-FR")} MAD`;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

/**
 * Recharts animates by default and knows nothing of `prefers-reduced-motion`.
 * False on the server and during hydration, so the two renders agree.
 */
function useChartAnimation() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => !window.matchMedia?.(REDUCED_MOTION).matches,
    () => false,
  );
}

/** Shown instead of a chart with nothing on it. */
function ChartEmpty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <span className="text-muted-foreground [&_svg]:size-6">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-muted-foreground max-w-[28ch] text-[13px]">{detail}</p>
    </div>
  );
}

// ---- revenue, month by month --------------------------------------------------

export interface RevenueMonth {
  key: string;
  label: string;
  total: number;
  /** The month still running: drawn lighter, its total is not final. */
  current: boolean;
}

/**
 * Separate monthly totals, so bars rather than a line: a curve would draw a rise
 * through a month that had none. The running month is lighter and dashed.
 */
export function RevenueChart({ months, emptyIcon }: { months: RevenueMonth[]; emptyIcon: ReactNode }) {
  const animate = useChartAnimation();

  if (months.every((m) => m.total === 0)) {
    return (
      <ChartEmpty
        icon={emptyIcon}
        title="Aucun paiement pour l'instant"
        detail="Les revenus apparaîtront ici dès le premier abonnement enregistré."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={months} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={0} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={TICK}
          width={44}
          allowDecimals={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [mad(Number(value)), "Revenus"]}
          labelFormatter={(label, payload) =>
            payload?.[0]?.payload?.current ? `${label} · en cours` : String(label)
          }
        />
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={animate} animationDuration={700}>
          {months.map((m) => (
            <Cell
              key={m.key}
              fill="var(--chart-1)"
              fillOpacity={m.current ? 0.35 : 1}
              stroke={m.current ? "var(--chart-1)" : undefined}
              strokeDasharray={m.current ? "4 3" : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- today's traffic, hour by hour ---------------------------------------------

// Gym hours shown by default; any check-in outside them widens the range.
const OPEN_HOUR = 6;
const CLOSE_HOUR = 23;

/** Entries per hour today; the peak hour is the one bar drawn in full colour. */
export function TrafficChart({ byHour, emptyIcon }: { byHour: number[]; emptyIcon: ReactNode }) {
  const animate = useChartAnimation();
  const total = byHour.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <ChartEmpty
        icon={emptyIcon}
        title="Aucune entrée aujourd'hui"
        detail="Chaque passage à l'accueil s'ajoutera ici, heure par heure."
      />
    );
  }

  let first = OPEN_HOUR;
  let last = CLOSE_HOUR;
  byHour.forEach((n, h) => {
    if (n > 0) {
      first = Math.min(first, h);
      last = Math.max(last, h);
    }
  });
  const peak = byHour.indexOf(Math.max(...byHour));
  const data = Array.from({ length: last - first + 1 }, (_, i) => {
    const h = first + i;
    return { hour: h, label: `${h}h`, entries: byHour[h] };
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={TICK}
          interval={0}
          tickFormatter={(label: string, i: number) => (data[i] && data[i].hour % 3 === 0 ? label : "")}
        />
        <YAxis tickLine={false} axisLine={false} tick={TICK} allowDecimals={false} width={36} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [`${value} entrée${Number(value) > 1 ? "s" : ""}`, "Affluence"]}
          labelFormatter={(label) => `${label} – ${parseInt(String(label), 10) + 1}h`}
        />
        <Bar dataKey="entries" radius={[4, 4, 0, 0]} isAnimationActive={animate} animationDuration={700}>
          {data.map((d) => (
            <Cell key={d.hour} fill={d.hour === peak ? "var(--chart-1)" : "var(--chart-3)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- members by status -----------------------------------------------------------

export interface StatusSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * The numbers on the chart, not behind it: the total sits in the hole and each
 * status carries its own count in the legend, so nothing needs hovering.
 */
export function StatusDonut({ slices, emptyIcon }: { slices: StatusSlice[]; emptyIcon: ReactNode }) {
  const animate = useChartAnimation();
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <ChartEmpty icon={emptyIcon} title="Aucun membre" detail="Ajoutez votre premier membre pour voir la répartition." />
    );
  }

  const shown = slices.filter((s) => s.value > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={animate}
              animationDuration={800}
            >
              {shown.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="tnum text-2xl leading-none font-bold">{total}</p>
            <p className="text-muted-foreground mt-1 text-[11px]">membres</p>
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[13px]">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="tnum font-semibold">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- this month's takings, by payment method ------------------------------------

/** Lying down, so each method's name gets a line and its amount sits at the end of its bar. */
export function MethodBars({
  rows,
  emptyIcon,
}: {
  rows: { label: string; amount: number }[];
  emptyIcon: ReactNode;
}) {
  const animate = useChartAnimation();

  if (rows.every((r) => r.amount === 0)) {
    return (
      <ChartEmpty icon={emptyIcon} title="Rien d'encaissé ce mois-ci" detail="Les paiements du mois s'afficheront par mode." />
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={72} tickLine={false} axisLine={false} tick={TICK} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [mad(Number(value)), "Encaissé"]}
        />
        <Bar
          dataKey="amount"
          radius={[0, 6, 6, 0]}
          fill="var(--chart-1)"
          maxBarSize={22}
          isAnimationActive={animate}
          animationDuration={700}
        >
          <LabelList
            dataKey="amount"
            position="right"
            offset={8}
            formatter={(v) => mad(Number(v))}
            style={{ fontSize: 12, fontWeight: 600, fill: "var(--foreground)" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
