import { Suspense } from "react";
import { ExamRoute } from "./ExamRoute";

export const metadata = { title: "Klausur bauen" };

export default function ExamPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Wird geladen …</p>}>
      <ExamRoute />
    </Suspense>
  );
}
