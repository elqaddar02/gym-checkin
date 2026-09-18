"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Gym hours shown by default; any check-in outside them widens the range.
const OPEN_HOUR = 6;
const CLOSE_HOUR = 23;

/**
 * Entries per hour today. The peak hour is drawn in the gym's colour because it
 * is the one bar the owner acts on — staffing, classes, machine queues.
 */
export function TrafficChart({
  byHour,
  height = "h-24",
  showAxis = true,
}: {
  byHour: number[];
  height?: string;
  showAxis?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);

  let first = OPEN_HOUR;
  let last = CLOSE_HOUR;
  byHour.forEach((n, h) => {
    if (n > 0) {
      first = Math.min(first, h);
      last = Math.max(last, h);
    }
  });
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(1, ...byHour);
  const peak = byHour.indexOf(Math.max(...byHour));
  const total = byHour.reduce((a, b) => a + b, 0);

  return (
    <figure className="flex flex-col gap-1.5">
      <div
        className={cn("flex items-end gap-[3px]", height)}
        role="img"
        aria-label={
          total === 0
            ? "Aucune entrée aujourd'hui"
            : `Entrées par heure aujourd'hui, pic à ${peak} h avec ${byHour[peak]} entrées`
        }
      >
        {hours.map((h) => {
          const n = byHour[h];
          const pct = (n / max) * 100;
          return (
            <div
              key={h}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(h)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(h)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${h} h : ${n} entrée${n > 1 ? "s" : ""}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-opacity group-hover:opacity-75",
                  n > 0 && h === peak ? "bg-brand" : "bg-chart-3",
                )}
                style={{ height: n > 0 ? `max(${pct}%, 3px)` : 0 }}
              />
              {hover === h && (
                <div className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-md">
                  <span className="tnum font-semibold">
                    {h}h–{h + 1}h
                  </span>{" "}
                  · {n} entrée{n > 1 ? "s" : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showAxis && (
        <div className="tnum text-muted-foreground flex gap-[3px] text-[10px]">
          {hours.map((h) => (
            <span key={h} className="flex-1 text-center">
              {h % 3 === 0 ? `${h}h` : ""}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
