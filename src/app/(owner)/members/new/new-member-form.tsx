"use client";

import { ArrowLeft, Banknote, CalendarClock, Check, CreditCard, ArrowRightLeft, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cardClass, tileTones } from "@/components/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, formatFullDate, todayYmd } from "@/lib/dates";
import { formatCode } from "@/lib/member-code";
import { PAYMENT_LABELS, type PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What a Moroccan gym actually sells: the desk picks one instead of counting days. */
const DURATIONS = [
  { label: "1 mois", days: 30 },
  { label: "3 mois", days: 90 },
  { label: "6 mois", days: 180 },
  { label: "1 an", days: 365 },
] as const;

const METHOD_ICONS = { cash: Banknote, card: CreditCard, transfer: ArrowRightLeft } as const;

interface Created {
  id: string;
  code: number;
  name: string;
}

export function NewMemberForm({ expectedCode }: { expectedCode: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [withSubscription, setWithSubscription] = useState(true);
  const [days, setDays] = useState<number>(30);
  const [startDate, setStartDate] = useState(todayYmd);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const endDate = addDays(startDate, days);

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
        subscription: withSubscription
          ? { status: "active", amount: Number(amount), startDate, endDate, paymentMethod: method }
          : null,
      }),
    }).catch(() => null);
    setPending(false);
    if (!res) return setError("Connexion impossible.");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Erreur");
    setCreated({ id: body.id, code: body.code, name: name.trim() });
    router.refresh();
  }

  function addAnother() {
    setCreated(null);
    setName("");
    setPhone("");
    setAmount("");
    setStartDate(todayYmd());
    setError(null);
  }

  if (created) return <MemberCreated member={created} onAddAnother={addAnother} />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/members">
              <ArrowLeft aria-hidden className="size-4" />
              Membres
            </Link>
          </Button>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Nouveau membre</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Il recevra un code à donner à l&apos;accueil pour entrer.
          </p>
        </div>
        <div className={cn(cardClass, "flex items-center gap-3 px-4 py-3")}>
          <span className={cn("tnum grid size-11 place-items-center rounded-lg text-lg font-bold", tileTones.brand)}>
            {expectedCode}
          </span>
          <span>
            <span className="text-muted-foreground block text-xs font-medium">Code attribué</span>
            <span className="tnum block text-sm font-semibold">{formatCode(expectedCode)}</span>
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <FormCard icon={<UserRound />} title="Membre" detail="Le nom et le téléphone suffisent.">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nom complet</Label>
              <Input
                id="name"
                required
                autoFocus
                autoComplete="off"
                placeholder="ex. Youssef Amrani"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                required
                autoComplete="off"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="tnum h-11"
              />
            </div>
          </div>
        </FormCard>

        <FormCard
          icon={<CalendarClock />}
          title="Abonnement"
          detail="Le premier paiement, s'il paie maintenant."
          aside={
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                checked={withSubscription}
                onChange={(e) => setWithSubscription(e.target.checked)}
                className="accent-brand size-4"
              />
              Paie maintenant
            </label>
          }
        >
          {withSubscription ? (
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">Durée</legend>
                <div className="grid grid-cols-4 gap-2">
                  {DURATIONS.map((d) => (
                    <Choice key={d.days} on={days === d.days} onClick={() => setDays(d.days)}>
                      {d.label}
                    </Choice>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start">À partir du</Label>
                  <Input
                    id="start"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value || todayYmd())}
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="amount">Montant (MAD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    required
                    placeholder="300"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="tnum h-11"
                  />
                </div>
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">Paiement</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => {
                    const Icon = METHOD_ICONS[m];
                    return (
                      <Choice key={m} on={method === m} onClick={() => setMethod(m)}>
                        <Icon aria-hidden className="size-4" />
                        {PAYMENT_LABELS[m]}
                      </Choice>
                    );
                  })}
                </div>
              </fieldset>

              <p className={cn("rounded-lg px-3 py-2.5 text-[13px]", tileTones.muted)}>
                Valable jusqu&apos;au{" "}
                <b className="text-foreground tnum font-semibold">{formatFullDate(endDate)}</b>
                {Number(amount) > 0 && (
                  <>
                    {" "}
                    · <b className="text-foreground tnum font-semibold">{Number(amount).toLocaleString("fr-FR")} MAD</b>{" "}
                    en {PAYMENT_LABELS[method].toLowerCase()}
                  </>
                )}
                .
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              Le membre sera créé sans abonnement : l&apos;accueil le verra « sans abonnement ». Vous pourrez
              enregistrer son paiement plus tard depuis sa fiche.
            </p>
          )}
        </FormCard>
      </div>

      {error && (
        <p className={cn("rounded-lg px-4 py-3 text-sm font-medium", tileTones.stop)} role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline" className="h-11">
          <Link href="/members">Annuler</Link>
        </Button>
        <Button type="submit" className="h-11 px-8" disabled={pending}>
          <UserPlus aria-hidden className="size-4" />
          {pending ? "Enregistrement…" : "Ajouter le membre"}
        </Button>
      </div>
    </form>
  );
}

function FormCard({
  icon,
  title,
  detail,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn(cardClass, "flex flex-col gap-5 p-5")}>
      <header className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5", tileTones.brand)}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-[13px]">{detail}</p>
        </div>
        {aside && <div className="shrink-0 pt-0.5">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** One option of a small set, as a button: quicker than a dropdown on a tablet. */
function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium transition-colors",
        on
          ? "border-brand-line bg-brand-soft text-foreground font-semibold"
          : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** The step after saving: the code is the thing the owner has to pass on. */
function MemberCreated({ member, onAddAnother }: { member: Created; onAddAnother: () => void }) {
  return (
    <section className={cn(cardClass, "mx-auto flex w-full max-w-lg flex-col items-center gap-5 p-8 text-center")}>
      <span className={cn("grid size-12 place-items-center rounded-full", tileTones.ok)}>
        <Check aria-hidden className="size-6" strokeWidth={3} />
      </span>
      <div>
        <h1 className="text-2xl font-bold">{member.name} est inscrit</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Donnez-lui ce code : il le tapera à l&apos;accueil à chaque visite.
        </p>
      </div>
      <div className={cn("w-full rounded-xl py-6", tileTones.brand)}>
        <p className="text-sm font-medium opacity-80">Code membre</p>
        <p className="tnum mt-1 text-6xl font-bold">{member.code}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button variant="outline" className="h-11 flex-1" onClick={onAddAnother}>
          <UserPlus aria-hidden className="size-4" />
          Ajouter un autre
        </Button>
        <Button asChild className="h-11 flex-1">
          <Link href={`/members/${member.id}`}>Voir la fiche</Link>
        </Button>
      </div>
    </section>
  );
}
