"use client";

import { useState } from "react";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  type CheckStatus,
  type Difficulty,
  type Question,
  type SolutionStep,
  type SubQuestion,
} from "@/types";
import { LatexBlock, RichText } from "./RichText";
import { Badge, Button, Field, Select, TextArea, TextInput } from "./ui";

const CHECK_TONES: Record<CheckStatus, { tone: "green" | "amber" | "red" | "neutral"; label: string }> = {
  passed: { tone: "green", label: "geprüft" },
  corrected: { tone: "amber", label: "korrigiert" },
  failed: { tone: "red", label: "durchgefallen" },
  unchecked: { tone: "neutral", label: "ungeprüft" },
};

interface EditState {
  prompt: string;
  answer: string;
  difficulty: Difficulty;
  points: number;
  estimatedMinutes: number;
  tags: string;
  subQuestions: SubQuestion[];
  steps: SolutionStep[];
}

function toEditState(question: Question): EditState {
  return {
    prompt: question.prompt,
    answer: question.answer,
    difficulty: question.difficulty,
    points: question.points,
    estimatedMinutes: question.estimatedMinutes,
    tags: question.tags.join(", "),
    subQuestions: question.subQuestions.map((sub) => ({ ...sub })),
    steps: question.steps.map((step) => ({
      ...step,
      trick: step.trick ? { ...step.trick } : undefined,
    })),
  };
}

