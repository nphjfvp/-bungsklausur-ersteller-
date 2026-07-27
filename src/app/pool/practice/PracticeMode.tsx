"use client";

import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RichText, LatexBlock } from "@/components/RichText";
import { Badge, Button, Card, EmptyState, TextInput } from "@/components/ui";
import { db } from "@/lib/db";
import { isAutoGradable, numbersMatch, parseNumericAnswer, pickPracticeQuestion } from "@/lib/practice/mastery";
import { homeHref, poolHref } from "@/lib/routes";
import { demoteMastery, promoteMastery, MASTERY_LABELS, type MasteryLevel, type Question } from "@/types";

const MASTERY_TONES: Record<MasteryLevel, "red" | "amber" | "green"> = {
  red: "red",
  yellow: "amber",
  green: "green",
};

type Phase = "answering" | "graded";

/**
 * Übungsmodus mit Ampelsystem: Aufgaben mit numerischem Ergebnis werden
 * offline automatisch geprüft (Rundungsfehler egal); alles andere geht
 * über einen Selbsteinschätzungs-Knopf. Richtig gelöst rückt eine Stufe
 * auf (rot → gelb → grün), falsch eine Stufe zurück (grün → gelb → rot,
 * rot bleibt rot). Noch unsichere Aufgaben kommen dadurch öfter dran.
 */
export function PracticeMode({ poolId }: { poolId: string }) {
  const pool = useLiveQuery(() => db.pools.get(poolId), [poolId]);
  const questions = useLiveQuery(
    () => db.questions.where("poolId").equals(poolId).toArray(),
    [poolId],
    [] as Question[]
  );

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("answering");
  const [autoVerdict, setAutoVerdict] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });

  const usable = useMemo(() => questions.filter((question) => !question.archived), [questions]);
  const current = usable.find((question) => question.id === currentId) ?? null;

  const nextQuestion = useCallback(
    (pool: Question[]) => {
      const picked = pickPracticeQuestion(pool);
      setCurrentId(picked?.id ?? null);
      setUserAnswer("");
      setPhase("answering");
      setAutoVerdict(null);
    },
    []
  );

  // Erste Aufgabe ziehen, sobald der Pool geladen ist.
  if (current === null && currentId === null && usable.length > 0) {
    nextQuestion(usable);
  }

  async function applyResult(correct: boolean) {
    if (!current) return;
    const mastery = correct ? promoteMastery(current.mastery ?? "red") : demoteMastery(current.mastery ?? "red");
    await db.questions.update(current.id, { mastery, updatedAt: new Date().toISOString() });
    setStats((s) => ({ answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }));
  }

  async function handleCheck() {
    if (!current) return;

    if (isAutoGradable(current)) {
      const target = parseNumericAnswer(current.answer);
      const given = parseNumericAnswer(userAnswer);
      const correct = target !== null && given !== null && numbersMatch(given, target);
      setAutoVerdict(correct);
      setPhase("graded");
      await applyResult(correct);
      return;
    }

    // Keine reine Zahl — Musterlösung zeigen und den Nutzer selbst
    // einschätzen lassen (Notfall-Knopf).
    setAutoVerdict(null);
    setPhase("graded");
  }

  async function handleManualVerdict(correct: boolean) {
    await applyResult(correct);
    // Verdict optisch festhalten, bis "Nächste Aufgabe" gedrückt wird.
    setAutoVerdict(correct);
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

  const masteryCounts: Record<MasteryLevel, number> = { red: 0, yellow: 0, green: 0 };
  for (const question of usable) masteryCounts[question.mastery ?? "red"]++;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-400">
          <a href={poolHref(poolId)} className="hover:text-slate-200">
            {pool.title}
          </a>
        </p>
        <h1 className="text-2xl font-semibold text-white">Üben</h1>
        <p className="mt-1 text-sm text-slate-400">
          Aufgaben aus dem Pool lösen — läuft vollständig offline. Zahlenergebnisse werden
          automatisch geprüft (Rundungsfehler egal), bei allem anderen schätzt du selbst ein.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone="red">{masteryCounts.red} 🔴</Badge>
        <Badge tone="amber">{masteryCounts.yellow} 🟡</Badge>
        <Badge tone="green">{masteryCounts.green} 🟢</Badge>
        {stats.answered > 0 ? (
          <Badge>
            Diese Sitzung: {stats.correct}/{stats.answered} richtig
          </Badge>
        ) : null}
      </div>

      {usable.length === 0 ? (
        <EmptyState title="Dieser Pool enthält noch keine Aufgaben">
          <a href={poolHref(poolId)} className="text-blue-300 underline">
            Zum Pool
          </a>
        </EmptyState>
      ) : !current ? (
        <p className="text-sm text-slate-400">Wird geladen …</p>
      ) : (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="blue">{current.taskTypeName}</Badge>
            <Badge tone={MASTERY_TONES[current.mastery ?? "red"]}>
              {MASTERY_LABELS[current.mastery ?? "red"]}
            </Badge>
            <Badge>{current.points} P.</Badge>
          </div>

          <RichText className="text-sm leading-relaxed text-slate-100">{current.prompt}</RichText>

          {current.subQuestions.length > 0 ? (
            <ol className="mt-3 space-y-2">
              {current.subQuestions.map((sub) => (
                <li key={sub.label} className="flex gap-2 text-sm text-slate-200">
                  <span className="font-semibold text-slate-400">{sub.label})</span>
                  <RichText className="flex-1">{sub.prompt}</RichText>
                </li>
              ))}
            </ol>
          ) : null}

          {phase === "answering" ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <label className="mb-1.5 block text-sm font-medium text-slate-200">
                  Deine Lösung
                </label>
                <TextInput
                  value={userAnswer}
                  onChange={(event) => setUserAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleCheck();
                  }}
                  placeholder="Ergebnis eingeben …"
                  autoFocus
                />
              </div>
              <Button variant="primary" onClick={() => void handleCheck()}>
                Prüfen
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
              {autoVerdict !== null ? (
                <div
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    autoVerdict
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "bg-red-500/15 text-red-200"
                  }`}
                >
                  {autoVerdict ? "✓ Richtig!" : "✗ Leider falsch."} Deine Eingabe: {userAnswer || "–"}
                </div>
              ) : null}

              <div className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm">
                <span className="font-semibold text-blue-200">Musterlösung: </span>
                <RichText className="inline text-slate-100">{current.answer}</RichText>
              </div>

              {current.steps.length > 0 ? (
                <ol className="space-y-2">
                  {current.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="text-sm text-slate-200">
                      <RichText>{step.text}</RichText>
                      {step.latex ? <LatexBlock tex={step.latex} className="mt-1" /> : null}
                      {step.trick ? (
                        <p className="mt-1 text-xs text-amber-200">💡 Kniff: {step.trick.label}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}

              {autoVerdict === null ? (
                <div>
                  <p className="mb-2 text-sm text-slate-300">
                    Diese Aufgabe lässt sich nicht automatisch vergleichen — stimmt deine Lösung
                    mit der Musterlösung überein?
                  </p>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => void handleManualVerdict(true)}>
                      Richtig
                    </Button>
                    <Button variant="danger" onClick={() => void handleManualVerdict(false)}>
                      Falsch
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => nextQuestion(usable)}>Nächste Aufgabe</Button>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
