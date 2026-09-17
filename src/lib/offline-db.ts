"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CheckInInput, ReceptionMember } from "./types";

// Keep DB_NAME / DB_VERSION / stores in sync with public/sw.js.
export const DB_NAME = "gym-checkin";
export const DB_VERSION = 1;

export interface QueuedCheckIn extends CheckInInput {
  memberName: string;
  attempts: number;
  lastError: string | null;
}

interface CheckinDB extends DBSchema {
  members: { key: string; value: ReceptionMember };
  queue: { key: string; value: QueuedCheckIn };
  meta: { key: string; value: string };
}

let dbPromise: Promise<IDBPDatabase<CheckinDB>> | null = null;

export function getDb() {
  dbPromise ??= openDB<CheckinDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("members")) db.createObjectStore("members", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    },
  });
  return dbPromise;
}

export async function loadCachedMembers(): Promise<{ members: ReceptionMember[]; fetchedAt: string | null }> {
  const db = await getDb();
  const [members, fetchedAt] = await Promise.all([db.getAll("members"), db.get("meta", "membersFetchedAt")]);
  return { members, fetchedAt: fetchedAt ?? null };
}

export async function replaceCachedMembers(members: ReceptionMember[], fetchedAt: string) {
  const db = await getDb();
  const tx = db.transaction(["members", "meta"], "readwrite");
  const store = tx.objectStore("members");
  await store.clear();
  await Promise.all(members.map((m) => store.put(m)));
  await tx.objectStore("meta").put(fetchedAt, "membersFetchedAt");
  await tx.done;
}

export async function setCachedLastCheckIn(memberId: string, checkedInAt: string) {
  const db = await getDb();
  const member = await db.get("members", memberId);
  if (member && (!member.lastCheckInAt || member.lastCheckInAt < checkedInAt)) {
    await db.put("members", { ...member, lastCheckInAt: checkedInAt });
  }
}

export async function enqueueCheckIn(item: QueuedCheckIn) {
  const db = await getDb();
  await db.put("queue", item);
}

export async function getQueue(): Promise<QueuedCheckIn[]> {
  const db = await getDb();
  return (await db.getAll("queue")).sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));
}

let syncing: Promise<SyncOutcome> | null = null;

export interface SyncOutcome {
  synced: string[];
  rejected: { id: string; name: string; error: string }[];
  offline: boolean;
}

/** Push queued check-ins to the server. Safe to call often; concurrent calls share one run. */
export function flushQueue(): Promise<SyncOutcome> {
  syncing ??= doFlush().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doFlush(): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { synced: [], rejected: [], offline: false };
  const queue = await getQueue();
  if (queue.length === 0) return outcome;

  let response: Response;
  try {
    response = await fetch("/api/checkins/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIns: queue.map(({ id, memberId, checkedInAt, overrideReason }) => ({ id, memberId, checkedInAt, overrideReason })),
      }),
    });
  } catch {
    outcome.offline = true;
    return outcome;
  }

  const db = await getDb();
  if (!response.ok) {
    // Server error: keep everything queued, remember the error for display.
    const tx = db.transaction("queue", "readwrite");
    await Promise.all(queue.map((q) => tx.store.put({ ...q, attempts: q.attempts + 1, lastError: `HTTP ${response.status}` })));
    await tx.done;
    outcome.offline = response.status >= 500 || response.status === 0;
    return outcome;
  }

  const body = (await response.json()) as { synced: string[]; rejected: { id: string | null; error: string }[] };
  const byId = new Map(queue.map((q) => [q.id, q]));
  const tx = db.transaction("queue", "readwrite");
  for (const id of body.synced) await tx.store.delete(id);
  for (const r of body.rejected) {
    if (!r.id) continue;
    // Permanent rejection (e.g. member deleted): drop it but report it to the receptionist.
    await tx.store.delete(r.id);
    outcome.rejected.push({ id: r.id, name: byId.get(r.id)?.memberName ?? "?", error: r.error });
  }
  await tx.done;
  outcome.synced = body.synced;
  return outcome;
}
