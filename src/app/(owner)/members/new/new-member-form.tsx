"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Module } from "@/components/module";
import {
  draftToPayload,
  newSubscriptionDraft,
  SubscriptionFields,
  type SubscriptionDraft,
} from "@/components/subscription-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatFullDate } from "@/lib/dates";
import { PAYMENT_LABELS } from "@/lib/types";

export function NewMemberForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [withSubscription, setWithSubscription] = useState(true);
  const [sub, setSub] = useState<SubscriptionDraft>(() => newSubscriptionDraft());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        notes,
        subscription: withSubscription ? draftToPayload(sub) : null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!res) return setError("Connexion impossible.");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Erreur");
    router.push(`/members/${body.id}`);
    router.refresh();
  }

  const amount = Number(sub.amount);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/members">
            <ArrowLeft aria-hidden className="size-4" />
            Membres
          </Link>
        </Button>
        <h1 className="mt-1 text-[26px] font-semibold uppercase">Nouveau membre</h1>
        <p className="text-muted-foreground text-[13px]">
          Le membre pourra entrer dès que la tablette d&apos;accueil se synchronise.
        </p>
      </div>

      <Module title="Membre">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              required
              placeholder="06 12 34 56 78"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="tnum h-10"
            />
            <p className="text-muted-foreground text-xs">
              C&apos;est ce numéro que la réception tapera pour retrouver le membre.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="ex. blessure au genou, frère utilise aussi ce numéro…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
      </Module>

      <Module
        title="Abonnement"
        aside={
          <label className="text-foreground flex items-center gap-2 text-[13px] font-medium">
            <input
              type="checkbox"
              checked={withSubscription}
              onChange={(e) => setWithSubscription(e.target.checked)}
              className="accent-brand size-4"
            />
            Enregistrer un paiement
          </label>
        }
      >
        {withSubscription ? (
          <>
            <SubscriptionFields idPrefix="new" value={sub} onChange={setSub} />
            <p className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-[13px]">
              {amount > 0 ? (
                <>
                  <b className="text-foreground font-semibold">{amount.toLocaleString("fr-FR")} MAD</b> en{" "}
                  {PAYMENT_LABELS[sub.paymentMethod].toLowerCase()}, valable jusqu&apos;au{" "}
                  <b className="text-foreground tnum font-semibold">{formatFullDate(sub.endDate)}</b>.
                </>
              ) : (
                "Indiquez le montant encaissé pour que le revenu du mois soit juste."
              )}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Le membre sera créé sans abonnement. La réception le verra comme « sans abonnement » et ne
            pourra pas le laisser entrer sans accès exceptionnel.
          </p>
        )}
      </Module>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="h-11 self-end px-8" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le membre"}
      </Button>
    </form>
  );
}
