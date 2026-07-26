/**
 * Service Worker für den Offline-Betrieb.
 *
 * Zwei Strategien, je nach Anfrageart:
 *
 * - Seitenaufrufe (Navigation, z.B. beim Öffnen der App) laufen
 *   NETWORK-FIRST: Ist Netz da, wird immer die aktuelle Seite geholt.
 *   Erst wenn das fehlschlägt, springt der Zwischenspeicher ein — das
 *   ist der Offline-Fall. Installierte Apps werden von manchen
 *   Betriebssystemen beim "Schließen" nur pausiert statt neu geladen;
 *   ohne Network-First würden Nutzer dann dauerhaft an einer alten
 *   Version hängen bleiben, selbst nach einem Update.
 * - Alles andere (JS, CSS, Bilder) bleibt STALE-WHILE-REVALIDATE: Next.js
 *   hängt an jeden Dateinamen einen Inhalts-Hash — dieselbe Adresse hat
 *   also immer denselben Inhalt, aggressives Zwischenspeichern ist hier
 *   ohne Risiko und macht die App spürbar schneller.
 *
 * Auf GitHub Pages liegt die App unter einem Unterpfad. Der wird aus dem
 * eigenen Ort abgeleitet, damit derselbe Worker lokal (unter "/") und
 * veröffentlicht (unter "/<repo>/") funktioniert.
 */

const CACHE = "klausur-shell-v3";

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

/** Bei Offline-Rückfall zählt der Query-String nicht mit, sonst gälte
 * jeder Pool (?id=…) als unbekannte Adresse. */
async function matchIgnoringQuery(cache, request) {
  const url = new URL(request.url);
  return (
    (await cache.match(url.origin + url.pathname)) ??
    (await cache.match(`${BASE}/`)) ??
    undefined
  );
}

async function handleNavigation(request, cache) {
  try {
    const fresh = await fetch(request);
    if (fresh?.ok) {
      cache.put(request, fresh.clone());
      return fresh;
    }
  } catch {
    // kein Netz — weiter zum Zwischenspeicher
  }

  const cached = await matchIgnoringQuery(cache, request);
  if (cached) return cached;

  return new Response("Offline und nicht im Zwischenspeicher.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function handleStaleWhileRevalidate(request, cache, event) {
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response?.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Im Hintergrund aktualisieren, sofort die Kopie ausliefern. Der
    // Worker darf dafür nicht vorzeitig beendet werden.
    event.waitUntil(network);
    return cached;
  }

  return (await network) ?? new Response("Offline und nicht im Zwischenspeicher.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      request.mode === "navigate"
        ? handleNavigation(request, cache)
        : handleStaleWhileRevalidate(request, cache, event)
    )
  );
});
