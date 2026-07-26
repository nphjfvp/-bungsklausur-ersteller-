import type { NextConfig } from "next";

/**
 * Die App wird als reine Sammlung statischer Dateien ausgeliefert
 * (GitHub Pages). Das passt zum Konzept: es gibt keinen Server-Anteil,
 * der OpenRouter-Key liegt im Browser, und alle Daten stecken in
 * IndexedDB.
 *
 * Auf GitHub Pages liegt die Seite unter einem Unterpfad
 * (/<repo-name>/). Der Pfad kommt über NEXT_PUBLIC_BASE_PATH aus dem
 * Workflow; lokal bleibt er leer.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Ohne Server gibt es keine Bildoptimierung zur Laufzeit.
  images: { unoptimized: true },
  // Jede Route wird zu <route>/index.html — so findet jeder statische
  // Webserver die Seite auch ohne Rewrite-Regeln.
  trailingSlash: true,
};

export default nextConfig;
