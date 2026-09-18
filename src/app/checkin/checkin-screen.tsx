"use client";

import { Check, Delete, Wifi, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { requestBackgroundSync } from "@/components/service-worker";
import { StatusBadge } from "@/components/status-badge";
import { TrafficChart } from "@/components/traffic-chart";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { initialsOf, type Brand } from "@/lib/brand-format";
import { formatDayMonth, formatTime, localDate, localHour, todayYmd } from "@/lib/dates";
import {
  enqueueCheckIn,
  flushQueue,
  getQueue,
  loadCachedMembers,
  replaceCachedMembers,
  setCachedLastCheckIn,
  type QueuedCheckIn,
} from "@/lib/offline-db";
import { formatPhone, phoneQueryDigits, phoneSearchKey } from "@/lib/phone";
import { memberStatus, type MemberStatus } from "@/lib/status";
import { OVERRIDE_LABELS, type OverrideReason, type ReceptionMember } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 8;
const FLASH_MS = 3000;
const SYNC_INTERVAL_MS = 15_000;
const MEMBERS_REFRESH_MS = 2 * 60_000;
/** How far ahead the renewal rail looks, in days. */
const RENEWAL_HORIZON = 7;

type Flash =
  | { kind: "ok"; name: string; time: string; override: boolean }
  | { kind: "error"; message: string };

interface RecentEntry {
  id: string;
  name: string;
  checkedInAt: string;
  overrideReason: OverrideReason | null;
  state: "syncing" | "synced" | "rejected";
  error?: string;
}

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

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
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState<OverrideReason | null>(null);
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

  // ---- data loading & sync -------------------------------------------------

  const refreshQueue = useCallback(async () => {
    setQueue(await getQueue());
  }, []);

  const sync = useCallback(async () => {
    const outcome = await flushQueue();
    if (outcome.offline) setOnline(false);
    else if (outcome.synced.length > 0 || outcome.rejected.length > 0) setOnline(true);

    if (outcome.synced.length > 0 || outcome.rejected.length > 0) {
      const synced = new Set(outcome.synced);
      const rejected = new Map(outcome.rejected.map((r) => [r.id, r.error]));
      setRecent((prev) =>
        prev.map((r) =>
          synced.has(r.id)
            ? { ...r, state: "synced" }
            : rejected.has(r.id)
              ? { ...r, state: "rejected", error: rejected.get(r.id) }
              : r,
        ),
      );
      if (outcome.rejected.length > 0) {
        setFlash({
          kind: "error",
          message: `Entrée refusée par le serveur: ${outcome.rejected.map((r) => `${r.name} (${r.error})`).join(", ")}`,
        });
      }
    }
    await refreshQueue();
  }, [refreshQueue]);

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

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const digits = phoneQueryDigits(q);
    const folded = fold(q);
    const hasLetters = /\p{L}/u.test(q);
    return members
      .filter((m) =>
        hasLetters ? fold(m.name).includes(folded) : digits.length > 0 && phoneSearchKey(m.phone).includes(digits),
      )
      .sort((a, b) => {
        // Numbers that start with what was typed come first.
        if (!hasLetters) {
          const pa = phoneSearchKey(a.phone).startsWith(digits) ? 0 : 1;
          const pb = phoneSearchKey(b.phone).startsWith(digits) ? 0 : 1;
          if (pa !== pb) return pa - pb;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_RESULTS);
  }, [members, query]);

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

  /**
   * Who came in today, from the tablet's own cache. It counts members, not
   * entries, so a second visit by the same person doesn't move it — which is
   * what "combien de personnes sont passées" means at the desk.
   */
  const attendance = useMemo(() => {
    const byHour = Array.from({ length: 24 }, () => 0);
    let total = 0;
    for (const m of members) {
      if (m.lastCheckInAt && localDate(m.lastCheckInAt) === today) {
        byHour[localHour(m.lastCheckInAt)]++;
        total++;
      }
    }
    return { total, byHour };
  }, [members, today]);

  /** Subscriptions running out this week: the receptionist can warn them at the door. */
  const renewals = useMemo(
    () =>
      members
        .map((m) => ({ member: m, status: statuses.get(m.id)! }))
        .filter((r) => r.status.kind === "active" && r.status.daysLeft <= RENEWAL_HORIZON)
        .sort(
          (a, b) =>
            (a.status as Extract<MemberStatus, { kind: "active" }>).daysLeft -
            (b.status as Extract<MemberStatus, { kind: "active" }>).daysLeft,
        )
        .slice(0, 5),
    [members, statuses],
  );

  // ---- actions -------------------------------------------------------------

  const showFlash = useCallback((f: Flash) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = setTimeout(() => setFlash(null), f.kind === "ok" ? FLASH_MS : 8000);
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setSelectedId(null);
    setOverrideOpen(false);
    setOverrideReason(null);
    focusSearch();
  }, [focusSearch]);

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
      setRecent((prev) =>
        [
          { id: item.id, name: member.name, checkedInAt: item.checkedInAt, overrideReason: reason, state: "syncing" as const },
          ...prev,
        ].slice(0, 30),
      );
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
    } else if (!selected && results.length === 1) {
      setSelectedId(results[0].id);
    }
  };

  /** The on-screen keypad: the tablet has no keyboard, and numbers are how members are found. */
  const press = useCallback(
    (key: string) => {
      setSelectedId(null);
      setQuery((q) => (key === "back" ? q.slice(0, -1) : key === "clear" ? "" : q + key));
      focusSearch();
    },
    [focusSearch],
  );

  // ---- render --------------------------------------------------------------

  const pendingCount = queue.length;
  const staleCache = fetchedAt ? now - new Date(fetchedAt).getTime() > 24 * 60 * 60 * 1000 : false;
  const alreadyToday = selected ? lastCheckInToday(selected.id) : null;
  const todayRecent = recent.filter((r) => localDate(r.checkedInAt) === today);

  return (
    <div className="world-tablet dark bg-background text-foreground flex min-h-dvh flex-col gap-4 px-4 py-4 sm:px-5">
      <header className="flex flex-wrap items-center gap-3">
        <BrandMark brand={brand} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] leading-tight font-semibold uppercase">{brand.name}</h1>
          <p className="text-muted-foreground truncate text-xs tracking-wider uppercase">
            {brand.city ? `${brand.city} · Accueil` : "Accueil"}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pendingCount > 0 && (
            <span className="bg-warn-soft text-warn-ink inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold">
              <span className="bg-warn size-2 animate-pulse rounded-full" />
              {pendingCount} en attente
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
              online ? "bg-ok-soft text-ok-ink" : "bg-stop-soft text-stop-ink",
            )}
          >
            {online ? <Wifi aria-hidden className="size-4" /> : <WifiOff aria-hidden className="size-4" />}
            {online ? "En ligne" : "Hors ligne"}
          </span>
          <span className="font-display tnum text-3xl font-semibold" suppressHydrationWarning>
            {clock ?? "--:--"}
          </span>
        </div>
      </header>

      {staleCache && (
        <p className="bg-warn-soft text-warn-ink rounded-lg px-4 py-2.5 text-sm font-medium">
          Liste des membres non mise à jour depuis plus de 24 h — les statuts peuvent être anciens.
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ---- search, keypad and the member being served ---- */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative">
            <input
              ref={inputRef}
              autoFocus
              type="search"
              inputMode="tel"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedId(null);
              }}
              onKeyDown={onKeyDown}
              placeholder="Téléphone ou nom…"
              aria-label="Rechercher un membre par téléphone ou nom"
              className="border-brand-line ring-brand-soft bg-card placeholder:text-muted-foreground font-display tnum h-20 w-full rounded-2xl border-2 px-6 text-3xl tracking-[0.08em] ring-4 outline-none focus:border-[var(--brand)]"
            />
          </div>

          {flash && (
            <div
              role="status"
              aria-live="assertive"
              className={cn(
                "rounded-2xl px-6 py-5 text-center",
                flash.kind === "ok" ? "brand-fill" : "bg-stop text-white",
              )}
            >
              {flash.kind === "ok" ? (
                <>
                  <div className="font-display tnum flex items-center justify-center gap-3 text-4xl font-bold uppercase">
                    <Check aria-hidden className="size-9" strokeWidth={3} />
                    Entré {flash.time}
                  </div>
                  <div className="mt-1 text-lg font-medium opacity-90">
                    {flash.name}
                    {flash.override && " · accès exceptionnel"}
                  </div>
                </>
              ) : (
                <div className="text-lg font-medium">{flash.message}</div>
              )}
            </div>
          )}

          {!selected && query.trim() !== "" && (
            <ul className="flex flex-col gap-2" aria-label="Résultats">
              {results.length === 0 && (
                <li className="text-muted-foreground rounded-xl border border-dashed px-5 py-6 text-center text-lg">
                  {loaded && members.length === 0
                    ? "Aucun membre en cache. Connectez-vous à Internet une fois."
                    : "Aucun membre trouvé"}
                </li>
              )}
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className="bg-card hover:bg-muted active:bg-muted flex w-full items-center justify-between gap-4 rounded-xl border px-5 py-4 text-left transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xl font-semibold">{m.name}</span>
                      <span className="text-muted-foreground tnum block text-base">{formatPhone(m.phone)}</span>
                    </span>
                    <StatusBadge status={statuses.get(m.id)!} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && selectedStatus && (
            <section className="bg-card flex flex-col gap-4 rounded-2xl border p-5" aria-label="Membre sélectionné">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="bg-brand-soft border-brand-line text-brand-ink font-display grid size-14 shrink-0 place-items-center rounded-[14px] border text-[22px] font-bold"
                  >
                    {initialsOf(selected.name)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-3xl font-bold uppercase">{selected.name}</h2>
                    <p className="text-muted-foreground tnum text-lg">{formatPhone(selected.phone)}</p>
                  </div>
                </div>
                <StatusBadge status={selectedStatus} size="lg" />
              </div>

              {selectedStatus.kind === "active" && (
                <div>
                  <span aria-hidden className="bg-muted block h-2 overflow-hidden rounded-full">
                    <span
                      className="brand-fill block h-full rounded-full"
                      style={{ width: `${Math.max(4, Math.min(100, (selectedStatus.daysLeft / 30) * 100))}%` }}
                    />
                  </span>
                  <p className="text-muted-foreground tnum mt-1.5 text-sm">
                    Valable jusqu&apos;au {formatDayMonth(selectedStatus.until)} · {selectedStatus.daysLeft} jour
                    {selectedStatus.daysLeft > 1 ? "s" : ""} restant{selectedStatus.daysLeft > 1 ? "s" : ""}
                  </p>
                </div>
              )}

              {selected.notes && (
                <p className="bg-muted border-brand-line rounded-r-lg border-l-[3px] px-4 py-3 text-base">
                  {selected.notes}
                </p>
              )}

              {alreadyToday && (
                <p className="bg-warn-soft text-warn-ink rounded-lg px-4 py-3 text-xl font-semibold">
                  Déjà entré à {formatTime(alreadyToday)}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                {canCheckIn(selectedStatus) && (
                  <Button
                    className="h-16 flex-1 rounded-xl text-2xl font-semibold uppercase"
                    disabled={busy}
                    onClick={() => void doCheckIn(selected, null)}
                  >
                    <Check aria-hidden className="size-7" strokeWidth={3} />
                    Entrée
                  </Button>
                )}
                {canOverride(selectedStatus) && (
                  <Button
                    variant="destructive"
                    className="h-16 flex-1 rounded-xl text-2xl font-semibold uppercase"
                    disabled={busy}
                    onClick={() => setOverrideOpen(true)}
                  >
                    Laisser entrer
                  </Button>
                )}
                {selectedStatus.kind === "none" && (
                  <p className="bg-muted flex-1 rounded-xl px-4 py-4 text-center text-lg">
                    Aucun abonnement — voir le propriétaire.
                  </p>
                )}
                <Button variant="outline" className="h-16 rounded-xl px-8 text-xl uppercase" onClick={reset}>
                  <X aria-hidden className="size-6" />
                  Annuler
                </Button>
              </div>
            </section>
          )}

          {!selected && (
            <div className="grid max-w-md grid-cols-3 gap-2" role="group" aria-label="Pavé numérique">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => press(k)}
                  className="bg-secondary hover:bg-muted font-display grid h-14 place-items-center rounded-xl border text-2xl font-semibold transition-colors"
                >
                  {k}
                </button>
              ))}
              <button
                type="button"
                onClick={() => press("clear")}
                className="bg-secondary hover:bg-muted text-muted-foreground grid h-14 place-items-center rounded-xl border text-sm font-semibold uppercase transition-colors"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={() => press("0")}
                className="bg-secondary hover:bg-muted font-display grid h-14 place-items-center rounded-xl border text-2xl font-semibold transition-colors"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => press("back")}
                aria-label="Effacer le dernier chiffre"
                className="bg-secondary hover:bg-muted text-muted-foreground grid h-14 place-items-center rounded-xl border transition-colors"
              >
                <Delete aria-hidden className="size-6" />
              </button>
            </div>
          )}
        </div>

        {/* ---- the rail: what the desk needs at a glance ---- */}
        <aside className="flex min-w-0 flex-col gap-4">
          <section className="bg-card flex flex-col gap-1 rounded-2xl border p-4">
            <span className="eyebrow">Membres entrés aujourd&apos;hui</span>
            <span className="font-display tnum text-brand text-5xl leading-none font-bold">{attendance.total}</span>
            <div className="mt-2">
              <TrafficChart byHour={attendance.byHour} height="h-14" />
            </div>
          </section>

          <section className="bg-card flex flex-col gap-2 rounded-2xl border p-4">
            <h2 className="eyebrow">Dernières entrées (cet appareil)</h2>
            {todayRecent.length === 0 ? (
              <p className="text-muted-foreground py-2 text-sm">Aucune entrée enregistrée sur cette tablette.</p>
            ) : (
              <ul className="flex flex-col">
                {todayRecent.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center gap-2.5 border-t py-2 text-sm first:border-t-0 first:pt-0">
                    <span className="tnum text-muted-foreground text-xs">{formatTime(r.checkedInAt)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.name}
                      {r.overrideReason && (
                        <span className="text-stop-ink text-xs"> · {OVERRIDE_LABELS[r.overrideReason]}</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        r.state === "synced" && "text-ok-ink",
                        r.state === "syncing" && "text-warn-ink",
                        r.state === "rejected" && "text-stop-ink",
                      )}
                    >
                      {r.state === "synced" ? "enregistré" : r.state === "syncing" ? "envoi…" : r.error}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {renewals.length > 0 && (
            <section className="bg-card flex flex-col gap-2 rounded-2xl border p-4">
              <h2 className="eyebrow">À renouveler cette semaine</h2>
              <ul className="flex flex-col">
                {renewals.map(({ member, status }) => (
                  <li key={member.id} className="flex items-center gap-2 border-t py-2 text-sm first:border-t-0 first:pt-0">
                    <span className="min-w-0 flex-1 truncate font-medium">{member.name}</span>
                    <StatusBadge status={status} size="sm" short />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <Dialog
        open={overrideOpen}
        onOpenChange={(open) => {
          setOverrideOpen(open);
          if (!open) setOverrideReason(null);
        }}
      >
        {/* The dialog renders in a portal outside this screen, so it carries the world with it. */}
        <DialogContent className="world-tablet dark bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl uppercase">Laisser entrer {selected?.name}</DialogTitle>
            <DialogDescription className="text-base">
              {selectedStatus &&
                selectedStatus.kind !== "active" &&
                "L'abonnement n'est pas valide. Choisissez la raison :"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Raison">
            {(Object.keys(OVERRIDE_LABELS) as OverrideReason[]).map((reason) => (
              <button
                key={reason}
                type="button"
                role="radio"
                aria-checked={overrideReason === reason}
                onClick={() => setOverrideReason(reason)}
                className={cn(
                  "rounded-xl border-2 px-5 py-4 text-left text-xl transition-colors",
                  overrideReason === reason
                    ? "border-brand-line bg-brand-soft font-semibold"
                    : "hover:bg-muted border-border",
                )}
              >
                {OVERRIDE_LABELS[reason]}
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-14 text-lg" onClick={() => setOverrideOpen(false)}>
              Annuler
            </Button>
            <Button
              className="h-14 text-lg"
              disabled={!overrideReason || busy || !selected}
              onClick={() => selected && overrideReason && void doCheckIn(selected, overrideReason)}
            >
              Confirmer l&apos;entrée
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
