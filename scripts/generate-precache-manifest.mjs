#!/usr/bin/env node
/**
 * Läuft nach "next build" (per npm-"postbuild"-Hook) und listet alle
 * Dateien im Export auf, die der Service Worker beim Installieren fest
 * vorladen soll.
 *
 * Next.js legt neben jeder Seiten-HTML kleine Payload-Dateien an
 * (__next.*.txt), über die ein Klick auf einen Link die Zielseite ohne
 * kompletten Neuladen holt. Werden die nicht vorab zwischengespeichert,
 * schlägt genau dieser Klick offline fehl — sichtbar z.B. als "Klausur
 * bauen geht offline nicht", obwohl die Seite selbst längst gecacht war.
 *
 * Die vielen Bild-Hash-Bundles unter _next/static/ bleiben bewusst
 * draußen: die werden ohnehin beim ersten Laden jeder Seite automatisch
 * zwischengespeichert (stale-while-revalidate in sw.js), und alle vorab
 * zu laden würde die Installation unnötig aufblähen.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT_DIR = "out";
const EXCLUDE_PREFIXES = ["_next/static/"];
const EXCLUDE_FILES = new Set(["sw.js", "precache-manifest.json"]);

function walk(dir, collected) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, collected);
      continue;
    }

    const relPath = relative(OUT_DIR, full).split(sep).join("/");
    if (EXCLUDE_FILES.has(relPath)) continue;
    if (EXCLUDE_PREFIXES.some((prefix) => relPath.startsWith(prefix))) continue;

    collected.push(`/${relPath}`);
  }
}

const files = [];
walk(OUT_DIR, files);
files.sort();

writeFileSync(join(OUT_DIR, "precache-manifest.json"), JSON.stringify(files));
console.log(`precache-manifest.json: ${files.length} Dateien`);
