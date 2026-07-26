/**
 * Die App wird statisch ausgeliefert, es kann also keine Seite pro Pool
 * vorgebaut werden — Pool-IDs entstehen erst im Browser. Deshalb steht
 * die ID im Query-String statt im Pfad.
 */

export const POOL_ID_PARAM = "id";

export function poolHref(poolId: string): string {
  return `/pool/?${POOL_ID_PARAM}=${encodeURIComponent(poolId)}`;
}

export function examHref(poolId: string): string {
  return `/pool/exam/?${POOL_ID_PARAM}=${encodeURIComponent(poolId)}`;
}