export function QuestionCard({
  question,
  index,
  onArchiveToggle,
  onDelete,
  onSave,
  selected,
  onToggleSelect,
}: {
  question: Question;
  index?: number;
  onArchiveToggle?: (question: Question) => void;
  onDelete?: (question: Question) => void;
  onSave?: (question: Question) => void;
  selected?: boolean;
  onToggleSelect?: (question: Question) => void;
}) {
  const [showSolution, setShowSolution] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState | null>(null);
  const check = question.crossCheck;
  const checkInfo = CHECK_TONES[check?.status ?? "unchecked"];

  function startEdit() {
    setDraft(toEditState(question));
    setEditing(true);
    setShowSolution(true);
  }

  function cancelEdit() {
    setDraft(null);
    setEditing(false);
  }

  function saveEdit() {
    if (!draft || !onSave) return;

    const steps = draft.steps.filter((step) => step.text.trim().length > 0);
    const tricks = steps.flatMap((step) => (step.trick ? [step.trick] : []));
    const subQuestions = draft.subQuestions.filter((sub) => sub.prompt.trim().length > 0);
    const tags = draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    onSave({
      ...question,
      prompt: draft.prompt,
      answer: draft.answer,
      difficulty: draft.difficulty,
      points: draft.points,
      estimatedMinutes: draft.estimatedMinutes,
      tags,
      subQuestions,
      steps,
      tricks,
      updatedAt: new Date().toISOString(),
    });
    setEditing(false);
    setDraft(null);
  }

  function updateDraft(patch: Partial<EditState>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateStep(stepIndex: number, patch: Partial<SolutionStep>) {
    setDraft((current) => {
      if (!current) return current;
      const steps = current.steps.map((step, i) => (i === stepIndex ? { ...step, ...patch } : step));
      return { ...current, steps };
    });
  }

  function toggleStepTrick(stepIndex: number, enabled: boolean) {
    setDraft((current) => {
      if (!current) return current;
      const steps = current.steps.map((step, i) =>
        i === stepIndex
          ? { ...step, trick: enabled ? { label: "", explanation: "", withoutTrick: "" } : undefined }
          : step
      );
      return { ...current, steps };
    });
  }

  function addStep() {
    setDraft((current) =>
      current ? { ...current, steps: [...current.steps, { text: "", latex: "" }] } : current
    );
  }

  function removeStep(stepIndex: number) {
    setDraft((current) =>
      current ? { ...current, steps: current.steps.filter((_, i) => i !== stepIndex) } : current
    );
  }

  function updateSubQuestion(subIndex: number, patch: Partial<SubQuestion>) {
    setDraft((current) => {
      if (!current) return current;
      const subQuestions = current.subQuestions.map((sub, i) =>
        i === subIndex ? { ...sub, ...patch } : sub
      );
      return { ...current, subQuestions };
    });
  }

  function addSubQuestion() {
    setDraft((current) => {
      if (!current) return current;
      const nextLabel = String.fromCharCode(97 + current.subQuestions.length);
      return {
        ...current,
        subQuestions: [
          ...current.subQuestions,
          { label: nextLabel, prompt: "", answer: "", points: 0 },
        ],
      };
    });
  }

  function removeSubQuestion(subIndex: number) {
    setDraft((current) =>
      current ? { ...current, subQuestions: current.subQuestions.filter((_, i) => i !== subIndex) } : current
    );
  }

  return (
    <article
      className={`rounded-xl border p-4 ${
        question.archived
          ? "border-white/5 bg-white/[0.01] opacity-60"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {onToggleSelect ? (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect(question)}
            aria-label={`Aufgabe ${index !== undefined ? index + 1 : ""} auswählen`}
            className="size-4 shrink-0 accent-blue-500"
          />
        ) : null}
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
          {onSave && !editing ? (
            <Button size="sm" variant="ghost" onClick={startEdit}>
              Bearbeiten
            </Button>
          ) : null}
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

      {!editing ? (
        <>
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
        </>
      ) : draft ? (
        <div className="mt-2 space-y-4 border-t border-white/10 pt-3">
          <Field label="Aufgabenstellung">
            <TextArea
              rows={3}
              value={draft.prompt}
              onChange={(event) => updateDraft({ prompt: event.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Schwierigkeit">
              <Select
                value={draft.difficulty}
                onChange={(event) =>
                  updateDraft({ difficulty: Number(event.target.value) as Difficulty })
                }
              >
                {Array.from(
                  { length: DIFFICULTY_MAX - DIFFICULTY_MIN + 1 },
                  (_, i) => (DIFFICULTY_MIN + i) as Difficulty
                ).map((level) => (
                  <option key={level} value={level}>
                    {level} – {DIFFICULTY_LABELS[level]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Punkte">
              <TextInput
                type="number"
                min={0}
                value={draft.points}
                onChange={(event) => updateDraft({ points: Number(event.target.value) || 0 })}
              />
            </Field>
            <Field label="Minuten">
              <TextInput
                type="number"
                min={0}
                value={draft.estimatedMinutes}
                onChange={(event) =>
                  updateDraft({ estimatedMinutes: Number(event.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Tags (Komma-getrennt)">
              <TextInput
                value={draft.tags}
                onChange={(event) => updateDraft({ tags: event.target.value })}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">Teilaufgaben</span>
              <Button size="sm" variant="ghost" onClick={addSubQuestion}>
                + Teilaufgabe
              </Button>
            </div>
            <div className="space-y-2">
              {draft.subQuestions.map((sub, subIndex) => (
                <div
                  key={subIndex}
                  className="flex flex-wrap items-start gap-2 rounded-lg border border-white/10 bg-slate-900/40 p-2"
                >
                  <TextInput
                    value={sub.label}
                    onChange={(event) => updateSubQuestion(subIndex, { label: event.target.value })}
                    className="w-14"
                    aria-label="Bezeichnung"
                  />
                  <TextArea
                    rows={2}
                    value={sub.prompt}
                    onChange={(event) => updateSubQuestion(subIndex, { prompt: event.target.value })}
                    className="min-w-[10rem] flex-1"
                    placeholder="Text der Teilaufgabe"
                  />
                  <TextInput
                    value={sub.answer}
                    onChange={(event) => updateSubQuestion(subIndex, { answer: event.target.value })}
                    className="w-32"
                    placeholder="Ergebnis"
                  />
                  <TextInput
                    type="number"
                    min={0}
                    value={sub.points}
                    onChange={(event) =>
                      updateSubQuestion(subIndex, { points: Number(event.target.value) || 0 })
                    }
                    className="w-20"
                    aria-label="Punkte"
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeSubQuestion(subIndex)}>
                    Entfernen
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Field label="Ergebnis (Ergebnisblatt)">
            <TextArea
              rows={2}
              value={draft.answer}
              onChange={(event) => updateDraft({ answer: event.target.value })}
            />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-200">Lösungsweg</span>
              <Button size="sm" variant="ghost" onClick={addStep}>
                + Schritt
              </Button>
            </div>
            <div className="space-y-3">
              {draft.steps.map((step, stepIndex) => (
                <div
                  key={stepIndex}
                  className="space-y-2 rounded-lg border border-white/10 bg-slate-900/40 p-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-2 shrink-0 text-xs text-slate-500">{stepIndex + 1}.</span>
                    <TextArea
                      rows={2}
                      value={step.text}
                      onChange={(event) => updateStep(stepIndex, { text: event.target.value })}
                      className="flex-1"
                      placeholder="Erklärung"
                    />
                    <Button size="sm" variant="ghost" onClick={() => removeStep(stepIndex)}>
                      Entfernen
                    </Button>
                  </div>
                  <TextInput
                    value={step.latex ?? ""}
                    onChange={(event) => updateStep(stepIndex, { latex: event.target.value })}
                    placeholder="LaTeX (ohne $-Zeichen), optional"
                    className="ml-6"
                  />
                  <label className="ml-6 flex items-center gap-2 text-xs text-amber-200">
                    <input
                      type="checkbox"
                      checked={Boolean(step.trick)}
                      onChange={(event) => toggleStepTrick(stepIndex, event.target.checked)}
                      className="size-3.5 accent-amber-400"
                    />
                    Kniff an diesem Schritt markieren
                  </label>
                  {step.trick ? (
                    <div className="ml-6 space-y-1.5 rounded-lg border-l-4 border-amber-400 bg-amber-500/10 p-2">
                      <TextInput
                        value={step.trick.label}
                        onChange={(event) =>
                          updateStep(stepIndex, { trick: { ...step.trick!, label: event.target.value } })
                        }
                        placeholder="Kurzname des Kniffs"
                      />
                      <TextArea
                        rows={2}
                        value={step.trick.explanation}
                        onChange={(event) =>
                          updateStep(stepIndex, {
                            trick: { ...step.trick!, explanation: event.target.value },
                          })
                        }
                        placeholder="Warum spart das Arbeit?"
                      />
                      <TextInput
                        value={step.trick.withoutTrick ?? ""}
                        onChange={(event) =>
                          updateStep(stepIndex, {
                            trick: { ...step.trick!, withoutTrick: event.target.value },
                          })
                        }
                        placeholder="Ohne Kniff wäre nötig gewesen … (optional)"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="primary" onClick={saveEdit}>
              Speichern
            </Button>
            <Button variant="ghost" onClick={cancelEdit}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
