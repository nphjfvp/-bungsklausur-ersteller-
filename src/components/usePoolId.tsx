"use client";

import { useSearchParams } from "next/navigation";
import { homeHref, POOL_ID_PARAM } from "@/lib/routes";
import { EmptyState } from "./ui";

/** Liest die Pool-ID aus dem Query-String. */
export function usePoolId(): string | null {
  return useSearchParams().get(POOL_ID_PARAM);
}

/**
 * Wird gezeigt, wenn jemand die nackte Adresse ohne Pool-ID aufruft —
 * besser als ein leerer Bildschirm.
 */
export function MissingPoolId() {
  return (
    <EmptyState title="Kein Fragenpool ausgewählt">
      <a href={homeHref()} className="text-blue-300 underline">
        Zurück zur Übersicht
      </a>
    </EmptyState>
  );
}
