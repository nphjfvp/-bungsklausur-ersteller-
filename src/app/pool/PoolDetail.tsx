"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { QuestionCard } from "@/components/QuestionCard";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Notice,
  Select,
  Spinner,
  TextInput,
} from "@/components/ui";
import { topUpTaskType } from "@/lib/ai/pipeline";
import { db, deleteWithTombstone, exportPool } from "@/lib/db";
import { downloadBlob } from "@/lib/exam/pdf";
import { examHref, homeHref } from "@/lib/routes";
import { DIFFICULTY_LABELS, type Difficulty, type Question, type TaskType } from "@/types";

type SortKey = "type" | "difficulty" | "newest";

export function PoolDetail({ poolId }: { poolId: string }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("type");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [topUpFor, setTopUpFor] = useState<string | null>(null);
  const [topUpCount, setTopUpCount] = useState(5);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pool = useLiveQuery(() => db.pools.get(poolId), [poolId]);
  const taskTypes = useLiveQuery(
    () => db.taskTypes.where("poolId").equals(poolId).toArray(),
    [poolId],
    [] as TaskType[]
  );
  const questions = useLiveQuery(
    () => db.questions.where("poolId").equals(poolId).toArray(),
    [poolId],
    [] as Question[]
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const filtered = questions.filter((question) => {
      if (!showArchived && question.archived) return false;
      if (typeFilter !== "all" && question.taskTypeId !== typeFilter) return false;
      if (needle && !question.prompt.toLowerCase().includes(needle)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "difficulty") return a.difficulty - b.difficulty;
      if (sort === "newest") return b.createdAt.localeCompare(a.createdAt);
      return (
        a.taskTypeName.localeCompare(b.taskTypeName) || a.difficulty - b.difficulty
      );
    });
  }, [questions, typeFilter, showArchived, search, sort]);

  const stats = useMemo(() => {
    const usable = questions.filter((question) => !question.archived);
    const byDifficulty = new Map<Difficulty, number>();
    for (const question of usable) {
      byDifficulty.set(question.difficulty, (byDifficulty.get(question.difficulty) ?? 0) + 1);
    }
    return {
      usable: usable.length,
      archived: questions.length - usable.length,
      tricks: usable.filter((question) => question.tricks.length > 0).length,
      checked: usable.filter((question) => question.crossCheck?.status === "passed").length,
      byDifficulty,
    };
  }, [questions]);

  async function handleTopUp(taskType: TaskType) {
    if (!pool) return;
    setError(null);
    setMessage(null);
    setTopUpFor(taskType.id);

    try {
      const created = await topUpTaskType(pool, taskType, topUpCount);
      setMessage(`${created.length} neue Aufgaben zu „${taskType.name}“ erzeugt.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTopUpFor(null);
    }
  }

  async function handleExport() {
    const bundle = await exportPool(poolId);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${bundle.pool.title.replace(/[^\w-]+/g, "_")}.pool.json`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{pool.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{pool.subject}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue">{stats.usable} Aufgaben</Badge>
            <Badge>{taskTypes.length} Typen</Badge>
            {stats.tricks > 0 ? <Badge tone="amber">{stats.tricks} mit Kniffen</Badge> : null}
            {stats.checked > 0 ? <Badge tone="green">{stats.checked} geprüft</Badge> : null}
            {stats.archived > 0 ? <Badge tone="red">{stats.archived} aussortiert</Badge> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleExport()}>Als Datei exportieren</Button>
          <a
            href={examHref(poolId)}
            className="inline-flex items-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            Klausur bauen
          </a>
        </div>
      </div>

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-white">Aufgabentypen</h2>
        {taskTypes.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Typen erkannt.</p>
        ) : (
          <ul className="space-y-3">
            {taskTypes.map((taskType) => {
              const own = questions.filter(
                (question) => question.taskTypeId === taskType.id && !question.archived
              );

              return (
                <li
                  key={taskType.id}
                  className="rounded-lg border border-white/10 bg-slate-900/40 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-100">{taskType.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{taskType.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={own.length === 0 ? "red" : "neutral"}>
                        {own.length} Aufgaben
                      </Badge>
                      <Button
                        size="sm"
                        disabled={topUpFor !== null}
                        onClick={() => void handleTopUp(taskType)}
                      >
                        {topUpFor === taskType.id ? <Spinner /> : null}
                        {topUpFor === taskType.id ? "Erzeugt …" : `+${topUpCount} nachlegen`}
                      </Button>
                    </div>
                  </div>

                  {own.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...new Set(own.map((question) => question.difficulty))]
                        .sort((a, b) => a - b)
                        .map((level) => (
                          <span
                            key={level}
                            title={DIFFICULTY_LABELS[level]}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-300"
                          >
                            Stufe {level}:{" "}
                            {own.filter((question) => question.difficulty === level).length}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <Field label="Wie viele je Klick nachlegen?" className="mt-4 max-w-[12rem]">
          <TextInput
            type="number"
            min={1}
            max={20}
            value={topUpCount}
            onChange={(event) => setTopUpCount(Math.max(1, Number(event.target.value) || 1))}
          />
        </Field>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Aufgabentyp" className="min-w-[14rem] flex-1">
            <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Alle Typen</option>
              {taskTypes.map((taskType) => (
                <option key={taskType.id} value={taskType.id}>
                  {taskType.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sortierung" className="w-40">
            <Select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="type">Nach Typ</option>
              <option value="difficulty">Nach Schwierigkeit</option>
              <option value="newest">Neueste zuerst</option>
            </Select>
          </Field>

          <Field label="Suche" className="min-w-[12rem] flex-1">
            <TextInput
              value={search}
              placeholder="Text in der Aufgabenstellung"
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>

          <Button
            variant={showArchived ? "primary" : "secondary"}
            onClick={() => setShowArchived((value) => !value)}
          >
            Aussortierte {showArchived ? "ausblenden" : "zeigen"}
          </Button>
        </div>

        {visible.length === 0 ? (
          <EmptyState title="Keine Aufgaben für diese Auswahl" />
        ) : (
          <div className="space-y-4">
            {visible.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                onArchiveToggle={(target) =>
                  void db.questions.update(target.id, {
                    archived: !target.archived,
                    updatedAt: new Date().toISOString(),
                  })
                }
                onDelete={(target) => {
                  if (window.confirm("Diese Aufgabe endgültig löschen?")) {
                    // Mit Grabstein, damit andere Geräte beim Abgleich
                    // nicht die gelöschte Aufgabe zurückschieben.
                    void deleteWithTombstone("questions", target.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
