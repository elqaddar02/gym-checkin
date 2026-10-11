"use client";

import { CalendarClock, Check, ChevronRight, Delete, Hash, LayoutDashboard, ScanLine, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { cardClass, tileTones } from "@/components/surface";
import { Button } from "@/components/ui/button";
import { requestBackgroundSync } from "@/components/service-worker";
import type { Brand } from "@/lib/brand-format";
import { formatDayMonth, formatTime, localDate, todayYmd } from "@/lib/dates";
import {
  enqueueCheckIn,
  flushQueue,
  getQueue,
  loadCachedMembers,
  replaceCachedMembers,
  setCachedLastCheckIn,
  type QueuedCheckIn,
} from "@/lib/offline-db";
import { formatCode } from "@/lib/member-code";
import { formatPhone } from "@/lib/phone";
import { searchMembers } from "@/lib/reception-search";
import { memberStatus, statusShort, statusTone, type MemberStatus, type StatusTone } from "@/lib/status";
import { OVERRIDE_LABELS, type OverrideReason, type ReceptionMember } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 6;
const FLASH_MS = 2500;
const SYNC_INTERVAL_MS = 15_000;
const MEMBERS_REFRESH_MS = 2 * 60_000;

type Flash =
  | { kind: "ok"; name: string; time: string; override: boolean }
  | { kind: "error"; message: string };

const TONE_DOT: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  stop: "bg-stop",
  muted: "bg-muted-foreground",
};

/** Status pills, the same shape as the dashboard's trend and urgency pills. */
const TONE_PILL: Record<StatusTone, string> = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  stop: "bg-stop-soft text-stop-ink",
  muted: "bg-muted text-muted-foreground",
};

const TONE_PANEL: Record<StatusTone, string> = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  stop: "bg-stop-soft text-stop-ink",
  muted: "bg-muted text-muted-foreground",
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for non-secure contexts (e.g. testing over plain http on the LAN).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function canCheckIn(status: MemberStatus) {
  return status.kind === "active";
}

function canOverride(status: MemberStatus) {
  return status.kind === "expired" || status.kind === "paused";
}

/** The one sentence the receptionist reads before letting someone in. */
function statusHeadline(status: MemberStatus): { title: string; detail: string } {
  switch (status.kind) {
    case "active":
      return {
        title: "Abonnement valide",
        detail: `Jusqu'au ${formatDayMonth(status.until)} · ${status.daysLeft} jour${status.daysLeft > 1 ? "s" : ""}`,
      };
    case "expired":
      return {
        title: "Abonnement expiré",
        detail: status.days === 0 ? "Aujourd'hui" : `Depuis ${status.days} jour${status.days > 1 ? "s" : ""}`,
      };
    case "paused":
      return { title: "Abonnement en pause", detail: `Retour le ${formatDayMonth(status.until)}` };
    case "none":
      return { title: "Aucun abonnement", detail: "Voir le propriétaire" };
  }
}

