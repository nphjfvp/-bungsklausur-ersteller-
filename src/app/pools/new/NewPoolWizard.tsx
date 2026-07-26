"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DifficultyRange } from "@/components/DifficultyRange";
import { ModelPicker } from "@/components/ModelPicker";
import { UploadZone } from "@/components/UploadZone";
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  ProgressBar,
  Spinner,
  TextArea,
  TextInput,
  Toggle,
} from "@/components/ui";
import { canGenerate } from "@/lib/ai/callModel";
import { buildPool, type BuildResult, type ProgressUpdate } from "@/lib/ai/pipeline";
import { DEFAULT_CHECKER_MODEL, DEFAULT_GENERATOR_MODEL, db, getSettings, newId } from "@/lib/db";
import { examHref, poolHref } from "@/lib/routes";
import type { Difficulty, GenerationMode, Pool, SourceDoc } from "@/types";

const MODE_OPTIONS: { value: GenerationMode; title: string; description: string }[] = [
  {
    value: "extract-only",
    title: "Nur extrahieren",
    description:
      "Die App übernimmt ausschließlich die Aufgaben, die in deinen Dokumenten stehen — inklusive Musterlösung, aber ohne etwas dazuzuerfinden.",
  },
  {
    value: "extract-and-generate",
    title: "Extrahieren und ergänzen",
    description:
      "Erst werden die vorhandenen Aufgaben übernommen, danach füllt die App den Pool mit neuen Aufgaben derselben Typen auf. Der empfohlene Weg.",
  },
  {
    value: "generate-only",
    title: "Nur neue Aufgaben",
    description:
      "Deine Dokumente dienen nur als Vorbild für Typ, Stil und Niveau. Im Pool landen ausschließlich neu geschriebene Aufgaben.",
  },
];

