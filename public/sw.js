// Service worker for the reception check-in screen.
// - /checkin page: network first (3s timeout), cached copy when offline
// - /_next/static/*: cache first (content-hashed, immutable)
// - /api/checkin/members: network first, cached copy when offline
// - Background Sync "checkin-sync": flush the IndexedDB queue (same DB as src/lib/offline-db.ts)

const VERSION = "v1";
const SHELL_CACHE = `checkin-shell-${VERSION}`;
const STATIC_CACHE = `checkin-static-${VERSION}`;
const DATA_CACHE = `checkin-data-${VERSION}`;
const KEEP = [SHELL_CACHE, STATIC_CACHE, DATA_CACHE];

const DB_NAME = "gym-checkin";
const DB_VERSION = 1;
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/checkin", "/manifest.webmanifest"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("checkin-") && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page tells us which chunks it loaded before the worker was in control.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls.map(async (url) => {
        const { pathname } = new URL(url, self.location.origin);
        const cacheName = pathname.startsWith("/_next/static/") ? STATIC_CACHE : SHELL_CACHE;
        const cache = await caches.open(cacheName);
        if (await cache.match(url)) return;
        try {
          const res = await fetch(url, { credentials: "same-origin" });
          if (res.ok) await cache.put(url, res);
        } catch {
          // offline right now; next visit will retry
        }
      }),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (request.mode === "navigate" && url.pathname === "/checkin") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/checkin", NAV_TIMEOUT_MS));
  } else if (url.pathname === "/api/checkin/members") {
    event.respondWith(networkFirst(request, DATA_CACHE, "/api/checkin/members"));
  } else if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/manifest.webmanifest"));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName, cacheKey, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const network = fetch(request);
    const res = timeoutMs
      ? await Promise.race([
          network,
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ])
      : await network;
    if (res.ok) await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

// ---- Background Sync -------------------------------------------------------

self.addEventListener("sync", (event) => {
  if (event.tag === "checkin-sync") event.waitUntil(flushQueue());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("members")) db.createObjectStore("members", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function flushQueue() {
  const db = await openDb();
  const items = await idbRequest(db.transaction("queue").objectStore("queue").getAll());
  if (items.length === 0) return;

  // Throwing makes the browser retry the sync later.
  const res = await fetch("/api/checkins/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      checkIns: items.map(({ id, memberId, checkedInAt, overrideReason }) => ({ id, memberId, checkedInAt, overrideReason })),
    }),
  });
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const body = await res.json();

  // Only drop synced ids here; rejections are left for the page so the receptionist sees them.
  const tx = db.transaction("queue", "readwrite");
  for (const id of body.synced) tx.objectStore("queue").delete(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) client.postMessage({ type: "CHECKINS_SYNCED", count: body.synced.length });
}
