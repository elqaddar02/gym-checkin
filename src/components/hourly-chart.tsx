"use client";

import { useState } from "react";

// Gym hours shown by default; any check-in outside them widens the range.
const OPEN_HOUR = 6;
const CLOSE_HOUR = 23;

export function HourlyChart({ byHour }: { byHour: number[] }) {
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

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative flex h-40 items-end gap-0.5 border-b border-border" role="img" aria-label="Entrées par heure aujourd'hui">
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
              aria-label={`${h}h : ${n} entrée${n > 1 ? "s" : ""}`}
            >
              <div
                className="w-full rounded-t-[4px] bg-chart-2 transition-opacity group-hover:opacity-80"
                style={{ height: n > 0 ? `max(${pct}%, 3px)` : 0 }}
              />
              {hover === h && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md">
                  <span className="font-medium tabular-nums">{h}h–{h + 1}h</span> · {n} entrée{n > 1 ? "s" : ""}
                </div>
              )}
              {h === peak && n > 0 && hover === null && (
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs text-muted-foreground tabular-nums" style={{ bottom: `calc(${pct}% + 2px)` }}>
                  {n}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-0.5 text-[10px] text-muted-foreground tabular-nums">
        {hours.map((h) => (
          <span key={h} className="flex-1 text-center">{h % 3 === 0 ? `${h}h` : ""}</span>
        ))}
      </div>
    </figure>
  );
}
