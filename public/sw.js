/**
 * Service Worker für den Offline-Betrieb.
 *
 * Strategie: "stale-while-revalidate" für alles, was die App zum Laufen
 * braucht (HTML, JS, CSS, Fonts). Dadurch startet die App im Flugmodus,
 * und das Zusammenstellen von Klausuren funktioniert vollständig, weil
 * die Daten in IndexedDB liegen.
 *
 * Auf GitHub Pages liegt die App unter einem Unterpfad. Der wird aus dem
 * eigenen Ort abgeleitet, damit derselbe Worker lokal (unter "/") und
 * veröffentlicht (unter "/<repo>/") funktioniert.
 */

const CACHE = "klausur-shell-v2";

// "/repo/sw.js" -> "/repo"; "/sw.js" -> ""
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");

// Beim Installieren nur die Einstiegsseiten vorladen; alles Weitere
// landet beim ersten Besuch im Cache.
const PRECACHE = [
  `${BASE}/`,
  `${BASE}/settings/`,
  `${BASE}/pools/new/`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icon.svg`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Einzeln, damit ein fehlender Eintrag nicht die ganze
      // Installation scheitern lässt.
      .then((cache) =>
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined)))
      )
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
  return new URL(request.url).origin === self.location.origin;
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

      // Ohne Netz und ohne Kopie: bei Seitenaufrufen die Startseite
      // zeigen. Der Query-String zählt dabei nicht mit, sonst gälte
      // jeder Pool als unbekannte Adresse.
      if (request.mode === "navigate") {
        const url = new URL(request.url);
        const withoutQuery = await cache.match(url.origin + url.pathname);
        if (withoutQuery) return withoutQuery;

        const shell = await cache.match(`${BASE}/`);
        if (shell) return shell;
      }

      return new Response("Offline und nicht im Zwischenspeicher.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    })
  );
});