export function NewPoolWizard() {
  const router = useRouter();

  const [poolId] = useState(() => newId("pool"));
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [mode, setMode] = useState<GenerationMode>("extract-and-generate");
  const [targetCount, setTargetCount] = useState(60);
  const [difficultyFrom, setDifficultyFrom] = useState<Difficulty>(3);
  const [difficultyTo, setDifficultyTo] = useState<Difficulty>(7);
  const [emphasizeTricks, setEmphasizeTricks] = useState(true);
  const [crossCheck, setCrossCheck] = useState(true);
  const [generatorModel, setGeneratorModel] = useState(DEFAULT_GENERATOR_MODEL);
  const [checkerModel, setCheckerModel] = useState(DEFAULT_CHECKER_MODEL);
  const [notes, setNotes] = useState("");

  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      const settings = await getSettings();
      setGeneratorModel(settings.generatorModel);
      setCheckerModel(settings.checkerModel);
      setKeyReady(await canGenerate());
    })();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const derivedTitle = useMemo(() => {
    if (title.trim()) return title.trim();
    const exam = docs.find((doc) => doc.kind === "exam") ?? docs[0];
    return exam ? exam.name.replace(/\.[^.]+$/, "") : "Neuer Fragenpool";
  }, [title, docs]);

  const canStart = docs.length > 0 && !running && keyReady !== false;

  async function start() {
    setError(null);
    setResult(null);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const now = new Date().toISOString();
    const pool: Pool = {
      id: poolId,
      title: derivedTitle,
      subject: subject.trim() || "Wird aus dem Material erkannt",
      status: "draft",
      config: {
        mode,
        targetCount,
        difficultyFrom,
        difficultyTo,
        emphasizeTricks,
        crossCheck,
        generatorModel,
        checkerModel,
        notes,
      },
      progress: { done: 0, total: 1, label: "Wird vorbereitet …" },
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.pools.put(pool);
      await db.docs.bulkPut(docs.map((doc) => ({ ...doc, poolId })));

      const outcome = await buildPool(pool, docs, setProgress, controller.signal);
      setResult(outcome);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      await db.pools.update(poolId, { status: "error", lastError: message });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Neuer Fragenpool</h1>
        <p className="mt-1 text-sm text-slate-400">
          Material hochladen, Wünsche einstellen, einmal erzeugen lassen. Danach baust du
          daraus offline beliebig viele Klausuren.
        </p>
      </div>

      {keyReady === false ? (
        <Notice tone="warn" title="Kein OpenRouter-Key hinterlegt">
          Zum Erzeugen von Aufgaben braucht die App einen Key.{" "}
          <Link href="/settings">Jetzt in den Einstellungen eintragen.</Link>
        </Notice>
      ) : null}

      {/* Schritt 1 */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">1. Material hochladen</h2>
        <p className="mb-4 text-sm text-slate-400">
          Mindestens eine Übungsklausur. Zusätzliche Skripte und Übungsblätter helfen, damit
          wirklich alle Aufgabentypen erkannt werden.
        </p>
        <UploadZone poolId={poolId} docs={docs} onChange={setDocs} />
      </Card>

      {/* Schritt 2 */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">2. Woher sollen die Aufgaben kommen?</h2>
        <div className="mt-4 grid gap-3">
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                mode === option.value
                  ? "border-blue-400/60 bg-blue-500/10"
                  : "border-white/10 bg-slate-900/40 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1 size-4 shrink-0 accent-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-100">{option.title}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        {mode !== "extract-only" ? (
          <Field
            label="Wie viele Aufgaben soll der Pool umfassen?"
            className="mt-4 max-w-xs"
            hint="Die Menge wird auf die erkannten Aufgabentypen verteilt — häufige Typen bekommen mehr."
          >
            <TextInput
              type="number"
              min={5}
              max={500}
              step={5}
              value={targetCount}
              onChange={(event) => setTargetCount(Number(event.target.value) || 5)}
            />
          </Field>
        ) : null}
      </Card>

      {/* Schritt 3 */}
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">3. Schwierigkeit</h2>
        <p className="mb-5 text-sm text-slate-400">
          Die Mitte des Reglers entspricht genau dem Niveau deiner hochgeladenen Klausur.
          Wähle, in welcher Spanne die Aufgaben liegen sollen.
        </p>

        <DifficultyRange
          from={difficultyFrom}
          to={difficultyTo}
          onChange={(from, to) => {
            setDifficultyFrom(from);
            setDifficultyTo(to);
          }}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={emphasizeTricks}
            onChange={setEmphasizeTricks}
            label="Kniffe und Abkürzungen einbauen"
            description="Aufgaben, die aufwendig aussehen, sich mit dem richtigen Einfall aber stark verkürzen. Die Stellen werden in der Musterlösung markiert."
          />
          <Toggle
            checked={crossCheck}
            onChange={setCrossCheck}
            label="Von zweiter KI gegenprüfen lassen"
            description="Ein anderes Modell rechnet jede Aufgabe nach, korrigiert Fehler und sortiert Unlösbares aus. Dauert länger und kostet mehr."
          />
        </div>
      </Card>

      {/* Schritt 4 */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-white">4. Feinheiten</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titel des Pools">
            <TextInput
              value={title}
              placeholder={derivedTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Fach" hint="Leer lassen, dann erkennt die App es selbst.">
            <TextInput
              value={subject}
              placeholder="z.B. Analysis I"
              onChange={(event) => setSubject(event.target.value)}
            />
          </Field>
          <ModelPicker
            label="Modell zum Erzeugen"
            value={generatorModel}
            onChange={setGeneratorModel}
            needsVision={docs.some((doc) => doc.images.length > 0)}
            hint="Analysiert das Material und schreibt die Aufgaben."
          />
          <ModelPicker
            label="Modell zum Gegenprüfen"
            value={checkerModel}
            onChange={setCheckerModel}
            disabled={!crossCheck}
            hint="Bewusst ein anderes Modell wählen — sonst wiederholt es die eigenen Fehler."
          />
          <Field
            label="Zusätzliche Vorgaben"
            className="sm:col-span-2"
            hint="Freitext, geht direkt in die Anweisung an das Modell."
          >
            <TextArea
              rows={3}
              value={notes}
              placeholder="z.B. keine Taschenrechner-Aufgaben, Einheiten immer im SI-System, Fokus auf Kapitel 3–5"
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* Start */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={!canStart} onClick={() => void start()}>
            {running ? <Spinner /> : null}
            {running ? "Läuft …" : "Fragenpool erzeugen"}
          </Button>

          {running ? (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              Abbrechen
            </Button>
          ) : null}

          {docs.length === 0 ? (
            <span className="text-sm text-slate-400">Lade zuerst mindestens ein Dokument hoch.</span>
          ) : null}
        </div>

        {progress ? (
          <div className="mt-4">
            <ProgressBar done={progress.done} total={progress.total} />
            <p className="mt-1.5 text-sm text-slate-300">{progress.label}</p>
          </div>
        ) : null}

        {error ? (
          <Notice tone="error" title="Der Lauf wurde abgebrochen">
            {error}
            <p className="mt-2 text-xs opacity-80">
              Bereits erzeugte Aufgaben sind gespeichert — du kannst den Pool öffnen und dort
              gezielt nachlegen.
            </p>
          </Notice>
        ) : null}

        {result ? (
          <div className="mt-4 space-y-3">
            <Notice tone="success" title="Fertig">
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone="blue">{result.taskTypes} Aufgabentypen</Badge>
                <Badge>{result.extracted} extrahiert</Badge>
                <Badge>{result.generated} neu erzeugt</Badge>
                {result.checked > 0 ? <Badge tone="green">{result.checked} geprüft</Badge> : null}
                {result.failed > 0 ? (
                  <Badge tone="red">{result.failed} aussortiert</Badge>
                ) : null}
              </div>
            </Notice>

            {result.warnings.length > 0 ? (
              <Notice tone="warn" title={`${result.warnings.length} Teilschritte scheiterten`}>
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {result.warnings.slice(0, 6).map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <div className="flex gap-2">
              <Button variant="primary" onClick={() => router.push(examHref(poolId))}>
                Klausur bauen
              </Button>
              <Button onClick={() => router.push(poolHref(poolId))}>Aufgaben ansehen</Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
