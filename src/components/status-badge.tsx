import { cn } from "@/lib/utils";
import { statusLabel, statusShort, statusTone, type MemberStatus, type StatusTone } from "@/lib/status";

// The gym's own colour never means a status: a red gym still needs a red refusal.
const STYLES: Record<StatusTone, string> = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  stop: "bg-stop-soft text-stop-ink",
  muted: "bg-muted text-muted-foreground",
};

const DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  stop: "bg-stop",
  muted: "bg-muted-foreground",
};

export function StatusBadge({
  status,
  size = "md",
  short = false,
  className,
}: {
  status: MemberStatus;
  size?: "sm" | "md" | "lg";
  /** One word instead of the full sentence — for table cells and dense lists. */
  short?: boolean;
  className?: string;
}) {
  const tone = statusTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap",
        size === "lg" ? "px-4 py-1.5 text-lg" : size === "sm" ? "px-2 py-0.5 text-[11.5px]" : "px-2.5 py-1 text-sm",
        STYLES[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      {short ? statusShort(status) : statusLabel(status)}
    </span>
  );
}
