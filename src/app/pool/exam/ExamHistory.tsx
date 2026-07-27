"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Button, Card, EmptyState, Notice, Spinner, TextInput } from "@/components/ui";
import { db, deleteWithTombstone } from "@/lib/db";
import { downloadSheet } from "@/lib/exam/pdf";
import { renderAllSheets, type SheetKind } from "@/lib/exam/render";
import type { Exam, Question } from "@/types";

const SHEET_LABELS: Record<SheetKind, string> = {
  exam: "Klausur",
  answers: "Ergebnisse",
  solutions: "Musterlösung",
};

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Liste aller bisher aus diesem Pool erzeugten Klausuren — mit
 * Ziehungs-Schlüssel und Erstellungszeitpunkt, damit sich eine
 * bestimmte Klausur später wiederfinden und erneut ausdrucken lässt.
 *
 * Die PDFs werden dabei aus den ursprünglich gezogenen Aufgaben neu
 * gesetzt (nicht neu gewürfelt) — auch wenn sich der Pool inzwischen
 * verändert hat, bleibt die Klausur exakt dieselbe wie beim ersten Mal.
 */
export function ExamHistory({ poolId }: { poolId: string }) {
  const exams = useLiveQuery(
    () => db.exams.where("poolId").equals(poolId).reverse().sortBy("createdAt"),
    [poolId],
    [] as Exam[]
  );

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<{ examId: string; kind: SheetKind } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = exams.filter((exam) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      exam.config.title.toLowerCase().includes(needle) ||
      exam.config.seed.toLowerCase().includes(needle)
    );
  });

  async function handleDownload(exam: Exam, kind: SheetKind) {
    setError(null);
    setBusy({ examId: exam.id, kind });

    try {
      const found = await db.questions.bulkGet(exam.questionIds);
      const questions = found.filter((q): q is Question => q !== undefined);

      if (questions.length === 0) {
        throw new Error(
          "Keine der ursprünglichen Aufgaben ist noch vorhanden — sie wurden vermutlich gelöscht."
        );
      }
      if (questions.length < exam.questionIds.length) {
        setError(
          `Nur ${questions.length} von ${exam.questionIds.length} Aufgaben sind noch vorhanden ` +
            "(der Rest wurde inzwischen gelöscht). Die PDF enthält nur die verbliebenen."
        );
      }

      const sheet = renderAllSheets(exam.config, questions).find(
        (candidate) => candidate.kind === kind
      );
      if (sheet) await downloadSheet(sheet);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  if (exams.length === 0) return null;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Verlauf</h2>
        <TextInput
          value={search}
          placeholder="Nach Titel oder Schlüssel suchen"
          className="w-56"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title="Keine Treffer" />
      ) : (
        <ul className="space-y-2">
          {filtered.map((exam) => (
            <li
              key={exam.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/40 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">{exam.config.title}</p>
                <p className="text-xs text-slate-400">
                  {DATE_FORMAT.format(new Date(exam.createdAt))}
                </p>
              </div>

              <Badge tone="neutral" title="Ziehungs-Schlüssel — damit lässt sich dieselbe Ziehung reproduzieren">
                🔑 {exam.config.seed}
              </Badge>
              <Badge>{exam.questionIds.length} Aufgaben</Badge>
              <Badge>{exam.totalPoints} Punkte</Badge>

              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SHEET_LABELS) as SheetKind[]).map((kind) => (
                  <Button
                    key={kind}
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void handleDownload(exam, kind)}
                  >
                    {busy?.examId === exam.id && busy.kind === kind ? <Spinner /> : null}
                    {SHEET_LABELS[kind]}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`„${exam.config.title}“ aus dem Verlauf entfernen?`)) {
                      void deleteWithTombstone("exams", exam.id);
                    }
                  }}
                >
                  Entfernen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
