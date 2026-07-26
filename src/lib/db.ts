"use client";

import Dexie, { type EntityTable } from "dexie";
import { DEFAULT_CHECKER, DEFAULT_GENERATOR } from "./ai/models";
import type {
  Exam,
  Pool,
  Question,
  Settings,
  SourceDoc,
  TaskType,
} from "@/types";

/**
 * Alle Nutzdaten liegen in IndexedDB. Das ist die einzige Quelle der
 * Wahrheit — einen Server gibt es nicht. Ohne Netz funktioniert deshalb
 * alles außer dem Erzeugen neuer Aufgaben, das direkt aus dem Browser
 * an OpenRouter geht.
 */

/** Vermerk, welche Frage in welcher Klausur schon dran war. */
export interface UsageRecord {
  id: string;
  questionId: string;
  examId: string;
  usedAt: string;
}

/** Grabstein für gelöschte Datensätze, damit Sync das Löschen mitbekommt. */
export interface Tombstone {
  id: string;
  table: string;
  deletedAt: string;
}

class ExamDB extends Dexie {
  pools!: EntityTable<Pool, "id">;
  docs!: EntityTable<SourceDoc, "id">;
  taskTypes!: EntityTable<TaskType, "id">;
  questions!: EntityTable<Question, "id">;
  exams!: EntityTable<Exam, "id">;
  usage!: EntityTable<UsageRecord, "id">;
  settings!: EntityTable<Settings, "id">;
  tombstones!: EntityTable<Tombstone, "id">;

  constructor() {
    super("uebungsklausur-ersteller");
    this.version(1).stores({
      pools: "id, updatedAt, status",
      docs: "id, poolId, addedAt",
      taskTypes: "id, poolId, name",
      questions: "id, poolId, taskTypeId, difficulty, archived, [poolId+taskTypeId], [poolId+difficulty]",
      exams: "id, poolId, createdAt",
      usage: "id, questionId, examId",
      settings: "id",
      tombstones: "id, table, deletedAt",
    });
  }
}

export const db = new ExamDB();

// ── Einstellungen ────────────────────────────────────────────

// Eine Quelle der Wahrheit für die Vorbelegung — die Modellliste selbst
// steht in lib/ai/models.ts.
export const DEFAULT_GENERATOR_MODEL = DEFAULT_GENERATOR;
export const DEFAULT_CHECKER_MODEL = DEFAULT_CHECKER;

const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  openRouterKey: "",
  generatorModel: DEFAULT_GENERATOR_MODEL,
  checkerModel: DEFAULT_CHECKER_MODEL,
  firebase: null,
  syncEnabled: false,
};

export async function getSettings(): Promise<Settings> {
  const stored = await db.settings.get("settings");
  return { ...DEFAULT_SETTINGS, ...stored, id: "settings" };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, id: "settings" as const };
  await db.settings.put(next);
  return next;
}

// ── Schreibhilfen ────────────────────────────────────────────

export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export async function touchPool(poolId: string, patch: Partial<Pool> = {}) {
  await db.pools.update(poolId, { ...patch, updatedAt: new Date().toISOString() });
}

/** Löschen inklusive Grabstein, damit andere Geräte das Löschen übernehmen. */
export async function deleteWithTombstone(table: string, id: string) {
  await db.transaction("rw", db.tombstones, db.table(table), async () => {
    await db.table(table).delete(id);
    await db.tombstones.put({ id: `${table}:${id}`, table, deletedAt: new Date().toISOString() });
  });
}

/** Pool samt allem, was daran hängt, entfernen. */
export async function deletePoolCascade(poolId: string) {
  const questionIds = await db.questions.where("poolId").equals(poolId).primaryKeys();
  const examIds = await db.exams.where("poolId").equals(poolId).primaryKeys();

  await db.transaction(
    "rw",
    [db.pools, db.docs, db.taskTypes, db.questions, db.exams, db.usage, db.tombstones],
    async () => {
      await db.docs.where("poolId").equals(poolId).delete();
      await db.taskTypes.where("poolId").equals(poolId).delete();
      await db.questions.where("poolId").equals(poolId).delete();
      await db.exams.where("poolId").equals(poolId).delete();
      for (const examId of examIds) {
        await db.usage.where("examId").equals(examId).delete();
      }
      await db.pools.delete(poolId);
      await db.tombstones.put({
        id: `pools:${poolId}`,
        table: "pools",
        deletedAt: new Date().toISOString(),
      });
    }
  );

  return { questions: questionIds.length, exams: examIds.length };
}

// ── Export / Import ──────────────────────────────────────────

export interface PoolBundle {
  format: "uebungsklausur-ersteller/pool";
  version: 1;
  exportedAt: string;
  pool: Pool;
  taskTypes: TaskType[];
  questions: Question[];
  exams: Exam[];
}

/**
 * Ein kompletter Pool als eine JSON-Datei. Quelldokumente bleiben
 * absichtlich draußen: sie sind groß, und nach der Analyse braucht
 * sie niemand mehr.
 */
export async function exportPool(poolId: string): Promise<PoolBundle> {
  const pool = await db.pools.get(poolId);
  if (!pool) throw new Error("Pool nicht gefunden");

  return {
    format: "uebungsklausur-ersteller/pool",
    version: 1,
    exportedAt: new Date().toISOString(),
    pool,
    taskTypes: await db.taskTypes.where("poolId").equals(poolId).toArray(),
    questions: await db.questions.where("poolId").equals(poolId).toArray(),
    exams: await db.exams.where("poolId").equals(poolId).toArray(),
  };
}

export async function importPool(bundle: PoolBundle): Promise<string> {
  if (bundle?.format !== "uebungsklausur-ersteller/pool") {
    throw new Error("Unbekanntes Dateiformat");
  }

  // Existiert der Pool schon, wird er als Kopie angelegt statt überschrieben.
  const clash = await db.pools.get(bundle.pool.id);
  const poolId = clash ? newId("pool") : bundle.pool.id;
  const remap = (id: string) => (clash ? `${id}__${poolId}` : id);

  await db.transaction("rw", [db.pools, db.taskTypes, db.questions, db.exams], async () => {
    await db.pools.put({
      ...bundle.pool,
      id: poolId,
      title: clash ? `${bundle.pool.title} (importiert)` : bundle.pool.title,
      updatedAt: new Date().toISOString(),
    });
    await db.taskTypes.bulkPut(
      bundle.taskTypes.map((t) => ({ ...t, id: remap(t.id), poolId }))
    );
    await db.questions.bulkPut(
      bundle.questions.map((q) => ({
        ...q,
        id: remap(q.id),
        poolId,
        taskTypeId: remap(q.taskTypeId),
      }))
    );
    await db.exams.bulkPut(
      (bundle.exams ?? []).map((e) => ({
        ...e,
        id: remap(e.id),
        poolId,
        questionIds: e.questionIds.map(remap),
      }))
    );
  });

  return poolId;
}
