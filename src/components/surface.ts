/**
 * The card every owner and reception panel sits on — dashboard, check-in and
 * forms alike — so edges, radius and shadow match from one screen to the next.
 */
export const cardClass =
  "rounded-xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(25,26,24,0.04),0_6px_20px_rgba(93,69,17,0.05)]";

/** The tinted square an icon (or a member code) sits in. */
export const tileTones = {
  brand: "bg-brand-soft text-brand-ink",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  stop: "bg-stop-soft text-stop-ink",
  muted: "bg-muted text-muted-foreground",
} as const;

export type TileTone = keyof typeof tileTones;
