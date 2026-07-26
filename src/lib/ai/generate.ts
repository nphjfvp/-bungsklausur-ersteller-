"use client";

import type { ChatMessage } from "@/lib/openrouter";
import type { Difficulty, GenerationConfig, Question, TaskType } from "@/types";
import { callModelJson } from "./callModel";
import { asArray } from "./json";
import { normalizeQuestion, type RawQuestion } from "./normalize";
import { buildGenerateSystem, buildGenerateUserMessage } from "./prompts";

interface GenerateResponse {
  questions?: unknown;
}

/** So viele Aufgaben verlangt ein Aufruf höchstens — mehr wird unzuverlässig. */
const BATCH_SIZE = 4;

/**
 * Verteilt n Aufgaben gleichmäßig über den gewählten Schwierigkeitsbereich.
 * Bei 7 Aufgaben von Stufe 3 bis 6 entsteht z.B. 3,3,4,4,5,5,6.
 */
export function spreadDifficulties(
  count: number,
  from: Difficulty,
  to: Difficulty
): Difficulty[] {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const levels = Array.from({ length: high - low + 1 }, (_, i) => (low + i) as Difficulty);

  const result: Difficulty[] = [];
  for (let i = 0; i < count; i++) {
    result.push(levels[i % levels.length]);
  }
  return result.sort((a, b) => a - b);
}

/**
 * Verteilt die Zielmenge auf die Aufgabentypen — häufigere Typen aus der
 * Vorlage bekommen entsprechend mehr Aufgaben, jeder Typ aber mindestens
 * eine.
 */
export function distributeAcrossTypes(
  total: number,
  taskTypes: TaskType[]
): Map<string, number> {
  const quota = new Map<string, number>();
  if (taskTypes.length === 0) return quota;

  const weightSum = taskTypes.reduce((sum, type) => sum + Math.max(1, type.occurrences), 0);
  let assigned = 0;

  for (const type of taskTypes) {
    const share = Math.max(1, Math.floor((total * Math.max(1, type.occurrences)) / weightSum));
    quota.set(type.id, share);
    assigned += share;
  }

  // Rest reihum verteilen bzw. Überhang wieder abziehen.
  const types = [...taskTypes];
  let index = 0;
  while (assigned < total && types.length > 0) {
    const type = types[index % types.length];
    quota.set(type.id, (quota.get(type.id) ?? 0) + 1);
    assigned++;
    index++;
  }
  while (assigned > total) {
    const type = types[index % types.length];
    const current = quota.get(type.id) ?? 0;
    if (current > 1) {
      quota.set(type.id, current - 1);
      assigned--;
    }
    index++;
    // Alle Typen stehen auf 1 — dann bleibt es dabei.
    if (index > types.length * (total + 2)) break;
  }

  return quota;
}

export interface GenerateBatchArgs {
  poolId: string;
  taskType: TaskType;
  difficulties: Difficulty[];
  config: GenerationConfig;
  /** Aufgabenstellungen, die schon im Pool sind — verhindert Dubletten. */
  existingPrompts: string[];
  signal?: AbortSignal;
}

/** Ein einzelner Generierungsaufruf für einen Aufgabentyp. */
export async function generateBatch({
  poolId,
  taskType,
  difficulties,
  config,
  existingPrompts,
  signal,
}: GenerateBatchArgs): Promise<Question[]> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildGenerateSystem(config) },
    {
      role: "user",
      content: buildGenerateUserMessage(taskType, difficulties, config, existingPrompts),
    },
  ];

  const response = await callModelJson<GenerateResponse>(messages, {
    model: config.generatorModel,
    // Etwas Temperatur, sonst ähneln sich die Aufgaben zu stark.
    temperature: 0.75,
    maxTokens: 12000,
    signal,
  });

  return asArray<RawQuestion>(response.questions)
    .map((raw, index) =>
      normalizeQuestion(raw, {
        poolId,
        taskType,
        origin: "generated",
        fallbackDifficulty: difficulties[index] ?? difficulties[0],
      })
    )
    .filter((question): question is Question => question !== null);
}

/** Zerlegt die Wunschmenge eines Typs in Aufrufe von je höchstens BATCH_SIZE. */
export function planBatches(difficulties: Difficulty[]): Difficulty[][] {
  const batches: Difficulty[][] = [];
  for (let i = 0; i < difficulties.length; i += BATCH_SIZE) {
    batches.push(difficulties.slice(i, i + BATCH_SIZE));
  }
  return batches;
}
