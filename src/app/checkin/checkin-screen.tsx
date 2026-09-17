"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { requestBackgroundSync } from "@/components/service-worker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTime, localDate, todayYmd } from "@/lib/dates";
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

export function CheckinScreen() {
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
    // Roll "today" over at midnight without a reload.
    const dayTimer = setInterval(() => {
      setToday(todayYmd());
      setNow(Date.now());
    }, 60_000);

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

  // ---- render --------------------------------------------------------------

  const pendingCount = queue.length;
  const staleCache = fetchedAt ? now - new Date(fetchedAt).getTime() > 24 * 60 * 60 * 1000 : false;
  const alreadyToday = selected ? lastCheckInToday(selected.id) : null;
  const todayRecent = recent.filter((r) => localDate(r.checkedInAt) === today);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Accueil — Entrées</h1>
        <div className="flex items-center gap-2 text-sm">
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <span className="size-2 animate-pulse rounded-full bg-amber-500" />
              {pendingCount} en attente · synchronisation…
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium",
              online
                ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"
                : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
            )}
          >
            <span className={cn("size-2 rounded-full", online ? "bg-green-500" : "bg-red-500")} />
            {online ? "En ligne" : "Hors ligne"}
          </span>
        </div>
      </header>

      {staleCache && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Liste des membres non mise à jour depuis plus de 24 h — les statuts peuvent être anciens.
        </p>
      )}

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
          className="h-20 w-full rounded-2xl border-2 border-input bg-background px-6 text-3xl tracking-wide shadow-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/30"
        />
      </div>

      {flash && (
        <div
          role="status"
          aria-live="assertive"
          className={cn(
            "rounded-2xl px-6 py-5 text-center",
            flash.kind === "ok"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white",
          )}
        >
          {flash.kind === "ok" ? (
            <>
              <div className="text-4xl font-bold">✓ Entré {flash.time}</div>
              <div className="mt-1 text-lg opacity-90">
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
            <li className="rounded-xl border border-dashed px-5 py-6 text-center text-lg text-muted-foreground">
              {loaded && members.length === 0 ? "Aucun membre en cache. Connectez-vous à Internet une fois." : "Aucun membre trouvé"}
            </li>
          )}
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4 text-left shadow-xs transition-colors hover:bg-muted active:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xl font-semibold">{m.name}</span>
                  <span className="block text-base text-muted-foreground tabular-nums">{formatPhone(m.phone)}</span>
                </span>
                <StatusBadge status={statuses.get(m.id)!} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && selectedStatus && (
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm" aria-label="Membre sélectionné">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-3xl font-bold">{selected.name}</h2>
              <p className="text-lg text-muted-foreground tabular-nums">{formatPhone(selected.phone)}</p>
            </div>
            <StatusBadge status={selectedStatus} size="lg" />
          </div>

          {selected.notes && (
            <p className="rounded-lg bg-muted px-4 py-3 text-base">📝 {selected.notes}</p>
          )}

          {alreadyToday && (
            <p className="rounded-lg bg-amber-100 px-4 py-3 text-xl font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              ⚠ Déjà entré {formatTime(alreadyToday)}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            {canCheckIn(selectedStatus) && (
              <Button
                className="h-16 flex-1 rounded-xl text-2xl font-semibold"
                disabled={busy}
                onClick={() => void doCheckIn(selected, null)}
              >
                ✓ Entrée
              </Button>
            )}
            {canOverride(selectedStatus) && (
              <Button
                variant="destructive"
                className="h-16 flex-1 rounded-xl text-2xl font-semibold"
                disabled={busy}
                onClick={() => setOverrideOpen(true)}
              >
                Laisser entrer
              </Button>
            )}
            {selectedStatus.kind === "none" && (
              <p className="flex-1 rounded-xl bg-muted px-4 py-4 text-center text-lg">
                Aucun abonnement — voir le propriétaire.
              </p>
            )}
            <Button variant="outline" className="h-16 rounded-xl px-8 text-xl" onClick={reset}>
              Annuler
            </Button>
          </div>
        </section>
      )}

      {todayRecent.length > 0 && !selected && (
        <section className="mt-auto" aria-label="Entrées récentes">
          <h2 className="mb-2 text-sm font-medium tracking-wide text-muted-foreground uppercase">Entrées récentes (cet appareil)</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {todayRecent.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate">
                  <span className="tabular-nums text-muted-foreground">{formatTime(r.checkedInAt)}</span>{" "}
                  <span className="font-medium">{r.name}</span>
                  {r.overrideReason && (
                    <span className="text-sm text-red-700 dark:text-red-300"> · {OVERRIDE_LABELS[r.overrideReason]}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm",
                    r.state === "synced" && "text-green-700 dark:text-green-400",
                    r.state === "syncing" && "text-amber-700 dark:text-amber-400",
                    r.state === "rejected" && "text-red-700 dark:text-red-400",
                  )}
                >
                  {r.state === "synced" ? "✓ enregistré" : r.state === "syncing" ? "synchronisation…" : `✕ ${r.error}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={overrideOpen}
        onOpenChange={(open) => {
          setOverrideOpen(open);
          if (!open) setOverrideReason(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">Laisser entrer {selected?.name}</DialogTitle>
            <DialogDescription className="text-base">
              {selectedStatus && selectedStatus.kind !== "active" && "L'abonnement n'est pas valide. Choisissez la raison :"}
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
                  overrideReason === reason ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted",
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
