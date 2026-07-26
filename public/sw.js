/**
 * Service Worker für den Offline-Betrieb.
 *
 * Strategie: "stale-while-revalidate" für alles, was die App zum Laufen
 * braucht (HTML, JS, CSS, Fonts). Aufrufe an /api/ werden nie gecacht —
 * die brauchen ohnehin Netz. Dadurch startet die App im Flugmodus, und
 * das Zusammenstellen von Klausuren funktioniert vollständig, weil die
 * Daten in IndexedDB liegen.
 */

const CACHE = "klausur-shell-v1";

// Beim Installieren wird nur die Startseite vorgeladen; alles Weitere
// landet beim ersten Besuch im Cache.
const PRECACHE = ["/", "/settings", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isCacheable(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;

  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Im Hintergrund aktualisieren, sofort die Kopie ausliefern.
        event.waitUntil(network);
        return cached;
      }

      const fresh = await network;
      if (fresh) return fresh;

      // Ohne Netz und ohne Kopie: bei Seitenaufrufen die Startseite zeigen.
      if (request.mode === "navigate") {
        const shell = await cache.match("/");
        if (shell) return shell;
      }

      return new Response("Offline und nicht im Zwischenspeicher.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })
  );
});
