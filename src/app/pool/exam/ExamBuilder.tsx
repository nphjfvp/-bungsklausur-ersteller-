"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DifficultyRangeCompact } from "@/components/DifficultyRange";
import { QuestionCard } from "@/components/QuestionCard";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  Spinner,
  TextArea,
  TextInput,
  Toggle,
} from "@/components/ui";
import { db } from "@/lib/db";
import { assembleExam, randomSeed, saveExam, type AssembleResult } from "@/lib/exam/assemble";
import { downloadSheet, warmUpPdfEngine } from "@/lib/exam/pdf";
import { renderAllSheets, type SheetKind } from "@/lib/exam/render";
import { homeHref, poolHref } from "@/lib/routes";
import type {
  ExamBlueprintRow,
  ExamConfig,
  Question,
  TaskType,
} from "@/types";

const SHEET_LABELS: Record<SheetKind, string> = {
  exam: "Klausur",
  answers: "Ergebnisse",
  solutions: "Musterlösung",
};

/**
 * Der Klausur-Baukasten. Er greift ausschließlich auf den lokalen Pool
 * zu und erzeugt die PDFs im Browser — dieser Bildschirm funktioniert
 * deshalb vollständig ohne Internet.
 */
export function ExamBuilder({ poolId }: { poolId: string }) {
  const pool = useLiveQuery(() => db.pools.get(poolId), [poolId]);
  const taskTypes = useLiveQuery(
    () => db.taskTypes.where("poolId").equals(poolId).toArray(),
    [poolId],
    [] as TaskType[]
  );
  const questions = useLiveQuery(
    () => db.questions.where("poolId").equals(poolId).toArray(),
    [poolId],
    [] as Question[]
  );

  // Titel und Zusammensetzung leiten sich aus dem Pool ab, solange der
  // Nutzer nichts eigenes eingestellt hat. Deshalb "override"-Zustände
  // statt eines Effekts, der nachträglich Werte hineinschreibt.
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [rowsOverride, setRowsOverride] = useState<ExamBlueprintRow[] | null>(null);
  const [instructions, setInstructions] = useState(
    "Bearbeiten Sie alle Aufgaben. Der Rechenweg muss nachvollziehbar sein."
  );
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [seed, setSeed] = useState(() => randomSeed());
  const [sortByDifficulty, setSortByDifficulty] = useState(true);
  const [avoidUsed, setAvoidUsed] = useState(true);

  const [result, setResult] = useState<AssembleResult | null>(null);
  const [busySheet, setBusySheet] = useState<SheetKind | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Die PDF-Bündel gleich beim Öffnen holen, damit der Export später auch
  // dann noch klappt, wenn die Verbindung weg ist.
  useEffect(() => {
    void warmUpPdfEngine().catch(() => undefined);
  }, []);

  // Vorbelegung: je Aufgabentyp eine Aufgabe, über die Spanne des Pools.
  const rows = useMemo(
    () =>
      rowsOverride ??
      taskTypes.map((taskType) => ({
        taskTypeId: taskType.id,
        taskTypeName: taskType.name,
        count: 1,
        difficultyFrom: pool?.config.difficultyFrom ?? 4,
        difficultyTo: pool?.config.difficultyTo ?? 6,
      })),
    [rowsOverride, taskTypes, pool]
  );

  const title = titleOverride ?? (pool ? `${pool.title} — Klausur` : "");

  /** Ändert eine Zeile und friert die Zusammensetzung als Nutzerwahl ein. */
  const updateRow = useCallback(
    (index: number, patch: Partial<ExamBlueprintRow>) => {
      setRowsOverride((current) =>
        (current ?? rows).map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, ...patch } : entry
        )
      );
    },
    [rows]
  );

  const available = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const question of questions) {
      if (question.archived) continue;
      const bucket = map.get(question.taskTypeId) ?? [];
      bucket.push(question);
      map.set(question.taskTypeId, bucket);
    }
    return map;
  }, [questions]);

  const config: ExamConfig = useMemo(
    () => ({
      title: title.trim() || "Klausur",
      subject: pool?.subject ?? "",
      instructions,
      durationMinutes,
      rows,
      seed,
      sortByDifficulty,
      avoidUsed,
    }),
    [title, pool, instructions, durationMinutes, rows, seed, sortByDifficulty, avoidUsed]
  );

  const plannedCount = rows.reduce((sum, row) => sum + row.count, 0);

  const build = useCallback(async () => {
    setError(null);
    setSaved(false);
    try {
      setResult(await assembleExam(poolId, config));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [poolId, config]);

  async function handleDownload(kind: SheetKind) {
    if (!result) return;
    setError(null);
    setBusySheet(kind);

    try {
      const sheet = renderAllSheets(config, result.questions).find(
        (candidate) => candidate.kind === kind
      );
      if (!sheet) return;

      await downloadSheet(sheet, (progress) =>
        setPdfProgress(`Seite ${progress.page} von ${progress.totalPages}`)
      );

      // Erst beim ersten Export gilt die Klausur als wirklich benutzt.
      if (!saved) {
        await saveExam(poolId, config, result.questions);
        setSaved(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusySheet(null);
      setPdfProgress(null);
    }
  }

  if (pool === undefined) return <p className="text-sm text-slate-400">Wird geladen …</p>;
  if (pool === null) {
    return (
      <EmptyState title="Dieser Fragenpool existiert nicht (mehr)">
        <a href={homeHref()} className="text-blue-300 underline">
          Zurück zur Übersicht
        </a>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-400">
          <a href={poolHref(poolId)} className="hover:text-slate-200">
            {pool.title}
          </a>
        </p>
        <h1 className="text-2xl font-semibold text-white">Klausur bauen</h1>
        <p className="mt-1 text-sm text-slate-400">
          Läuft vollständig offline: Aufgaben werden aus dem vorhandenen Pool gezogen und die
          PDFs direkt hier im Browser gesetzt.
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-white">Kopfdaten</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titel">
            <TextInput
              value={title}
              onChange={(event) => setTitleOverride(event.target.value)}
            />
          </Field>
          <Field label="Bearbeitungszeit (Minuten)">
            <TextInput
              type="number"
              min={10}
              max={360}
              step={5}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value) || 90)}
            />
          </Field>
          <Field label="Hinweise auf dem Deckblatt" className="sm:col-span-2">
            <TextArea
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Zusammensetzung</h2>
          <span className="text-sm text-slate-400">{plannedCount} Aufgaben geplant</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="Dieser Pool enthält noch keine Aufgabentypen">
            <a href={poolHref(poolId)} className="text-blue-300 underline">
              Zum Pool
            </a>
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {rows.map((row, index) => {
              const pool_ = available.get(row.taskTypeId) ?? [];
              const low = Math.min(row.difficultyFrom, row.difficultyTo);
              const high = Math.max(row.difficultyFrom, row.difficultyTo);
              const matching = pool_.filter(
                (question) => question.difficulty >= low && question.difficulty <= high
              ).length;
              const tight = row.count > matching;

              return (
                <div
                  key={row.taskTypeId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/40 p-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">
                    {row.taskTypeName}
                  </span>

                  <DifficultyRangeCompact
                    from={row.difficultyFrom}
                    to={row.difficultyTo}
                    onChange={(from, to) =>
                      updateRow(index, { difficultyFrom: from, difficultyTo: to })
                    }
                  />

                  <Badge tone={tight ? "red" : "neutral"} title="Verfügbare Aufgaben in dieser Spanne">
                    {matching} verfügbar
                  </Badge>

                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={row.count}
                    aria-label={`Anzahl für ${row.taskTypeName}`}
                    onChange={(event) =>
                      updateRow(index, { count: Math.max(0, Number(event.target.value) || 0) })
                    }
                    className="w-16 rounded-lg border border-white/10 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={sortByDifficulty}
            onChange={setSortByDifficulty}
            label="Nach Schwierigkeit anordnen"
            description="Leichte Aufgaben zuerst — wie in den meisten Klausuren üblich."
          />
          <Toggle
            checked={avoidUsed}
            onChange={setAvoidUsed}
            label="Bereits gedruckte Aufgaben meiden"
            description="Aufgaben aus früheren Klausuren kommen nur dran, wenn der Pool sonst nicht reicht."
          />
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field
            label="Ziehungs-Schlüssel"
            className="w-40"
            hint="Gleicher Schlüssel ⇒ gleiche Klausur."
          >
            <TextInput value={seed} onChange={(event) => setSeed(event.target.value)} />
          </Field>
          <Button onClick={() => setSeed(randomSeed())}>Neu würfeln</Button>
          <Button variant="primary" disabled={plannedCount === 0} onClick={() => void build()}>
            Klausur zusammenstellen
          </Button>
        </div>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {result ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Vorschau</h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{result.questions.length} Aufgaben</Badge>
              <Badge>{result.totalPoints} Punkte</Badge>
              <Badge>ca. {result.estimatedMinutes} min Rechenzeit</Badge>
            </div>
          </div>

          {result.shortfalls.length > 0 ? (
            <Notice tone="warn" title="Der Pool gab nicht alles her">
              <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {result.shortfalls.map((shortfall) => (
                  <li key={shortfall.taskTypeName}>
                    {shortfall.taskTypeName}: {shortfall.got} von {shortfall.wanted} Aufgaben.
                    Lege im Pool nach oder erweitere die Schwierigkeitsspanne.
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {result.estimatedMinutes > durationMinutes * 1.15 ? (
            <Notice tone="warn">
              Die Aufgaben brauchen geschätzt {result.estimatedMinutes} Minuten, angesetzt sind{" "}
              {durationMinutes}. Weniger Aufgaben oder mehr Zeit einplanen.
            </Notice>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {(Object.keys(SHEET_LABELS) as SheetKind[]).map((kind) => (
              <Button
                key={kind}
                variant={kind === "exam" ? "primary" : "secondary"}
                disabled={busySheet !== null || result.questions.length === 0}
                onClick={() => void handleDownload(kind)}
              >
                {busySheet === kind ? <Spinner /> : null}
                {SHEET_LABELS[kind]} als PDF
              </Button>
            ))}
            {pdfProgress ? (
              <span className="text-xs text-slate-400">{pdfProgress}</span>
            ) : null}
            {saved ? <Badge tone="green">Klausur gespeichert</Badge> : null}
          </div>

          <div className="mt-6 space-y-4">
            {result.questions.map((question, index) => (
              <QuestionCard key={question.id} question={question} index={index} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