export function CheckinScreen({
  brand,
}: {
  brand: Pick<Brand, "name" | "city" | "logoUrl" | "initials">;
}) {
  const [members, setMembers] = useState<ReceptionMember[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedCheckIn[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(todayYmd);
  const [now, setNow] = useState(() => Date.now());
  // Rendered only after mount: the server has no business guessing the tablet's clock.
  const [clock, setClock] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const showFlash = useCallback((f: Flash) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = setTimeout(() => setFlash(null), f.kind === "ok" ? FLASH_MS : 8000);
  }, []);

  const dismissFlash = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
    focusSearch();
  }, [focusSearch]);

  // ---- data loading & sync -------------------------------------------------

  const refreshQueue = useCallback(async () => {
    setQueue(await getQueue());
  }, []);

  const sync = useCallback(async () => {
    const outcome = await flushQueue();
    if (outcome.offline) setOnline(false);
    else if (outcome.synced.length > 0 || outcome.rejected.length > 0) setOnline(true);

    if (outcome.rejected.length > 0) {
      showFlash({
        kind: "error",
        message: `Entrée refusée par le serveur: ${outcome.rejected.map((r) => `${r.name} (${r.error})`).join(", ")}`,
      });
    }
    await refreshQueue();
  }, [refreshQueue, showFlash]);

  const refreshMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/checkin/members", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Served by the service worker's offline copy: IndexedDB already has this data.
      if (res.headers.get("X-SW-Cache") === "hit") throw new Error("offline");
      const body = (await res.json()) as { members: ReceptionMember[]; fetchedAt: string };
      // Don't lose "already in today" info from check-ins the server hasn't seen yet.
      const pending = await getQueue();
      const merged = body.members.map((m) => {
        const mine = pending.filter((q) => q.memberId === m.id).map((q) => q.checkedInAt).sort().pop();
        return mine && (!m.lastCheckInAt || mine > m.lastCheckInAt) ? { ...m, lastCheckInAt: mine } : m;
      });
      await replaceCachedMembers(merged, body.fetchedAt);
      setMembers(merged);
      setFetchedAt(body.fetchedAt);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await loadCachedMembers();
        if (!cancelled && cached.members.length > 0) {
          setMembers(cached.members);
          setFetchedAt(cached.fetchedAt);
        }
      } catch (err) {
        console.error("IndexedDB unavailable", err);
      }
      if (!cancelled) setLoaded(true);
      await refreshQueue();
      await Promise.all([refreshMembers(), sync()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMembers, refreshQueue, sync]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void sync();
      void refreshMembers();
    };
    const onOffline = () => setOnline(false);
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "CHECKINS_SYNCED") void sync();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    const syncTimer = setInterval(() => void sync(), SYNC_INTERVAL_MS);
    const membersTimer = setInterval(() => void refreshMembers(), MEMBERS_REFRESH_MS);
    // Roll "today" over at midnight, and move the clock, without a reload.
    const tick = () => {
      setToday(todayYmd());
      setNow(Date.now());
      setClock(formatTime(new Date()));
    };
    tick();
    const dayTimer = setInterval(tick, 20_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      clearInterval(syncTimer);
      clearInterval(membersTimer);
      clearInterval(dayTimer);
    };
  }, [refreshMembers, sync]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  // ---- derived state -------------------------------------------------------

  const statuses = useMemo(() => {
    const map = new Map<string, MemberStatus>();
    for (const m of members) map.set(m.id, memberStatus(m.subscriptions, today));
    return map;
  }, [members, today]);

  const search = useMemo(() => searchMembers(members, query, MAX_RESULTS), [members, query]);
  const results = search.results;

  const selected = members.find((m) => m.id === selectedId) ?? null;
  const selectedStatus = selected ? statuses.get(selected.id)! : null;

  const lastCheckInToday = useCallback(
    (memberId: string): string | null => {
      const times = [
        members.find((m) => m.id === memberId)?.lastCheckInAt,
        ...queue.filter((q) => q.memberId === memberId).map((q) => q.checkedInAt),
      ].filter((t): t is string => !!t && localDate(t) === today);
      return times.sort().pop() ?? null;
    },
    [members, queue, today],
  );

  // ---- actions -------------------------------------------------------------

  const reset = useCallback(() => {
    setQuery("");
    setSelectedId(null);
    setOverrideOpen(false);
    focusSearch();
  }, [focusSearch]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setOverrideOpen(false);
  }, []);

  const doCheckIn = useCallback(
    async (member: ReceptionMember, reason: OverrideReason | null) => {
      if (busy) return;
      setBusy(true);
      const item: QueuedCheckIn = {
        id: uuid(),
        memberId: member.id,
        checkedInAt: new Date().toISOString(),
        overrideReason: reason,
        memberName: member.name,
        attempts: 0,
        lastError: null,
      };
      try {
        // Durable first, network second: a WiFi drop can never lose an entry.
        await enqueueCheckIn(item);
        await setCachedLastCheckIn(member.id, item.checkedInAt);
      } catch {
        setBusy(false);
        showFlash({ kind: "error", message: "Impossible d'enregistrer l'entrée sur cet appareil. Réessayez." });
        return;
      }

      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, lastCheckInAt: item.checkedInAt } : m)));
      showFlash({ kind: "ok", name: member.name, time: formatTime(item.checkedInAt), override: reason !== null });
      reset();
      setBusy(false);

      await refreshQueue();
      void requestBackgroundSync();
      void sync();
    },
    [busy, refreshQueue, reset, showFlash, sync],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      reset();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (selected && selectedStatus && canCheckIn(selectedStatus)) {
      void doCheckIn(selected, null);
    } else if (!selected && (search.exact || results.length === 1)) {
      select((search.exact ?? results[0]).id);
    }
  };

  /** The on-screen keypad: the tablet has no keyboard, and numbers are how members are found. */
  const press = useCallback(
    (key: string) => {
      setSelectedId(null);
      setOverrideOpen(false);
      setQuery((q) => (key === "back" ? q.slice(0, -1) : key === "clear" ? "" : q + key));
      focusSearch();
    },
    [focusSearch],
  );

  // ---- render --------------------------------------------------------------

  const pendingCount = queue.length;
  const staleCache = fetchedAt ? now - new Date(fetchedAt).getTime() > 24 * 60 * 60 * 1000 : false;
  const alreadyToday = selected ? lastCheckInToday(selected.id) : null;

  const connection: { tone: StatusTone; label: string } = !online
    ? { tone: "stop", label: "Hors ligne" }
    : staleCache
      ? { tone: "warn", label: "Liste non à jour" }
      : { tone: "ok", label: "En ligne" };

  return (
    <div className="world-console kiosk-screen bg-background text-foreground flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="kiosk-header-enter flex flex-wrap items-center gap-3">
          <BrandMark brand={brand} size="md" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">Accueil</h1>
            <p className="text-muted-foreground truncate text-sm">
              {brand.name}
              {brand.city && ` · ${brand.city}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold",
                TONE_PILL[connection.tone],
              )}
              title={pendingCount > 0 ? `${pendingCount} entrée(s) en attente d'envoi` : undefined}
            >
              <span className={cn("size-2 rounded-full", TONE_DOT[connection.tone])} />
              {connection.label}
              {pendingCount > 0 && <span className="tnum">· {pendingCount}</span>}
            </span>
            <span
              className={cn(cardClass, "tnum inline-flex h-9 items-center px-3 text-lg font-bold")}
              suppressHydrationWarning
            >
              {clock ?? "--:--"}
            </span>
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href="/dashboard">
                <LayoutDashboard aria-hidden className="size-4" />
                <span className="max-sm:sr-only">Tableau de bord</span>
              </Link>
            </Button>
          </div>
        </header>

        <main className="grid flex-1 grid-cols-1 content-start gap-4 lg:grid-cols-2 lg:content-center">
          {/* ---- the code being typed, and the keypad to type it ---- */}
          <section className={cn(cardClass, "kiosk-search-enter flex flex-col gap-4 p-5", selected && "max-lg:hidden")}>
            <PanelHeading
              icon={<Hash />}
              title="Code du membre"
              detail="Tapez le code donné à l'inscription. Un numéro commençant par 0 cherche le téléphone."
            />

            <label className="kiosk-search border-border bg-background focus-within:border-brand focus-within:ring-brand/20 flex h-20 items-center gap-3 rounded-lg border px-5 transition-[border-color,box-shadow] focus-within:ring-4">
              <Search aria-hidden className="text-muted-foreground size-6 shrink-0" />
              <input
                ref={inputRef}
                autoFocus
                type="search"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedId(null);
                  setOverrideOpen(false);
                }}
                onKeyDown={onKeyDown}
                placeholder="Code ou nom"
                aria-label="Rechercher un membre par code, nom ou téléphone"
                className="placeholder:text-muted-foreground/50 tnum w-full min-w-0 bg-transparent text-3xl font-bold outline-none [&::-webkit-search-cancel-button]:hidden"
              />
            </label>

            <div className="grid grid-cols-3 gap-3" role="group" aria-label="Pavé numérique">
              {KEYS.map((k) => (
                <Key key={k} onClick={() => press(k)}>
                  {k}
                </Key>
              ))}
              <Key onClick={() => press("clear")} label="Tout effacer" muted>
                <X aria-hidden className="size-6" />
              </Key>
              <Key onClick={() => press("0")}>0</Key>
              <Key onClick={() => press("back")} label="Effacer le dernier chiffre" muted>
                <Delete aria-hidden className="size-6" />
              </Key>
            </div>
          </section>

          {/* ---- who was found ---- */}
          <section
            className={cn(
              cardClass,
              "kiosk-panel-enter flex flex-col p-5 lg:min-h-[34rem]",
              // On a narrow screen the keypad alone says what to do.
              !selected && query.trim() === "" && "max-lg:hidden",
            )}
            aria-live="polite"
          >
            {selected && selectedStatus ? (
              <MemberCard
                member={selected}
                status={selectedStatus}
                alreadyToday={alreadyToday}
                busy={busy}
                overrideOpen={overrideOpen}
                onCheckIn={(reason) => void doCheckIn(selected, reason)}
                onOverride={() => setOverrideOpen(true)}
                onCancel={reset}
              />
            ) : query.trim() === "" ? (
              <Placeholder title="Prêt à accueillir" detail="Le membre donne son code, vous le tapez, il entre." ready />
            ) : results.length === 0 ? (
              <Placeholder
                title="Aucun membre trouvé"
                detail={
                  loaded && members.length === 0
                    ? "La liste des membres n'est pas encore chargée. Connectez la tablette à Internet."
                    : search.mode === "code"
                      ? "Aucun membre n'a ce code. Vérifiez-le, ou cherchez par nom."
                      : "Vérifiez la saisie."
                }
              />
            ) : (
              <>
                <PanelHeading
                  icon={<Users />}
                  title={search.exact ? "Membre trouvé" : "Résultats"}
                  detail={
                    search.mode === "code"
                      ? "Touchez le membre pour vérifier son abonnement."
                      : search.mode === "phone"
                        ? "Recherche par téléphone."
                        : "Recherche par nom."
                  }
                />
                <ul className="mt-4 flex flex-col gap-2.5" aria-label="Résultats">
                  {results.map((m, index) => {
                    const status = statuses.get(m.id)!;
                    const tone = statusTone(status);
                    return (
                      <li key={m.id} className="kiosk-result-enter" style={{ animationDelay: `${index * 45}ms` }}>
                        <button
                          type="button"
                          onClick={() => select(m.id)}
                          className={cn(
                            "group hover:bg-brand-soft/60 hover:border-brand-line focus-visible:outline-brand flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                            m === search.exact && "border-brand-line bg-brand-soft/40",
                          )}
                        >
                          <CodeTile code={m.code} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-lg font-semibold">{m.name}</span>
                            <span className="text-muted-foreground tnum block truncate text-sm">
                              {formatPhone(m.phone)}
                            </span>
                          </span>
                          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE_PILL[tone])}>
                            {statusShort(status)}
                          </span>
                          <ChevronRight
                            aria-hidden
                            className="text-muted-foreground size-5 shrink-0 transition-transform group-hover:translate-x-0.5"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </main>
      </div>

      {flash && <FlashOverlay flash={flash} onDismiss={dismissFlash} />}
    </div>
  );
}

/** Icon tile, title and one line of help — the heading every dashboard card has. */
function PanelHeading({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <header className="flex items-start gap-3">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5", tileTones.brand)}>
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-[13px]">{detail}</p>
      </div>
    </header>
  );
}

function Key({
  children,
  onClick,
  label,
  muted = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label?: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "kiosk-key tnum focus-visible:outline-brand grid h-[4.5rem] place-items-center rounded-xl border text-3xl font-bold transition-[background-color,transform] duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95",
        muted
          ? "bg-muted text-muted-foreground hover:bg-secondary border-transparent"
          : "border-border/80 bg-background hover:bg-brand-soft/60 active:bg-brand-soft",
      )}
    >
      {children}
    </button>
  );
}

