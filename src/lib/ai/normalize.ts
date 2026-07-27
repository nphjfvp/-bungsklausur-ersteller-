import { newId } from "@/lib/db";
import {
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  DIFFICULTY_REFERENCE,
  type Difficulty,
  type Question,
  type QuestionOrigin,
  type SolutionStep,
  type SubQuestion,
  type TaskType,
  type TrickMark,
} from "@/types";
import { asArray, asNumber, asString } from "./json";

/**
 * Modelle halten sich nie ganz an ein Schema: mal fehlt ein Feld, mal
 * ist die Schwierigkeit ein String, mal kommen die Schritte als reine
 * Textliste. Hier wird alles in ein sauberes Question-Objekt gebogen,
 * damit der Rest der App sich auf die Typen verlassen kann.
 */

export interface RawQuestion {
  taskTypeName?: unknown;
  difficulty?: unknown;
  prompt?: unknown;
  subQuestions?: unknown;
  answer?: unknown;
  steps?: unknown;
  points?: unknown;
  estimatedMinutes?: unknown;
  tags?: unknown;
}

export function clampDifficulty(value: unknown): Difficulty {
  const rounded = Math.round(asNumber(value, DIFFICULTY_REFERENCE));
  const clamped = Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, rounded));
  return clamped as Difficulty;
}

function normalizeTrick(value: unknown): TrickMark | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const label = asString(record.label).trim();
  if (!label) return undefined;

  return {
    label,
    explanation: asString(record.explanation).trim(),
    withoutTrick: asString(record.withoutTrick).trim() || undefined,
  };
}

function normalizeSteps(value: unknown): SolutionStep[] {
  return asArray<unknown>(value)
    .map((entry): SolutionStep | null => {
      // Manche Modelle liefern die Schritte als reine Strings.
      if (typeof entry === "string") {
        const text = entry.trim();
        return text ? { text } : null;
      }
      if (!entry || typeof entry !== "object") return null;

      const record = entry as Record<string, unknown>;
      const text = asString(record.text ?? record.explanation ?? record.description).trim();
      const latex = asString(record.latex ?? record.formula).trim();
      if (!text && !latex) return null;

      return {
        text,
        latex: latex || undefined,
        trick: normalizeTrick(record.trick),
      };
    })
    .filter((step): step is SolutionStep => step !== null);
}

function normalizeSubQuestions(value: unknown): SubQuestion[] {
  return asArray<unknown>(value)
    .map((entry, index): SubQuestion | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const prompt = asString(record.prompt ?? record.question).trim();
      if (!prompt) return null;

      return {
        label: asString(record.label, String.fromCharCode(97 + index)).trim(),
        prompt,
        answer: asString(record.answer).trim(),
        points: Math.max(0, asNumber(record.points, 0)),
      };
    })
    .filter((sub): sub is SubQuestion => sub !== null);
}

function normalizeTags(value: unknown): string[] {
  return asArray<unknown>(value)
    .map((tag) => asString(tag).trim())
    .filter(Boolean)
    .slice(0, 8);
}

export interface NormalizeContext {
  poolId: string;
  taskType: Pick<TaskType, "id" | "name" | "typicalPoints">;
  origin: QuestionOrigin;
  sourceDocId?: string;
  /** Fällt die Schwierigkeit im Payload aus, gilt dieser Wert. */
  fallbackDifficulty?: Difficulty;
}

/** Gibt null zurück, wenn die Rohdaten unbrauchbar sind. */
export function normalizeQuestion(
  raw: RawQuestion,
  context: NormalizeContext
): Question | null {
  const prompt = asString(raw.prompt).trim();
  if (!prompt) return null;

  const subQuestions = normalizeSubQuestions(raw.subQuestions);
  const steps = normalizeSteps(raw.steps);

  // Punkte: bevorzugt die Summe der Teilaufgaben, sonst die Angabe des
  // Modells, sonst der Erfahrungswert des Aufgabentyps.
  const subPoints = subQuestions.reduce((sum, sub) => sum + sub.points, 0);
  const points =
    subPoints > 0
      ? subPoints
      : Math.max(1, Math.round(asNumber(raw.points, context.taskType.typicalPoints || 6)));

  const answer =
    asString(raw.answer).trim() ||
    subQuestions.map((sub) => `${sub.label}) ${sub.answer}`).join("; ") ||
    steps.at(-1)?.text ||
    "";

  const now = new Date().toISOString();

  return {
    id: newId("q"),
    poolId: context.poolId,
    taskTypeId: context.taskType.id,
    taskTypeName: context.taskType.name,
    difficulty:
      raw.difficulty === undefined || raw.difficulty === null
        ? context.fallbackDifficulty ?? DIFFICULTY_REFERENCE
        : clampDifficulty(raw.difficulty),
    prompt,
    subQuestions,
    answer,
    steps,
    tricks: steps
      .map((step) => step.trick)
      .filter((trick): trick is TrickMark => Boolean(trick)),
    points,
    estimatedMinutes: Math.max(1, Math.round(asNumber(raw.estimatedMinutes, points * 1.5))),
    origin: context.origin,
    sourceDocId: context.sourceDocId,
    tags: normalizeTags(raw.tags),
    archived: false,
    mastery: "red",
    createdAt: now,
    updatedAt: now,
  };
}

export interface RawTaskType {
  name?: unknown;
  description?: unknown;
  pattern?: unknown;
  prerequisites?: unknown;
  occurrences?: unknown;
  typicalPoints?: unknown;
  referenceDifficulty?: unknown;
  examples?: unknown;
}

export function normalizeTaskType(raw: RawTaskType, poolId: string): TaskType | null {
  const name = asString(raw.name).trim();
  if (!name) return null;

  return {
    id: newId("tt"),
    poolId,
    name,
    description: asString(raw.description).trim(),
    pattern: asString(raw.pattern).trim(),
    prerequisites: asArray<unknown>(raw.prerequisites)
      .map((item) => asString(item).trim())
      .filter(Boolean),
    occurrences: Math.max(1, Math.round(asNumber(raw.occurrences, 1))),
    typicalPoints: Math.max(1, Math.round(asNumber(raw.typicalPoints, 6))),
    referenceDifficulty: clampDifficulty(raw.referenceDifficulty ?? DIFFICULTY_REFERENCE),
    examples: asArray<unknown>(raw.examples)
      .map((item) => asString(item).trim())
      .filter(Boolean)
      .slice(0, 4),
    createdAt: new Date().toISOString(),
  };
}
