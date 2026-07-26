"use client";

import { useEffect, useState } from "react";

/**
 * Meldet den Service Worker an und zeigt an, wenn das Gerät offline ist —
 * dann steht nur noch das Zusammenstellen von Klausuren zur Verfügung,
 * nicht das Erzeugen neuer Aufgaben.
 */
export function ServiceWorker() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    }

    const update = () => setOffline(!navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="no-print bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-200">
      Offline — Klausuren bauen und drucken geht weiter, neue Aufgaben erzeugen nicht.
    </div>
  );
}
