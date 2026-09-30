"use client";

import { Check, Delete, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { requestBackgroundSync } from "@/components/service-worker";
import { initialsOf, type Brand } from "@/lib/brand-format";
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
import { formatPhone, phoneQueryDigits, phoneSearchKey } from "@/lib/phone";
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

const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-ok-ink",
  warn: "text-warn-ink",
  stop: "text-stop-ink",
  muted: "text-muted-foreground",
};

const TONE_PANEL: Record<StatusTone, string> = {
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  stop: "bg-stop-soft text-stop-ink",
  muted: "bg-muted text-muted-foreground",
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

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
    } else if (!selected && results.length === 1) {
      select(results[0].id);
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
    <div className="world-tablet dark bg-background text-foreground relative flex min-h-dvh flex-col overflow-hidden">
      {/* A soft wash of the gym's colour behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[28rem] opacity-25 blur-3xl"
        style={{ background: "radial-gradient(50% 60% at 50% 0%, var(--brand), transparent 70%)" }}
      />

      <header className="relative flex items-center gap-3 px-5 pt-5 sm:px-8">
        <BrandMark brand={brand} size="md" />
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold">{brand.name}</h1>
          {brand.city && <p className="text-muted-foreground truncate text-sm">{brand.city}</p>}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm font-medium"
            title={pendingCount > 0 ? `${pendingCount} entrée(s) en attente d'envoi` : undefined}
          >
            <span className={cn("size-2 rounded-full", TONE_DOT[connection.tone])} />
            {connection.label}
            {pendingCount > 0 && <span className="text-warn-ink tnum">· {pendingCount}</span>}
          </span>
          <span className="font-display tnum text-3xl font-semibold tracking-tight" suppressHydrationWarning>
            {clock ?? "--:--"}
          </span>
        </div>
      </header>

      <main className="relative mx-auto grid w-full max-w-5xl flex-1 content-center gap-6 px-5 py-6 sm:px-8 lg:grid-cols-2 lg:gap-10">
        {/* ---- what is typed, and the keypad to type it ---- */}
        <div className={cn("flex flex-col gap-4", selected && "max-lg:hidden")}>
          <label className="group flex h-20 items-center gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.04] px-6 transition-colors focus-within:border-[var(--brand)] focus-within:bg-white/[0.06]">
            <Search aria-hidden className="text-muted-foreground size-6 shrink-0" />
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
                setOverrideOpen(false);
              }}
              onKeyDown={onKeyDown}
              placeholder="Téléphone ou nom"
              aria-label="Rechercher un membre par téléphone ou nom"
              className="placeholder:text-muted-foreground/60 font-display tnum w-full min-w-0 bg-transparent text-3xl font-semibold tracking-wide outline-none [&::-webkit-search-cancel-button]:hidden"
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
        </div>

        {/* ---- who was found ---- */}
        <section
          className={cn(
            "flex flex-col rounded-3xl border border-white/[0.08] bg-white/[0.03] p-3 backdrop-blur lg:min-h-[22rem]",
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
            <Placeholder title="Qui entre ?" detail="Tapez le numéro de téléphone du membre, ou son nom." />
          ) : results.length === 0 ? (
            <Placeholder
              title="Aucun membre trouvé"
              detail={
                loaded && members.length === 0
                  ? "La liste des membres n'est pas encore chargée. Connectez la tablette à Internet."
                  : "Vérifiez le numéro."
              }
            />
          ) : (
            <ul className="flex flex-col gap-1" aria-label="Résultats">
              {results.map((m) => {
                const status = statuses.get(m.id)!;
                const tone = statusTone(status);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => select(m.id)}
                      className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]"
                    >
                      <Avatar name={m.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold">{m.name}</span>
                        <span className="text-muted-foreground tnum block text-sm">{formatPhone(m.phone)}</span>
                      </span>
                      <span className={cn("flex shrink-0 items-center gap-2 text-sm font-medium", TONE_TEXT[tone])}>
                        <span className={cn("size-2 rounded-full", TONE_DOT[tone])} />
                        {statusShort(status)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {flash && <FlashOverlay flash={flash} onDismiss={dismissFlash} />}
    </div>
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
        "font-display grid h-[4.5rem] place-items-center rounded-2xl text-3xl font-semibold transition-all select-none",
        "bg-white/[0.05] hover:bg-white/[0.09] active:scale-95 active:bg-white/[0.12]",
        muted && "text-muted-foreground bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-brand-soft text-brand-ink font-display grid shrink-0 place-items-center rounded-full font-bold",
        large ? "size-20 text-3xl" : "size-11 text-base",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

function Placeholder({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-white/[0.05]">
        <Search aria-hidden className="text-muted-foreground size-7" />
      </span>
      <p className="text-xl font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-xs">{detail}</p>
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
    <div className="flex flex-1 flex-col gap-5 p-3" aria-label="Membre sélectionné">
      <div className="flex items-start gap-4">
        <Avatar name={member.name} large />
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="truncate text-3xl font-bold tracking-tight">{member.name}</h2>
          <p className="text-muted-foreground tnum text-lg">{formatPhone(member.phone)}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Annuler"
          className="text-muted-foreground grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/[0.08]"
        >
          <X aria-hidden className="size-6" />
        </button>
      </div>

      <div className={cn("flex items-center gap-3 rounded-2xl px-5 py-4", TONE_PANEL[tone])}>
        <span className={cn("size-3 shrink-0 rounded-full", TONE_DOT[tone])} />
        <div className="min-w-0">
          <p className="text-xl font-semibold">{headline.title}</p>
          <p className="tnum opacity-80">{headline.detail}</p>
        </div>
      </div>

      {alreadyToday && (
        <p className="text-warn-ink text-lg font-medium">Déjà entré aujourd&apos;hui à {formatTime(alreadyToday)}</p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {canCheckIn(status) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCheckIn(null)}
            className="brand-fill flex h-20 items-center justify-center gap-3 rounded-2xl text-2xl font-semibold shadow-lg shadow-black/30 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Check aria-hidden className="size-7" strokeWidth={3} />
            Valider l&apos;entrée
          </button>
        )}

        {canOverride(status) &&
          (overrideOpen ? (
            <div className="flex flex-col gap-2" role="group" aria-label="Raison de l'accès exceptionnel">
              <p className="text-muted-foreground px-1 text-sm">Pourquoi le laisser entrer ?</p>
              {(Object.keys(OVERRIDE_LABELS) as OverrideReason[]).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={busy}
                  onClick={() => onCheckIn(reason)}
                  className="h-14 rounded-2xl bg-white/[0.06] px-5 text-left text-lg font-medium transition-colors hover:bg-white/[0.1] active:scale-[0.99] disabled:opacity-60"
                >
                  {OVERRIDE_LABELS[reason]}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={onOverride}
              className="h-16 rounded-2xl border border-white/[0.12] text-xl font-semibold transition-colors hover:bg-white/[0.06]"
            >
              Laisser entrer quand même
            </button>
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
      className="bg-background/85 animate-in fade-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8 text-center backdrop-blur-xl duration-200"
    >
      <span
        className={cn(
          "animate-in zoom-in-50 grid size-36 place-items-center rounded-full text-white shadow-2xl duration-300",
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
          <p className="text-5xl font-bold tracking-tight">{flash.name}</p>
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
