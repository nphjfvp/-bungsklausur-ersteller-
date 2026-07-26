"use client";

import type { ChatMessage } from "@/lib/openrouter";
import type { CheckStatus, Question, TaskType, TrickMark } from "@/types";
import { callModelJson } from "./callModel";
import { asArray, asString } from "./json";
import { normalizeQuestion, type RawQuestion } from "./normalize";
import { CROSSCHECK_SYSTEM, buildCrossCheckUserMessage } from "./prompts";

interface CrossCheckResponse {
  status?: unknown;
  verdict?: unknown;
  issues?: unknown;
  correction?: unknown;
}

function toStatus(value: unknown): CheckStatus {
  const raw = asString(value).trim().toLowerCase();
  if (raw === "passed" || raw === "ok" || raw === "correct") return "passed";
  if (raw === "corrected" || raw === "fixed") return "corrected";
  if (raw === "failed" || raw === "broken") return "failed";
  return "unchecked";
}

/**
 * Schritt 3: Ein zweites Modell rechnet die Aufgabe nach. Ergebnis ist
 * die geprüfte — und bei Bedarf reparierte — Frage. Die ursprüngliche ID
 * bleibt erhalten, damit Verweise aus bereits gebauten Klausuren halten.
 */
export async function crossCheckQuestion(
  question: Question,
  taskType: TaskType | undefined,
  checkerModel: string,
  signal?: AbortSignal
): Promise<Question> {
  const messages: ChatMessage[] = [
    { role: "system", content: CROSSCHECK_SYSTEM },
    { role: "user", content: buildCrossCheckUserMessage(question, taskType) },
  ];

  const response = await callModelJson<CrossCheckResponse>(messages, {
    model: checkerModel,
    temperature: 0.1,
    maxTokens: 12000,
    signal,
  });

  const status = toStatus(response.status);
  const issues = asArray<unknown>(response.issues)
    .map((issue) => asString(issue).trim())
    .filter(Boolean);

  const check = {
    status: status === "unchecked" ? ("passed" as CheckStatus) : status,
    model: checkerModel,
    issues,
    verdict: asString(response.verdict).trim(),
    checkedAt: new Date().toISOString(),
  };

  if (check.status !== "corrected" || !response.correction) {
    return { ...question, crossCheck: check, updatedAt: new Date().toISOString() };
  }

  // Korrigierte Fassung übernehmen, aber Identität und Zuordnung behalten.
  const repaired = normalizeQuestion(response.correction as RawQuestion, {
    poolId: question.poolId,
    taskType: {
      id: question.taskTypeId,
      name: question.taskTypeName,
      typicalPoints: question.points,
    },
    origin: question.origin,
    sourceDocId: question.sourceDocId,
    fallbackDifficulty: question.difficulty,
  });

  if (!repaired) {
    return {
      ...question,
      crossCheck: { ...check, status: "failed" as CheckStatus },
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    ...repaired,
    id: question.id,
    createdAt: question.createdAt,
    updatedAt: new Date().toISOString(),
    tricks: repaired.steps
      .map((step) => step.trick)
      .filter((trick): trick is TrickMark => Boolean(trick)),
    crossCheck: check,
  };
}
