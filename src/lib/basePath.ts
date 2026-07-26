/**
 * Auf GitHub Pages liegt die App unter /<repo-name>/. Next kümmert sich
 * um Links und Bundles, aber nicht um Adressen, die wir selbst bilden —
 * Service Worker und Manifest brauchen den Präfix von Hand.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
