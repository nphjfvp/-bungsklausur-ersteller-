"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Fragenpools" },
  { href: "/pools/new", label: "Neuer Pool" },
  { href: "/settings", label: "Einstellungen" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="no-print sticky top-0 z-20 border-b border-white/10 bg-[#0b0f1a]/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-3 flex items-center gap-2 font-semibold text-slate-100">
          <span aria-hidden className="text-lg">📝</span>
          <span className="hidden sm:inline">Übungsklausur-Ersteller</span>
          <span className="sm:hidden">Klausuren</span>
        </Link>

        <div className="ml-auto flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
