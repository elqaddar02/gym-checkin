"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import {
  draftToPayload,
  newSubscriptionDraft,
  SubscriptionFields,
  type SubscriptionDraft,
} from "@/components/subscription-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatFullDate, formatTime, localDate } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import type { MemberDetail } from "@/lib/queries";
import { currentSubscription } from "@/lib/status";
import { OVERRIDE_LABELS, PAYMENT_LABELS, STATUS_LABELS, type SubscriptionDTO } from "@/lib/types";

type EditorState =
  | { mode: "closed" }
  | { mode: "create"; title: string; draft: SubscriptionDraft }
  | { mode: "edit"; id: string; draft: SubscriptionDraft };

function toDraft(s: SubscriptionDTO): SubscriptionDraft {
  return {
    status: s.status,
    amount: String(s.amount),
    startDate: s.startDate,
    endDate: s.endDate,
    paymentMethod: s.paymentMethod,
    receiptNumber: s.receiptNumber ?? "",
    notes: s.notes ?? "",
  };
}

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return "Connexion impossible.";
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error ?? `Erreur ${res.status}`;
}

export function MemberEditor({ member, openRenew }: { member: MemberDetail; openRenew: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(member.name);
  const [phone, setPhone] = useState(formatPhone(member.phone));
  const [notes, setNotes] = useState(member.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const renewDraft = (): SubscriptionDraft => {
    const last = currentSubscription(member.subscriptions) ?? member.subscriptions[0];
    const draft = newSubscriptionDraft(last ? String(last.amount) : "");
    if (last) draft.paymentMethod = last.paymentMethod;
    return draft;
  };

  const [editor, setEditor] = useState<EditorState>(() =>
    openRenew ? { mode: "create", title: "Renouveler (30 jours)", draft: renewDraft() } : { mode: "closed" },
  );
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorPending, setEditorPending] = useState(false);

  async function saveMember(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const error = await send(`/api/members/${member.id}`, "PATCH", { name, phone, notes });
    setSaving(false);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: "Enregistré" });
    if (!error) router.refresh();
  }

  async function saveSubscription() {
    if (editor.mode === "closed") return;
    setEditorPending(true);
    setEditorError(null);
    const payload = draftToPayload(editor.draft);
    const error =
      editor.mode === "create"
        ? await send(`/api/members/${member.id}/subscriptions`, "POST", payload)
        : await send(`/api/subscriptions/${editor.id}`, "PATCH", payload);
    setEditorPending(false);
    if (error) return setEditorError(error);
    setEditor({ mode: "closed" });
    if (openRenew) router.replace(`/members/${member.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{member.name}</h1>
          <StatusBadge status={member.status} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setEditorError(null); setEditor({ mode: "create", title: "Renouveler (30 jours)", draft: renewDraft() }); }}>
            Renouveler
          </Button>
          <Button variant="outline" onClick={() => { setEditorError(null); setEditor({ mode: "create", title: "Nouveau paiement", draft: newSubscriptionDraft() }); }}>
            + Paiement
          </Button>
          <Button asChild variant="ghost"><Link href="/members">Retour</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Informations</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveMember} className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              {message && (
                <span className={message.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"} role="status">
                  {message.text}
                </span>
              )}
              <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Abonnements & paiements</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {member.subscriptions.length === 0 ? (
            <p className="text-muted-foreground">Aucun abonnement.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {member.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">{formatFullDate(s.startDate)} → {formatFullDate(s.endDate)}</TableCell>
                    <TableCell>{STATUS_LABELS[s.status]}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.amount.toLocaleString("fr-FR")} MAD</TableCell>
                    <TableCell>
                      {PAYMENT_LABELS[s.paymentMethod]}
                      {s.receiptNumber && <span className="text-muted-foreground"> · n° {s.receiptNumber}</span>}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground" title={s.notes ?? undefined}>{s.notes}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditorError(null); setEditor({ mode: "edit", id: s.id, draft: toDraft(s) }); }}>
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dernières entrées</CardTitle></CardHeader>
        <CardContent>
          {member.checkIns.length === 0 ? (
            <p className="text-muted-foreground">Aucune entrée.</p>
          ) : (
            <ul className="divide-y">
              {member.checkIns.map((c) => (
                <li key={c.id} className="flex justify-between py-2 text-sm">
                  <span className="tabular-nums">{formatFullDate(localDate(c.checkedInAt))} {formatTime(c.checkedInAt)}</span>
                  {c.overrideReason && <span className="text-red-700 dark:text-red-400">{OVERRIDE_LABELS[c.overrideReason]}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={editor.mode !== "closed"} onOpenChange={(open) => !open && setEditor({ mode: "closed" })}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editor.mode === "edit" ? "Modifier l'abonnement" : editor.mode === "create" ? editor.title : ""}</DialogTitle>
          </DialogHeader>
          {editor.mode !== "closed" && (
            <SubscriptionFields
              idPrefix="sub"
              value={editor.draft}
              onChange={(draft) => setEditor({ ...editor, draft })}
            />
          )}
          {editorError && <p className="text-sm text-destructive" role="alert">{editorError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor({ mode: "closed" })}>Annuler</Button>
            <Button onClick={saveSubscription} disabled={editorPending}>{editorPending ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
