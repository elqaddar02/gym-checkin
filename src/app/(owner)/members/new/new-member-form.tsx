"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  draftToPayload,
  newSubscriptionDraft,
  SubscriptionFields,
  type SubscriptionDraft,
} from "@/components/subscription-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nouveau membre</h1>
        <Button asChild variant="ghost"><Link href="/members">Retour</Link></Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Membre</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <Input id="phone" type="tel" required placeholder="06 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" placeholder="ex. blessure au genou, frère utilise aussi ce numéro…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Abonnement</CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withSubscription} onChange={(e) => setWithSubscription(e.target.checked)} className="size-4" />
            Enregistrer un paiement
          </label>
        </CardHeader>
        {withSubscription && (
          <CardContent>
            <SubscriptionFields idPrefix="new" value={sub} onChange={setSub} />
          </CardContent>
        )}
      </Card>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="h-11 self-end px-8" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
