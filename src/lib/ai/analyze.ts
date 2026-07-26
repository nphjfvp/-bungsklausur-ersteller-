"use client";

import type { ChatMessage, ContentPart } from "@/lib/openrouter";
import type { Question, SourceDoc, TaskType } from "@/types";
import { callModelJson } from "./callModel";
import { asArray, asString } from "./json";
import {
  normalizeQuestion,
  normalizeTaskType,
  type RawQuestion,
  type RawTaskType,
} from "./normalize";
import { ANALYZE_SYSTEM, buildAnalyzeUserMessage } from "./prompts";

interface AnalyzeResponse {
  subject?: unknown;
  taskTypes?: unknown;
  questions?: unknown;
}

export interface AnalyzeResult {
  subject: string;
  taskTypes: TaskType[];
  /** Die wörtlich aus den Vorlagen extrahierten Aufgaben. */
  questions: Question[];
}

/**
 * Schritt 1: Aus den hochgeladenen Dokumenten die Aufgabentypen ableiten
 * und die enthaltenen Aufgaben extrahieren. Bilder werden mitgeschickt,
 * damit auch abfotografierte oder gescannte Klausuren funktionieren.
 */
export async function analyzeDocuments(
  docs: SourceDoc[],
  poolId: string,
  model: string,
  notes: string,
  signal?: AbortSignal
): Promise<AnalyzeResult> {
  if (docs.length === 0) throw new Error("Keine Dokumente zum Analysieren.");

  const parts: ContentPart[] = [{ type: "text", text: buildAnalyzeUserMessage(docs, notes) }];

  // Vision-Modelle vertragen nur begrenzt viele Bilder; 12 Seiten reichen,
  // um Stil und Niveau zu erfassen.
  for (const image of docs.flatMap((doc) => doc.images).slice(0, 12)) {
    parts.push({ type: "image_url", image_url: { url: image } });
  }

  const messages: ChatMessage[] = [
    { role: "system", content: ANALYZE_SYSTEM },
    { role: "user", content: parts },
  ];

  const response = await callModelJson<AnalyzeResponse>(messages, {
    model,
    temperature: 0.2,
    maxTokens: 16000,
    signal,
  });

  const taskTypes = asArray<RawTaskType>(response.taskTypes)
    .map((raw) => normalizeTaskType(raw, poolId))
    .filter((type): type is TaskType => type !== null);

  if (taskTypes.length === 0) {
    throw new Error(
      "Es wurden keine Aufgabentypen erkannt. Enthält das Material wirklich Aufgaben?"
    );
  }

  const byName = new Map(taskTypes.map((type) => [type.name.toLowerCase(), type]));

  const questions = asArray<RawQuestion>(response.questions)
    .map((raw) => {
      // Ordnet das Modell eine Aufgabe einem unbekannten Typ zu, landet
      // sie beim ersten Typ statt verloren zu gehen.
      const wanted = asString(raw.taskTypeName).trim().toLowerCase();
      const taskType = byName.get(wanted) ?? taskTypes[0];

      return normalizeQuestion(raw, {
        poolId,
        taskType,
        origin: "extracted",
        sourceDocId: docs[0]?.id,
        fallbackDifficulty: taskType.referenceDifficulty,
      });
    })
    .filter((question): question is Question => question !== null);

  return {
    subject: asString(response.subject).trim() || "Unbekanntes Fach",
    taskTypes,
    questions,
  };
}
