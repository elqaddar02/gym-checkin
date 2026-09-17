import { cn } from "@/lib/utils";
import { STATUS_EMOJI, statusLabel, type MemberStatus } from "@/lib/status";

const STYLES: Record<MemberStatus["kind"], string> = {
  active: "bg-green-100 text-green-900 ring-green-300 dark:bg-green-950 dark:text-green-100 dark:ring-green-800",
  expired: "bg-red-100 text-red-900 ring-red-300 dark:bg-red-950 dark:text-red-100 dark:ring-red-800",
  paused: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
  none: "bg-zinc-200 text-zinc-800 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700",
};

export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: MemberStatus;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "lg" ? "px-4 py-1.5 text-lg" : "px-2.5 py-0.5 text-sm",
        STYLES[status.kind],
        className,
      )}
    >
      <span aria-hidden>{STATUS_EMOJI[status.kind]}</span>
      {statusLabel(status)}
    </span>
  );
}