/** The member's code in a tile, where an avatar would be: it is what reception reads. */
function CodeTile({ code, large = false }: { code?: number | null; large?: boolean }) {
  return (
    <span
      aria-label={formatCode(code)}
      className={cn(
        "tnum grid shrink-0 place-items-center font-bold",
        tileTones.brand,
        large ? "size-20 rounded-xl text-3xl" : "size-12 rounded-lg text-lg",
      )}
    >
      {code ?? "—"}
    </span>
  );
}

function Placeholder({ title, detail, ready = false }: { title: string; detail: string; ready?: boolean }) {
  return (
    <div className="kiosk-placeholder-enter flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span
        className={cn(
          "grid size-16 place-items-center rounded-xl",
          ready ? cn(tileTones.brand, "kiosk-scanner") : tileTones.muted,
        )}
      >
        {ready ? <ScanLine aria-hidden className="size-7" /> : <Search aria-hidden className="size-7" />}
      </span>
      <p className="text-xl font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-xs text-sm">{detail}</p>
    </div>
  );
}

function MemberCard({
  member,
  status,
  alreadyToday,
  busy,
  overrideOpen,
  onCheckIn,
  onOverride,
  onCancel,
}: {
  member: ReceptionMember;
  status: MemberStatus;
  alreadyToday: string | null;
  busy: boolean;
  overrideOpen: boolean;
  onCheckIn: (reason: OverrideReason | null) => void;
  onOverride: () => void;
  onCancel: () => void;
}) {
  const tone = statusTone(status);
  const headline = statusHeadline(status);

  return (
    <div className="kiosk-member-enter flex flex-1 flex-col gap-5" aria-label="Membre sélectionné">
      <div className="flex items-start gap-4">
        <CodeTile code={member.code} large />
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-muted-foreground tnum text-sm font-medium">{formatCode(member.code)}</p>
          <h2 className="truncate text-2xl font-bold sm:text-3xl">{member.name}</h2>
          <p className="text-muted-foreground tnum">{formatPhone(member.phone)}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler"
          className="text-muted-foreground hover:bg-muted grid size-11 shrink-0 place-items-center rounded-lg transition-colors"
        >
          <X aria-hidden className="size-6" />
        </button>
      </div>

      <div className={cn("flex items-center gap-4 rounded-xl p-4", TONE_PANEL[tone])}>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/50">
          {tone === "ok" ? (
            <Check aria-hidden className="size-5" strokeWidth={3} />
          ) : (
            <CalendarClock aria-hidden className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold">{headline.title}</p>
          <p className="tnum text-sm opacity-80">{headline.detail}</p>
        </div>
      </div>

      {alreadyToday && (
        <p className={cn("rounded-lg px-4 py-3 text-base font-semibold", TONE_PANEL.warn)}>
          Déjà entré aujourd&apos;hui à {formatTime(alreadyToday)}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2.5">
        {canCheckIn(status) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCheckIn(null)}
            className="bg-primary text-primary-foreground flex h-20 items-center justify-center gap-3 rounded-xl text-2xl font-bold shadow-[0_6px_20px_rgba(93,69,17,0.14)] transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            <Check aria-hidden className="size-7" strokeWidth={3} />
            Valider l&apos;entrée
          </button>
        )}

        {canOverride(status) &&
          (overrideOpen ? (
            <div className="flex flex-col gap-2" role="group" aria-label="Raison de l'accès exceptionnel">
              <p className="text-muted-foreground px-1 text-sm font-medium">Pourquoi le laisser entrer ?</p>
              {(Object.keys(OVERRIDE_LABELS) as OverrideReason[]).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={busy}
                  onClick={() => onCheckIn(reason)}
                  className="hover:bg-brand-soft/60 hover:border-brand-line flex min-h-14 items-center justify-between rounded-lg border px-4 text-left text-base font-semibold transition-colors active:scale-[0.99] disabled:opacity-60"
                >
                  {OVERRIDE_LABELS[reason]}
                  <ChevronRight aria-hidden className="text-muted-foreground size-5" />
                </button>
              ))}
            </div>
          ) : (
            <Button variant="outline" onClick={onOverride} className="h-14 rounded-xl text-lg font-semibold">
              Laisser entrer quand même
            </Button>
          ))}
      </div>
    </div>
  );
}

