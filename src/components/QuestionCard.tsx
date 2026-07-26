"use client";

import { useState } from "react";
import { DIFFICULTY_LABELS, type CheckStatus, type Question } from "@/types";
import { LatexBlock, RichText } from "./RichText";
import { Badge, Button } from "./ui";

const CHECK_TONES: Record<CheckStatus, { tone: "green" | "amber" | "red" | "neutral"; label: string }> = {
  passed: { tone: "green", label: "geprüft" },
  corrected: { tone: "amber", label: "korrigiert" },
  failed: { tone: "red", label: "durchgefallen" },
  unchecked: { tone: "neutral", label: "ungeprüft" },
};

export function QuestionCard({
  question,
  index,
  onArchiveToggle,
  onDelete,
}: {
  question: Question;
  index?: number;
  onArchiveToggle?: (question: Question) => void;
  onDelete?: (question: Question) => void;
}) {
  const [showSolution, setShowSolution] = useState(false);
  const check = question.crossCheck;
  const checkInfo = CHECK_TONES[check?.status ?? "unchecked"];

  return (
    <article
      className={`rounded-xl border p-4 ${
        question.archived
          ? "border-white/5 bg-white/[0.01] opacity-60"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {index !== undefined ? (
          <span className="text-sm font-semibold text-slate-200">Aufgabe {index + 1}</span>
        ) : null}
        <Badge tone="blue" title={`Schwierigkeitsstufe ${question.difficulty} von 9`}>
          {DIFFICULTY_LABELS[question.difficulty]}
        </Badge>
        <Badge>{question.points} P.</Badge>
        <Badge>{question.estimatedMinutes} min</Badge>
        {question.tricks.length > 0 ? (
          <Badge tone="amber" title="Enthält markierte Kniffe">
            {question.tricks.length} Kniff{question.tricks.length === 1 ? "" : "e"}
          </Badge>
        ) : null}
        <Badge tone={question.origin === "extracted" ? "neutral" : "blue"}>
          {question.origin === "extracted" ? "aus Vorlage" : "neu erzeugt"}
        </Badge>
        <Badge tone={checkInfo.tone} title={check?.verdict}>
          {checkInfo.label}
        </Badge>

        <div className="ml-auto flex gap-1">
          {onArchiveToggle ? (
            <Button size="sm" variant="ghost" onClick={() => onArchiveToggle(question)}>
              {question.archived ? "Zurückholen" : "Aussortieren"}
            </Button>
          ) : null}
          {onDelete ? (
            <Button size="sm" variant="ghost" onClick={() => onDelete(question)}>
              Löschen
            </Button>
          ) : null}
        </div>
      </div>

      <RichText className="text-sm leading-relaxed text-slate-100">{question.prompt}</RichText>

      {question.subQuestions.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {question.subQuestions.map((sub) => (
            <li key={sub.label} className="flex gap-2 text-sm text-slate-200">
              <span className="font-semibold text-slate-400">{sub.label})</span>
              <RichText className="flex-1">{sub.prompt}</RichText>
              <span className="shrink-0 text-xs text-slate-500">{sub.points} P.</span>
            </li>
          ))}
        </ol>
      ) : null}

      <Button
        size="sm"
        variant="ghost"
        className="mt-3 px-0"
        aria-expanded={showSolution}
        onClick={() => setShowSolution((value) => !value)}
      >
        {showSolution ? "Lösung ausblenden" : "Lösung anzeigen"}
      </Button>

      {showSolution ? (
        <div className="mt-2 space-y-3 border-t border-white/10 pt-3">
          <div className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm">
            <span className="font-semibold text-blue-200">Ergebnis: </span>
            <RichText className="inline text-slate-100">{question.answer}</RichText>
          </div>

          <ol className="space-y-3">
            {question.steps.map((step, stepIndex) => (
              <li key={stepIndex} className="flex gap-3">
                <span
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.trick ? "bg-amber-400 text-slate-900" : "bg-white/10 text-slate-300"
                  }`}
                >
                  {stepIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <RichText className="text-sm text-slate-200">{step.text}</RichText>
                  {step.latex ? (
                    <LatexBlock tex={step.latex} className="mt-1 text-slate-100" />
                  ) : null}
                  {step.trick ? (
                    <div className="mt-2 rounded-lg border-l-4 border-amber-400 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      <p className="font-semibold">💡 Kniff: {step.trick.label}</p>
                      <RichText className="mt-1">{step.trick.explanation}</RichText>
                      {step.trick.withoutTrick ? (
                        <p className="mt-1 text-amber-200/80">
                          Ohne diesen Kniff: {step.trick.withoutTrick}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          {check && check.issues.length > 0 ? (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <p className="font-semibold">Anmerkungen der Gegenprüfung ({check.model})</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {check.issues.map((issue, issueIndex) => (
                  <li key={issueIndex}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
