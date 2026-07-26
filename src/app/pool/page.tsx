import { Suspense } from "react";
import { PoolRoute } from "./PoolRoute";

export const metadata = { title: "Fragenpool" };

export default function PoolPage() {
  // useSearchParams braucht in einer statisch erzeugten Seite eine
  // Suspense-Grenze — bis der Query-String im Browser ausgewertet ist,
  // wird der Platzhalter gezeigt.
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Wird geladen …</p>}>
      <PoolRoute />
    </Suspense>
  );
}
