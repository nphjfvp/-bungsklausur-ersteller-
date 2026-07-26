"use client";

import { db, touchPool } from "@/lib/db";
import type { Pool, Question, SourceDoc, TaskType } from "@/types";
import { analyzeDocuments } from "./analyze";
import { crossCheckQuestion } from "./crosscheck";
import { distributeAcrossTypes, generateBatch, planBatches, spreadDifficulties } from "./generate";

/**
 * Der komplette Bau eines Fragenpools als ein Ablauf, den die UI nur noch
 * starten und beobachten muss. Jeder Zwischenstand wird sofort in
 * IndexedDB geschrieben: bricht der Lauf ab, ist das bisher Erzeugte
 * trotzdem da.
 */

export interface ProgressUpdate {
  phase: "analyze" | "generate" | "check" | "done";
  done: number;
  total: number;
  label: string;
}

export type ProgressHandler = (update: ProgressUpdate) => void;

/** Wie viele KI-Aufrufe gleichzeitig laufen dürfen. */
const CONCURRENCY = 3;

/** Führt Aufgaben mit begrenzter Parallelität aus, in Eingabereihenfolge. */
async function runPooled<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number,
  onSettled?: () => void
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  async function pump(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
      onSettled?.();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pump));
  return results;
}

export interface BuildResult {
  taskTypes: number;
  extracted: number;
  generated: number;
  checked: number;
  failed: number;
  /** Fehler, die einzelne Teilschritte betrafen, den Lauf aber nicht stoppten. */
  warnings: string[];
}

