import { Suspense } from "react";
import { PracticeRoute } from "./PracticeRoute";

export const metadata = { title: "Üben" };

export default function PracticePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Wird geladen …</p>}>
      <PracticeRoute />
    </Suspense>
  );
}
