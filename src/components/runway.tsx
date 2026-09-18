import { cn } from "@/lib/utils";
import { statusTone, type MemberStatus } from "@/lib/status";

/** A full bar is a month of membership left; past due runs the other way. */
const FULL_DAYS = 30;

/**
 * How much membership is left, as a bar. Reading a date tells you when; reading
 * this tells you who to call first.
 */
export function Runway({ status, className }: { status: MemberStatus; className?: string }) {
  const TONES = { ok: "bg-ok", warn: "bg-warn", stop: "bg-stop", muted: "bg-muted-foreground" } as const;
  const tone = TONES[statusTone(status)];

  let width = 0;
  let label = "—";

  if (status.kind === "active") {
    width = Math.max(4, Math.min(100, (status.daysLeft / FULL_DAYS) * 100));
    label = `${status.daysLeft} j`;
  } else if (status.kind === "expired") {
    width = 100;
    label = `−${status.days} j`;
  } else if (status.kind === "paused") {
    width = 55;
    label = "pause";
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="bg-muted h-1.5 min-w-11 flex-1 overflow-hidden rounded-full">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${width}%` }} />
      </span>
      <span className="tnum text-muted-foreground min-w-11 text-xs">{label}</span>
    </div>
  );
}
