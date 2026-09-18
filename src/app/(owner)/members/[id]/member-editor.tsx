"use client";

import { ArrowLeft, Pencil, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Module, StatTile } from "@/components/module";
import { Runway } from "@/components/runway";
import { StatusBadge } from "@/components/status-badge";
import {
  draftToPayload,
  newSubscriptionDraft,
  SubscriptionFields,
  type SubscriptionDraft,
} from "@/components/subscription-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDayMonth, formatFullDate, formatTime, localDate, todayYmd } from "@/lib/dates";
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

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
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

  const today = todayYmd();
  const collected = member.subscriptions.reduce((sum, s) => sum + s.amount, 0);
  const current = currentSubscription(member.subscriptions);
  const lastCheckIn = member.checkIns[0];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/members">
            <ArrowLeft aria-hidden className="size-4" />
            Membres
          </Link>
        </Button>
      </div>

      <header className="bg-card flex flex-wrap items-start gap-4 rounded-xl border p-4">
        <span
          aria-hidden
          className="bg-brand-soft text-brand-ink font-display grid size-14 shrink-0 place-items-center rounded-[14px] text-[22px] font-bold"
        >
          {initials(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[26px] leading-tight font-semibold uppercase">{member.name}</h1>
          <p className="text-muted-foreground tnum text-sm">{formatPhone(member.phone)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusBadge status={member.status} />
            <Runway status={member.status} className="min-w-36 max-w-48" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditorError(null);
              setEditor({ mode: "create", title: "Renouveler (30 jours)", draft: renewDraft() });
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Renouveler
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditorError(null);
              setEditor({ mode: "create", title: "Nouveau paiement", draft: newSubscriptionDraft() });
            }}
          >
            <Plus aria-hidden className="size-4" />
            Paiement
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total encaissé"
          value={collected.toLocaleString("fr-FR")}
          unit="MAD"
          detail={`${member.subscriptions.length} abonnement${member.subscriptions.length > 1 ? "s" : ""}`}
        />
        <StatTile
          label="Abonnement en cours"
          value={current ? `${current.amount.toLocaleString("fr-FR")}` : "—"}
          unit={current ? "MAD" : undefined}
          detail={
            current
              ? `${formatDayMonth(current.startDate)} → ${formatDayMonth(current.endDate)} · ${PAYMENT_LABELS[current.paymentMethod]}`
              : "Aucun abonnement enregistré"
          }
        />
        <StatTile
          label="Dernière entrée"
          value={
            lastCheckIn
              ? localDate(lastCheckIn.checkedInAt) === today
                ? formatTime(lastCheckIn.checkedInAt)
                : formatDayMonth(localDate(lastCheckIn.checkedInAt))
              : "—"
          }
          detail={
            lastCheckIn
              ? localDate(lastCheckIn.checkedInAt) === today
                ? "Aujourd'hui"
                : formatFullDate(localDate(lastCheckIn.checkedInAt))
              : "Jamais entré"
          }
        />
        <StatTile
          label="Membre depuis"
          value={formatDayMonth(localDate(member.createdAt))}
          detail={formatFullDate(localDate(member.createdAt))}
        />
      </div>

      <Module title="Informations">
        <form onSubmit={saveMember} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="tnum h-10"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Blessure, préférence d'horaire, remarque à l'accueil…"
            />
            <p className="text-muted-foreground text-xs">
              Ces notes s&apos;affichent sur l&apos;écran d&apos;accueil quand le membre se présente.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            {message && (
              <span className={message.ok ? "text-ok-ink text-sm" : "text-destructive text-sm"} role="status">
                {message.text}
              </span>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </Module>

      <Module
        title="Abonnements & paiements"
        aside={`${member.subscriptions.length} ligne${member.subscriptions.length > 1 ? "s" : ""}`}
        bodyClassName="gap-0"
      >
        {member.subscriptions.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Aucun abonnement. Enregistrez le premier paiement avec « Paiement ».
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                    <TableCell className="tnum whitespace-nowrap">
                      {formatFullDate(s.startDate)} → {formatFullDate(s.endDate)}
                    </TableCell>
                    <TableCell>{STATUS_LABELS[s.status]}</TableCell>
                    <TableCell className="tnum text-right font-semibold">
                      {s.amount.toLocaleString("fr-FR")} MAD
                    </TableCell>
                    <TableCell>
                      {PAYMENT_LABELS[s.paymentMethod]}
                      {s.receiptNumber && <span className="text-muted-foreground"> · n° {s.receiptNumber}</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-48 truncate" title={s.notes ?? undefined}>
                      {s.notes}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditorError(null);
                          setEditor({ mode: "edit", id: s.id, draft: toDraft(s) });
                        }}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Module>

      <Module title="Dernières entrées" aside="20 plus récentes" bodyClassName="gap-0">
        {member.checkIns.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Ce membre n&apos;est jamais entré.</p>
        ) : (
          <ul className="flex flex-col">
            {member.checkIns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0 first:pt-0">
                <span className="tnum">
                  {formatFullDate(localDate(c.checkedInAt))}{" "}
                  <span className="text-muted-foreground">{formatTime(c.checkedInAt)}</span>
                </span>
                {c.overrideReason && (
                  <span className="bg-stop-soft text-stop-ink rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                    Accès exceptionnel · {OVERRIDE_LABELS[c.overrideReason]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Module>

      <Dialog open={editor.mode !== "closed"} onOpenChange={(open) => !open && setEditor({ mode: "closed" })}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editor.mode === "edit"
                ? "Modifier l'abonnement"
                : editor.mode === "create"
                  ? editor.title
                  : ""}
            </DialogTitle>
          </DialogHeader>
          {editor.mode !== "closed" && (
            <SubscriptionFields
              idPrefix="sub"
              value={editor.draft}
              onChange={(draft) => setEditor({ ...editor, draft })}
            />
          )}
          {editorError && (
            <p className="text-destructive text-sm" role="alert">
              {editorError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor({ mode: "closed" })}>
              Annuler
            </Button>
            <Button onClick={saveSubscription} disabled={editorPending}>
              {editorPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
