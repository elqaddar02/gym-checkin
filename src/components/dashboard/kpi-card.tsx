import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";

export type KpiTone = "brand" | "ok" | "warn" | "stop" | "muted";

const TONES: Record<KpiTone, string> = {
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  stop: "bg-stop-soft text-stop-ink",
  muted: "bg-muted text-muted-foreground",
};

/** The card every dashboard panel sits on, so edges and shadows line up. */
export const cardClass =
  "rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(25,26,24,0.04),0_6px_20px_rgba(93,69,17,0.05)]";

/**
 * One headline figure: what it is, the number, and how it moved.
 * The icon is passed rendered, so the card stays a server component.
 */
export function KpiCard({
  label,
  value,
  unit,
  icon,
  tone = "brand",
  trend,
  support,
  href,
}: {
  label: string;
  value: number;
  unit?: string;
  icon: ReactNode;
  tone?: KpiTone;
  /** A pill before the support line: "+12 %", "−3". */
  trend?: { label: string; up: boolean } | null;
  support?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className={cn("grid size-10 place-items-center rounded-lg [&_svg]:size-5", TONES[tone])}>{icon}</span>
        {href && (
          <ArrowUpRight
            aria-hidden
            className="text-muted-foreground group-hover:text-brand-ink size-4 transition-colors"
          />
        )}
      </div>
      <p className="text-muted-foreground mt-4 text-[13px] font-medium">{label}</p>
      <p className="tnum mt-1 text-3xl leading-tight font-bold">
        <CountUp value={value} />
        {unit && <span className="text-muted-foreground ml-1.5 text-base font-semibold">{unit}</span>}
      </p>
      <div className="text-muted-foreground mt-2 flex min-w-0 items-center gap-2 text-xs">
        {trend && (
          <span
            className={cn(
              "tnum inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
              trend.up ? "bg-ok-soft text-ok-ink" : "bg-stop-soft text-stop-ink",
            )}
          >
            {trend.up ? <TrendingUp aria-hidden className="size-3" /> : <TrendingDown aria-hidden className="size-3" />}
            {trend.label}
          </span>
        )}
        {support && <span className="truncate">{support}</span>}
      </div>
    </>
  );

  const className = cn(cardClass, "group block p-5 transition-shadow");

  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "hover:shadow-[0_2px_4px_rgba(25,26,24,0.05),0_14px_32px_rgba(93,69,17,0.1)] focus-visible:outline-2",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A panel with a title and a one-line description above its content. */
export function ChartCard({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(cardClass, "flex min-w-0 flex-col p-5", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-muted-foreground mt-0.5 text-[13px]">{description}</p>}
        </div>
        {aside && <div className="text-muted-foreground shrink-0 text-xs">{aside}</div>}
      </header>
      {children}
    </section>
  );
}