export async function buildPool(
  pool: Pool,
  docs: SourceDoc[],
  onProgress: ProgressHandler,
  signal?: AbortSignal
): Promise<BuildResult> {
  const { config } = pool;
  const warnings: string[] = [];
  const result: BuildResult = {
    taskTypes: 0,
    extracted: 0,
    generated: 0,
    checked: 0,
    failed: 0,
    warnings,
  };

  const report = async (update: ProgressUpdate) => {
    onProgress(update);
    await touchPool(pool.id, {
      progress: { done: update.done, total: update.total, label: update.label },
    });
  };

  // ── Phase 1: Analyse ───────────────────────────────────────
  let taskTypes: TaskType[] = await db.taskTypes.where("poolId").equals(pool.id).toArray();

  const needsAnalysis = taskTypes.length === 0;
  if (needsAnalysis) {
    if (docs.length === 0) {
      throw new Error(
        "Ohne hochgeladenes Material weiß die App nicht, welche Aufgabentypen es gibt."
      );
    }

    await touchPool(pool.id, { status: "analyzing" });
    await report({ phase: "analyze", done: 0, total: 1, label: "Material wird analysiert …" });

    const analysis = await analyzeDocuments(
      docs,
      pool.id,
      config.generatorModel,
      config.notes,
      signal
    );

    taskTypes = analysis.taskTypes;
    await db.taskTypes.bulkPut(taskTypes);

    if (config.mode !== "generate-only" && analysis.questions.length > 0) {
      await db.questions.bulkPut(analysis.questions);
      result.extracted = analysis.questions.length;
    }

    await touchPool(pool.id, { subject: analysis.subject });
    await report({
      phase: "analyze",
      done: 1,
      total: 1,
      label: `${taskTypes.length} Aufgabentypen erkannt, ${result.extracted} Aufgaben übernommen`,
    });
  }

  result.taskTypes = taskTypes.length;

  // ── Phase 2: Generierung ───────────────────────────────────
  if (config.mode !== "extract-only") {
    await touchPool(pool.id, { status: "generating" });

    // Bereits extrahierte Aufgaben zählen auf das Ziel ein.
    const alreadyThere =
      config.mode === "extract-and-generate"
        ? await db.questions.where("poolId").equals(pool.id).count()
        : 0;
    const missing = Math.max(0, config.targetCount - alreadyThere);

    if (missing > 0) {
      const quota = distributeAcrossTypes(missing, taskTypes);

      // Alle Aufrufe vorab planen, damit der Fortschritt eine echte
      // Gesamtzahl kennt.
      const jobs = taskTypes.flatMap((taskType) => {
        const count = quota.get(taskType.id) ?? 0;
        if (count === 0) return [];
        const difficulties = spreadDifficulties(
          count,
          config.difficultyFrom,
          config.difficultyTo
        );
        return planBatches(difficulties).map((batch) => ({ taskType, batch }));
      });

      let done = 0;
      await report({
        phase: "generate",
        done,
        total: jobs.length,
        label: `${missing} Aufgaben werden erzeugt …`,
      });

      const outcomes = await runPooled(
        jobs,
        async ({ taskType, batch }) => {
          signal?.throwIfAborted();

          const existingPrompts = (
            await db.questions.where("[poolId+taskTypeId]").equals([pool.id, taskType.id]).toArray()
          ).map((question) => question.prompt);

          const questions = await generateBatch({
            poolId: pool.id,
            taskType,
            difficulties: batch,
            config,
            existingPrompts,
            signal,
          });

          await db.questions.bulkPut(questions);
          return questions.length;
        },
        CONCURRENCY,
        () => {
          done++;
          void report({
            phase: "generate",
            done,
            total: jobs.length,
            label: `Aufgaben werden erzeugt … (${done}/${jobs.length} Durchläufe)`,
          });
        }
      );

      for (const [index, outcome] of outcomes.entries()) {
        if (outcome.status === "fulfilled") {
          result.generated += outcome.value;
        } else {
          const reason =
            outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          warnings.push(`Typ „${jobs[index].taskType.name}“: ${reason}`);
        }
      }
    }
  }

  // ── Phase 3: Gegenprüfung ──────────────────────────────────
  if (config.crossCheck) {
    await touchPool(pool.id, { status: "checking" });

    const pending = (await db.questions.where("poolId").equals(pool.id).toArray()).filter(
      (question) => !question.crossCheck
    );

    let done = 0;
    await report({
      phase: "check",
      done,
      total: pending.length,
      label: `${pending.length} Aufgaben werden gegengeprüft …`,
    });

    const typeById = new Map(taskTypes.map((type) => [type.id, type]));

    const outcomes = await runPooled(
      pending,
      async (question) => {
        signal?.throwIfAborted();
        const checked = await crossCheckQuestion(
          question,
          typeById.get(question.taskTypeId),
          config.checkerModel,
          signal
        );
        // Als unrettbar eingestufte Aufgaben bleiben erhalten, werden
        // aber nie in eine Klausur gezogen.
        await db.questions.put({
          ...checked,
          archived: checked.crossCheck?.status === "failed",
        });
        return checked.crossCheck?.status ?? "unchecked";
      },
      CONCURRENCY,
      () => {
        done++;
        void report({
          phase: "check",
          done,
          total: pending.length,
          label: `Gegenprüfung … (${done}/${pending.length})`,
        });
      }
    );

    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        result.checked++;
        if (outcome.value === "failed") result.failed++;
      } else {
        const reason =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        warnings.push(`Gegenprüfung fehlgeschlagen: ${reason}`);
      }
    }
  }

  const total = await db.questions.where("poolId").equals(pool.id).count();
  await touchPool(pool.id, { status: "ready", lastError: undefined });
  await report({ phase: "done", done: total, total, label: `${total} Aufgaben im Pool` });

  return result;
}

/** Erzeugt gezielt Nachschub für einen einzelnen Aufgabentyp. */
export async function topUpTaskType(
  pool: Pool,
  taskType: TaskType,
  count: number,
  signal?: AbortSignal
): Promise<Question[]> {
  const difficulties = spreadDifficulties(
    count,
    pool.config.difficultyFrom,
    pool.config.difficultyTo
  );

  const existingPrompts = (
    await db.questions.where("[poolId+taskTypeId]").equals([pool.id, taskType.id]).toArray()
  ).map((question) => question.prompt);

  const created: Question[] = [];
  for (const batch of planBatches(difficulties)) {
    signal?.throwIfAborted();
    const questions = await generateBatch({
      poolId: pool.id,
      taskType,
      difficulties: batch,
      config: pool.config,
      existingPrompts: [...existingPrompts, ...created.map((q) => q.prompt)],
      signal,
    });
    await db.questions.bulkPut(questions);
    created.push(...questions);
  }

  await touchPool(pool.id);
  return created;
}