/** Full-screen confirmation, readable from across the desk. Tap anywhere to close. */
function FlashOverlay({ flash, onDismiss }: { flash: Flash; onDismiss: () => void }) {
  const ok = flash.kind === "ok";
  return (
    <button
      type="button"
      role="status"
      aria-live="assertive"
      onClick={onDismiss}
      className="world-console kiosk-flash-enter bg-background/85 text-foreground fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8 text-center backdrop-blur-xl"
    >
      <span
        className={cn(
          "checkin-confirm-mark grid size-36 place-items-center rounded-full text-white shadow-2xl",
          ok ? "bg-ok shadow-ok/40" : "bg-stop shadow-stop/40",
        )}
      >
        {ok ? (
          <Check aria-hidden className="size-20" strokeWidth={3} />
        ) : (
          <X aria-hidden className="size-20" strokeWidth={3} />
        )}
      </span>
      {ok ? (
        <div>
          <p className="text-5xl font-bold">{flash.name}</p>
          <p className="text-muted-foreground tnum mt-2 text-2xl">
            Entrée validée à {flash.time}
            {flash.override && " · accès exceptionnel"}
          </p>
        </div>
      ) : (
        <p className="max-w-xl text-2xl font-semibold">{flash.message}</p>
      )}
    </button>
  );
}
