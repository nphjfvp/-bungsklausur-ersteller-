"use client";

import { usePathname } from "next/navigation";
import { homeHref, newPoolHref, settingsHref } from "@/lib/routes";

const LINKS = [
  { href: homeHref(), match: "/", label: "Fragenpools" },
  { href: newPoolHref(), match: "/pools/new", label: "Neuer Pool" },
  { href: settingsHref(), match: "/settings", label: "Einstellungen" },
];

/**
 * Bewusst normale <a>-Tags statt next/link: ein Klick löst damit immer
 * einen echten Seitenaufruf aus statt Next.js' leisen SPA-Wechsel, der
 * eine kleine Zusatzdatei nachlädt. Genau dieser leise Wechsel bricht
 * auf iOS/Safari im Offline-Betrieb sang- und klanglos ab und
 * hinterlässt die alte Seite — ein echter Seitenaufruf läuft über den
 * viel simpleren, ausführlich getesteten Navigations-Pfad des Service
 * Workers.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="no-print sticky top-0 z-20 border-b border-white/10 bg-[#0b0f1a]/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-3 sm:px-6">
        <a href={homeHref()} className="mr-3 flex items-center gap-2 font-semibold text-slate-100">
          <span aria-hidden className="text-lg">📝</span>
          <span className="hidden sm:inline">Übungsklausur-Ersteller</span>
          <span className="sm:hidden">Klausuren</span>
        </a>

        <div className="ml-auto flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.match === "/" ? pathname === "/" : pathname.startsWith(link.match);
            return (
              <a
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
