/**
 * Die App wird statisch ausgeliefert, es kann also keine Seite pro Pool
 * vorgebaut werden — Pool-IDs entstehen erst im Browser. Deshalb steht
 * die ID im Query-String statt im Pfad.
 *
 * Alle Adressen tragen hier bewusst den GitHub-Pages-Unterpfad schon
 * eingebacken: Sie landen in normalen <a>-Tags statt next/link (das
 * würde den Unterpfad automatisch ergänzen), damit jeder Seitenwechsel
 * ein echter Browser-Aufruf ist statt Next.js' leisem SPA-Wechsel, der
 * auf iOS/Safari im Offline-Betrieb sang- und klanglos abbrechen kann.
 */

import { withBasePath } from "./basePath";

export const POOL_ID_PARAM = "id";

export function homeHref(): string {
  return withBasePath("/");
}

export function settingsHref(): string {
  return withBasePath("/settings/");
}

export function newPoolHref(): string {
  return withBasePath("/pools/new/");
}

export function poolHref(poolId: string): string {
  return withBasePath(`/pool/?${POOL_ID_PARAM}=${encodeURIComponent(poolId)}`);
}

export function examHref(poolId: string): string {
  return withBasePath(`/pool/exam/?${POOL_ID_PARAM}=${encodeURIComponent(poolId)}`);
}

export function practiceHref(poolId: string): string {
  return withBasePath(`/pool/practice/?${POOL_ID_PARAM}=${encodeURIComponent(poolId)}`);
}
