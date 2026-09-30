import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A panel on a page built from modules. Everything a screen shows sits in one of
 * these, so the edges, padding and heading line up from one module to the next.
 */
export function Module({
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** Right-hand slot on the title row: a link, a count, a unit. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-lg border border-border/80 bg-card p-4 shadow-[0_3px_12px_rgba(93,69,17,0.035)] sm:p-5", className)}>
      {(title || aside) && (
        <header className="flex items-baseline justify-between gap-3">
          {title && <h2 className="text-base font-semibold leading-snug">{title}</h2>}
          {aside && <div className="text-muted-foreground shrink-0 text-xs">{aside}</div>}
        </header>
      )}
      <div className={cn("flex min-w-0 flex-col gap-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A number the module exists to show, with its caption above it. */
export function StatTile({
  label,
  value,
  unit,
  detail,
  accent = false,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  /** The one figure that leads the page. */
  accent?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-border/80 bg-card p-4 shadow-[0_3px_12px_rgba(93,69,17,0.035)] sm:p-5",
        accent && "border-brand-line shadow-[0_5px_18px_color-mix(in_oklab,var(--brand)_10%,transparent)]",
        className,
      )}
    >
      <span className="eyebrow">{label}</span>
      <span className="tnum text-[32px] leading-none font-bold tracking-normal">
        {value}
        {unit && <small className="text-muted-foreground ml-1 text-[15px] font-semibold">{unit}</small>}
      </span>
      {detail && <span className="text-muted-foreground text-[12.5px]">{detail}</span>}
      {children}
    </div>
  );
}
