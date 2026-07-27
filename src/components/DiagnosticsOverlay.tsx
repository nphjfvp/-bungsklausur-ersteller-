"use client";

import { useEffect, useState } from "react";

/**
 * Winziges On-Screen-Fehlerprotokoll für die Fehlersuche auf Geräten ohne
 * bequemen Zugriff auf Entwicklertools (v.a. Handys). Zeigt nichts an,
 * solange nichts Ungewöhnliches passiert — taucht ein Fehler oder ein
 * unerwarteter Verlaufswechsel auf, erscheint unten eine kleine, per
 * Screenshot festhaltbare Liste.
 */

interface LogEntry {
  time: string;
  kind: "error" | "rejection" | "navigation";
  text: string;
}

const MAX_ENTRIES = 8;

export function DiagnosticsOverlay() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const add = (kind: LogEntry["kind"], text: string) => {
      setEntries((current) =>
        [
          { time: new Date().toLocaleTimeString("de-DE"), kind, text: text.slice(0, 300) },
          ...current,
        ].slice(0, MAX_ENTRIES)
      );
    };

    const onError = (event: ErrorEvent) => {
      add("error", `${event.message} (${event.filename}:${event.lineno})`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const text = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
      add("rejection", text);
    };
    // Ein "popstate" verrät, ob ein Zurückspringen über den Verlauf
    // passiert ist — z.B. durch eine System-Wischgeste statt eines
    // echten App-Fehlers.
    const onPopstate = () => {
      add("navigation", `Verlauf gewechselt → ${location.pathname}${location.search}`);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("popstate", onPopstate);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("popstate", onPopstate);
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="no-print fixed inset-x-2 bottom-2 z-50 max-h-64 overflow-y-auto rounded-lg border border-red-500/40 bg-slate-950/95 p-2 text-xs text-slate-200 shadow-2xl">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-red-300">Diagnose ({entries.length})</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-0.5"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "einklappen" : "zeigen"}
          </button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-0.5"
            onClick={() => setEntries([])}
          >
            leeren
          </button>
        </div>
      </div>
      {open ? (
        <ul className="space-y-1">
          {entries.map((entry, index) => (
            <li key={index} className="border-t border-white/10 pt-1 first:border-0 first:pt-0">
              <span className="text-slate-500">
                {entry.time} · {entry.kind}
              </span>
              <div className="break-words">{entry.text}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
