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

const CACHE = "klausur-shell-v4";

// "/repo/sw.js" -> "/repo"; "/sw.js" -> ""
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");

// Feste Mindestausstattung, falls die Manifest-Datei aus irgendeinem
// Grund nicht geladen werden kann.
const FALLBACK_PRECACHE = [`${BASE}/`, `${BASE}/manifest.webmanifest`, `${BASE}/icon.svg`];

/**
 * Lädt die beim Bauen erzeugte Liste aller Routen-Dateien (HTML +
 * Klick-Payloads). Ohne die würde ein Linkklick zu einer Seite, die in
 * dieser Sitzung noch nie besucht wurde, offline scheitern — die Seite
 * selbst wäre zwar bekannt, aber nicht der kleine Datenhappen, den
 * Next.js für den Wechsel ohne komplettes Neuladen braucht.
 */
async function loadPrecacheList() {
  try {
    const response = await fetch(`${BASE}/precache-manifest.json`);
    if (!response.ok) return FALLBACK_PRECACHE;
    const files = await response.json();
    return Array.isArray(files) && files.length > 0
      ? files.map((path) => `${BASE}${path}`)
      : FALLBACK_PRECACHE;
  } catch {
    return FALLBACK_PRECACHE;
  }
}

/**
 * Next.js legt jede Seite als ".../index.html" ab, ein echter Seiten-
 * aufruf fragt aber die Verzeichnis-Adresse ohne "index.html" an
 * (z.B. ".../settings/") — für den Cache sind das zwei verschiedene
 * Schlüssel. Deshalb wird jede index.html zusätzlich unter ihrer
 * Verzeichnis-Adresse abgelegt, damit eine echte Navigation sie findet.
 */
async function precacheOne(cache, url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return;

    await cache.put(url, response.clone());
    if (url.endsWith("/index.html")) {
      await cache.put(url.slice(0, -"index.html".length), response.clone());
    }
  } catch {
    // Eine einzelne fehlende Datei darf die Installation nicht scheitern lassen.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const list = await loadPrecacheList();
      await Promise.all(list.map((url) => precacheOne(cache, url)));
      await self.skipWaiting();
    })()
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
