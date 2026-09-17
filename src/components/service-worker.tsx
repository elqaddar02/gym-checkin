"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js (production only: a caching worker fights with dev hot reload),
 * then hands it the JS/CSS this page already loaded so the screen can boot offline.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const precacheCurrentPage = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const urls = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => u.startsWith(location.origin) && new URL(u).pathname.startsWith("/_next/static/"));
      worker.postMessage({ type: "CACHE_URLS", urls: [location.pathname, ...urls] });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => precacheCurrentPage(reg.active))
      .catch((err) => console.error("Service worker registration failed", err));
  }, []);

  return null;
}

export async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    await reg.sync?.register("checkin-sync");
  } catch {
    // Background Sync is Chromium-only; the page's own retry loop covers other browsers.
  }
}
