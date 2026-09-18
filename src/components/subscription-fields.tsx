"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addDays, daysBetween, todayYmd } from "@/lib/dates";
import { PAYMENT_LABELS, STATUS_LABELS, type PaymentMethod, type SubscriptionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SubscriptionDraft {
  status: SubscriptionStatus;
  amount: string;
  startDate: string;
  endDate: string;
  paymentMethod: PaymentMethod;
  receiptNumber: string;
  notes: string;
}

export function newSubscriptionDraft(amount = ""): SubscriptionDraft {
  const today = todayYmd();
  return {
    status: "active",
    amount,
    startDate: today,
    endDate: addDays(today, 30),
    paymentMethod: "cash",
    receiptNumber: "",
    notes: "",
  };
}

export function draftToPayload(d: SubscriptionDraft) {
  return {
    ...d,
    amount: Number(d.amount),
    receiptNumber: d.receiptNumber || null,
    notes: d.notes || null,
  };
}

/** What a Moroccan gym actually sells: the desk picks one instead of counting days. */
const DURATIONS = [
  { label: "1 mois", days: 30 },
  { label: "3 mois", days: 90 },
  { label: "6 mois", days: 180 },
  { label: "1 an", days: 365 },
] as const;

export function SubscriptionFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SubscriptionDraft;
  onChange: (next: SubscriptionDraft) => void;
  idPrefix: string;
}) {
  const set = <K extends keyof SubscriptionDraft>(key: K, v: SubscriptionDraft[K]) => onChange({ ...value, [key]: v });
  const id = (name: string) => `${idPrefix}-${name}`;

  const spanDays = daysBetween(value.startDate, value.endDate);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {value.status !== "paused" && (
        <div className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
          <span className="text-muted-foreground mr-1 text-xs font-medium">Durée</span>
          {DURATIONS.map((d) => (
            <button
              key={d.days}
              type="button"
              aria-pressed={spanDays === d.days}
              onClick={() => set("endDate", addDays(value.startDate, d.days))}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                spanDays === d.days
                  ? "border-brand-line bg-brand-soft text-foreground font-semibold"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
          <span className="text-muted-foreground tnum ml-auto text-xs">
            {spanDays} jour{spanDays > 1 ? "s" : ""}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("start")}>Du</Label>
        <Input id={id("start")} type="date" required value={value.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("end")}>{value.status === "paused" ? "Retour le" : "Au"}</Label>
        <Input id={id("end")} type="date" required value={value.endDate} min={value.startDate} onChange={(e) => set("endDate", e.target.value)} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("amount")}>Montant (MAD)</Label>
        <Input id={id("amount")} type="number" inputMode="numeric" min={0} step={1} required value={value.amount} onChange={(e) => set("amount", e.target.value)} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("method")}>Paiement</Label>
        <Select value={value.paymentMethod} onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}>
          <SelectTrigger id={id("method")} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
              <SelectItem key={m} value={m}>{PAYMENT_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("receipt")}>N° de reçu {value.paymentMethod === "cash" && <span className="text-muted-foreground">(espèces)</span>}</Label>
        <Input id={id("receipt")} value={value.receiptNumber} onChange={(e) => set("receiptNumber", e.target.value)} className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("status")}>Statut</Label>
        <Select value={value.status} onValueChange={(v) => set("status", v as SubscriptionStatus)}>
          <SelectTrigger id={id("status")} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as SubscriptionStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id("notes")}>Note sur le paiement</Label>
        <Textarea id={id("notes")} placeholder="ex. doit 500 MAD, accord du propriétaire…" value={value.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
      </div>
    </div>
  );
}
