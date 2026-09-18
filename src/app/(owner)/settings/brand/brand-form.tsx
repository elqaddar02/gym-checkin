"use client";

import { Check, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Module } from "@/components/module";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Ready-made identities, so a new gym is set up in one click and adjusted after. */
const PRESETS = [
  { label: "Or", primary: "#e3a008", secondary: "#b45309", onPrimary: "#1b1403" },
  { label: "Terre", primary: "#d14b2a", secondary: "#8f2f17", onPrimary: "#fff3ee" },
  { label: "Turquoise", primary: "#0e9f8c", secondary: "#0a6e62", onPrimary: "#04211d" },
  { label: "Violet", primary: "#6d5be0", secondary: "#4536a8", onPrimary: "#f3f1ff" },
  { label: "Rouge", primary: "#d93a2b", secondary: "#991b1b", onPrimary: "#fff1f0" },
  { label: "Bleu nuit", primary: "#2563eb", secondary: "#1e3a8a", onPrimary: "#eff6ff" },
] as const;

const MAX_LOGO_BYTES = 200 * 1024;

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "MS"
  );
}

export function BrandForm({ brand }: { brand: Brand }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(brand.name);
  const [city, setCity] = useState(brand.city ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(brand.logoUrl);
  const [primary, setPrimary] = useState(brand.primary);
  const [secondary, setSecondary] = useState(brand.secondary);
  const [onPrimary, setOnPrimary] = useState(brand.onPrimary);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const preview = { "--brand": primary, "--brand-2": secondary, "--on-brand": onPrimary } as React.CSSProperties;

  function pickLogo(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo trop lourd — choisissez une image de moins de 200 Ko.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      setSaved(false);
      setLogoUrl(String(reader.result));
    };
    reader.onerror = () => setError("Impossible de lire ce fichier.");
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/gym", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          city,
          logoUrl,
          primaryColor: primary,
          secondaryColor: secondary,
          onPrimaryColor: onPrimary,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      // The colours live on <html>, so the whole app has to re-render to pick them up.
      router.refresh();
    } catch {
      setError("Enregistrement impossible. Vérifiez la connexion.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="flex flex-col gap-4">
        <Module title="La salle">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gym-name">Nom</Label>
              <Input
                id="gym-name"
                value={name}
                maxLength={60}
                required
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gym-city">Ville</Label>
              <Input
                id="gym-city"
                value={city}
                maxLength={60}
                placeholder="Casablanca"
                onChange={(e) => {
                  setCity(e.target.value);
                  setSaved(false);
                }}
                className="h-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gym-logo">Logo</Label>
            <div className="flex flex-wrap items-center gap-3">
              {logoUrl ? (
                // A logo is stored as a data URI, which next/image cannot optimise.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="bg-muted size-14 rounded-xl object-contain p-1" />
              ) : (
                <span
                  aria-hidden
                  style={preview}
                  className="brand-fill font-display grid size-14 place-items-center rounded-xl text-[22px] font-bold"
                >
                  {initialsOf(name)}
                </span>
              )}
              <input
                ref={fileRef}
                id="gym-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) pickLogo(file);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden className="size-4" />
                Choisir un fichier
              </Button>
              {logoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLogoUrl(null);
                    setSaved(false);
                  }}
                >
                  <X aria-hidden className="size-4" />
                  Retirer
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              PNG, JPEG, WebP ou SVG, moins de 200 Ko. Sans logo, les initiales de la salle sont
              affichées sur un carré à vos couleurs.
            </p>
          </div>
        </Module>

        <Module title="Couleurs" aside="Appliquées à tous les écrans">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = p.primary === primary && p.secondary === secondary;
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPrimary(p.primary);
                    setSecondary(p.secondary);
                    setOnPrimary(p.onPrimary);
                    setSaved(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    on ? "border-foreground/30 bg-muted font-semibold" : "bg-card hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-4 rounded-full"
                    style={{ backgroundImage: `linear-gradient(145deg, ${p.primary}, ${p.secondary})` }}
                  />
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField id="c-primary" label="Principale" hint="Boutons, jauges, surbrillance" value={primary} onChange={(v) => { setPrimary(v); setSaved(false); }} />
            <ColorField id="c-secondary" label="Secondaire" hint="Dégradés et logo" value={secondary} onChange={(v) => { setSecondary(v); setSaved(false); }} />
            <ColorField id="c-on" label="Texte sur la couleur" hint="Lisible sur la principale" value={onPrimary} onChange={(v) => { setOnPrimary(v); setSaved(false); }} />
          </div>

          <p className="text-muted-foreground text-xs">
            Vert, orange et rouge restent réservés aux statuts (valide, attention, refus) quelle que
            soit la couleur de la salle.
          </p>
        </Module>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {saved && (
            <span className="text-ok-ink inline-flex items-center gap-1.5 text-sm font-medium" role="status">
              <Check aria-hidden className="size-4" />
              Identité enregistrée
            </span>
          )}
          {error && (
            <span className="text-destructive text-sm font-medium" role="alert">
              {error}
            </span>
          )}
        </div>
      </div>

      {/* Live preview: the same two worlds the gym will actually see. */}
      <div className="flex flex-col gap-4" style={preview}>
        <Module title="Aperçu" aside="Tablette d'accueil">
          <div className="world-tablet dark bg-background flex flex-col gap-3 rounded-xl border p-3">
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-10 rounded-[11px] object-contain" />
              ) : (
                <span aria-hidden className="brand-fill font-display grid size-10 place-items-center rounded-[11px] text-base font-bold">
                  {initialsOf(name)}
                </span>
              )}
              <span className="min-w-0">
                <span className="text-foreground font-display block truncate text-[17px] font-semibold uppercase">
                  {name || "Ma salle"}
                </span>
                <span className="text-muted-foreground block truncate text-[11px] tracking-wider uppercase">
                  {city || "Ville"} · Accueil
                </span>
              </span>
            </div>
            <div className="border-brand-line bg-card text-foreground font-display tnum rounded-xl border-2 px-3 py-2.5 text-xl tracking-widest">
              06 61 23 45
            </div>
            <div className="brand-fill font-display grid h-12 place-items-center rounded-xl text-lg font-semibold uppercase">
              Entrée
            </div>
            <div className="flex gap-2 text-[11px] font-semibold">
              <span className="bg-ok-soft text-ok-ink rounded-md px-2 py-1">Actif</span>
              <span className="bg-warn-soft text-warn-ink rounded-md px-2 py-1">Expire J-3</span>
              <span className="bg-stop-soft text-stop-ink rounded-md px-2 py-1">Expiré</span>
            </div>
          </div>
        </Module>

        <Module title="Aperçu" aside="Tableau de bord">
          <div className="border-brand-line ring-brand-soft flex flex-col gap-0.5 rounded-xl border bg-card p-3 ring-[3px]">
            <span className="eyebrow">Revenus du mois</span>
            <span className="font-display tnum text-[30px] leading-none font-bold">
              24 800<small className="text-muted-foreground ml-1 text-sm font-semibold">MAD</small>
            </span>
            <span className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
              <span className="bg-brand block h-full w-2/3 rounded-full" />
            </span>
          </div>
        </Module>
      </div>
    </form>
  );
}

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-input size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
        />
        <Input
          aria-label={`${label} en hexadécimal`}
          value={value}
          maxLength={7}
          onChange={(e) => onChange(e.target.value)}
          className="tnum h-10 font-mono text-sm uppercase"
        />
      </div>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
