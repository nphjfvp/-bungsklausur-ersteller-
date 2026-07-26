"use client";

import { db, newId } from "@/lib/db";
import type { Difficulty, Exam, ExamConfig, Question } from "@/types";

/**
 * Das Zusammenstellen einer Klausur ist bewusst reine Rechenarbeit ohne
 * Netzzugriff: Es wird nur aus dem bereits vorhandenen Pool gezogen.
 * Deshalb funktioniert dieser Teil auch im Flugmodus.
 */

/** Kleiner deterministischer Zufallsgenerator (mulberry32). */
function createRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export interface AssembleResult {
  questions: Question[];
  totalPoints: number;
  estimatedMinutes: number;
  /** Zeilen, für die der Pool nicht genug hergab. */
  shortfalls: { taskTypeName: string; wanted: number; got: number }[];
}

/**
 * Zieht die Aufgaben für eine Klausur. Innerhalb einer Zeile wird über
 * die Schwierigkeitsstufen gestreut, damit nicht alle Aufgaben am
 * unteren Rand des gewählten Bereichs landen.
 */
export async function assembleExam(
  poolId: string,
  config: ExamConfig
): Promise<AssembleResult> {
  const random = createRandom(config.seed);

  const pool = (await db.questions.where("poolId").equals(poolId).toArray()).filter(
    (question) => !question.archived
  );

  const usedIds = config.avoidUsed
    ? new Set((await db.usage.toArray()).map((record) => record.questionId))
    : new Set<string>();

  const picked: Question[] = [];
  const takenIds = new Set<string>();
  const shortfalls: AssembleResult["shortfalls"] = [];

  for (const row of config.rows) {
    if (row.count <= 0) continue;

    const low = Math.min(row.difficultyFrom, row.difficultyTo);
    const high = Math.max(row.difficultyFrom, row.difficultyTo);

    const candidates = pool.filter(
      (question) =>
        question.taskTypeId === row.taskTypeId &&
        question.difficulty >= low &&
        question.difficulty <= high &&
        !takenIds.has(question.id)
    );

    // Nach Stufe gruppieren und reihum ziehen — das verteilt die
    // Schwierigkeit gleichmäßig über die gewünschte Spanne.
    const byLevel = new Map<Difficulty, Question[]>();
    for (const question of candidates) {
      const bucket = byLevel.get(question.difficulty) ?? [];
      bucket.push(question);
      byLevel.set(question.difficulty, bucket);
    }
    for (const [level, bucket] of byLevel) {
      // Ungenutzte Aufgaben zuerst, danach erst schon gedruckte.
      const shuffled = shuffle(bucket, random);
      byLevel.set(
        level,
        [
          ...shuffled.filter((question) => !usedIds.has(question.id)),
          ...shuffled.filter((question) => usedIds.has(question.id)),
        ]
      );
    }

    const levels = [...byLevel.keys()].sort((a, b) => a - b);
    const rowPicks: Question[] = [];
    let cursor = 0;

    while (rowPicks.length < row.count && levels.length > 0) {
      const level = levels[cursor % levels.length];
      const bucket = byLevel.get(level)!;
      const question = bucket.shift();

      if (question) {
        rowPicks.push(question);
        takenIds.add(question.id);
      }
      if (!bucket || bucket.length === 0) {
        levels.splice(cursor % levels.length, 1);
        if (levels.length === 0) break;
      } else {
        cursor++;
      }
    }

    if (rowPicks.length < row.count) {
      shortfalls.push({
        taskTypeName: row.taskTypeName,
        wanted: row.count,
        got: rowPicks.length,
      });
    }

    picked.push(...rowPicks);
  }

  const questions = config.sortByDifficulty
    ? [...picked].sort((a, b) => a.difficulty - b.difficulty)
    : picked;

  return {
    questions,
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    estimatedMinutes: questions.reduce((sum, question) => sum + question.estimatedMinutes, 0),
    shortfalls,
  };
}

/** Legt die Klausur ab und merkt sich, welche Aufgaben verbraucht wurden. */
export async function saveExam(
  poolId: string,
  config: ExamConfig,
  questions: Question[]
): Promise<Exam> {
  const exam: Exam = {
    id: newId("exam"),
    poolId,
    config,
    questionIds: questions.map((question) => question.id),
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    createdAt: new Date().toISOString(),
  };

  await db.transaction("rw", [db.exams, db.usage], async () => {
    await db.exams.put(exam);
    await db.usage.bulkPut(
      questions.map((question) => ({
        id: `${exam.id}:${question.id}`,
        questionId: question.id,
        examId: exam.id,
        usedAt: exam.createdAt,
      }))
    );
  });

  return exam;
}
