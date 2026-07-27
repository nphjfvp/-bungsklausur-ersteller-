"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Button, Card, EmptyState, Notice, ProgressBar } from "@/components/ui";
import { db, deletePoolCascade, importPool, type PoolBundle } from "@/lib/db";
import { examHref, newPoolHref, poolHref } from "@/lib/routes";
import type { PoolStatus } from "@/types";

const STATUS_LABELS: Record<PoolStatus, { label: string; tone: "neutral" | "blue" | "green" | "amber" | "red" }> = {
  draft: { label: "Entwurf", tone: "neutral" },
  analyzing: { label: "Analysiert …", tone: "blue" },
  generating: { label: "Erzeugt Aufgaben …", tone: "blue" },
  checking: { label: "Gegenprüfung …", tone: "blue" },
  ready: { label: "Bereit", tone: "green" },
  error: { label: "Fehler", tone: "red" },
};

export function PoolList() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const pools = useLiveQuery(
    () => db.pools.orderBy("updatedAt").reverse().toArray(),
    [],
    undefined
  );

  const counts = useLiveQuery(async () => {
    const questions = await db.questions.toArray();
    const map = new Map<string, { total: number; usable: number }>();
    for (const question of questions) {
      const entry = map.get(question.poolId) ?? { total: 0, usable: 0 };
      entry.total++;
      if (!question.archived) entry.usable++;
      map.set(question.poolId, entry);
    }
    return map;
  }, [], new Map<string, { total: number; usable: number }>());

  async function handleImport(file: File) {
    setError(null);
    setMessage(null);
    try {
      const bundle = JSON.parse(await file.text()) as PoolBundle;
      await importPool(bundle);
      setMessage(`„${bundle.pool.title}“ wurde importiert.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function handleDelete(poolId: string, title: string) {
    if (!window.confirm(`„${title}“ mit allen Aufgaben und Klausuren löschen?`)) return;
    const removed = await deletePoolCascade(poolId);
    setMessage(`„${title}“ gelöscht (${removed.questions} Aufgaben, ${removed.exams} Klausuren).`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Fragenpools</h1>
          <p className="mt-1 text-sm text-slate-400">
            Ein Pool je Fach oder Klausur. Aus dem Pool baust du dann beliebig viele
            Klausuren — auch ohne Internet.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              event.target.value = "";
            }}
          />
          <Button onClick={() => importRef.current?.click()}>Pool importieren</Button>
          <a
            href={newPoolHref()}
            className="inline-flex items-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            Neuer Pool
          </a>
        </div>
      </div>

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {pools === undefined ? (
        <p className="text-sm text-slate-400">Wird geladen …</p>
      ) : pools.length === 0 ? (
        <EmptyState title="Noch kein Fragenpool vorhanden">
          Lade eine Übungsklausur hoch, und die App leitet daraus einen ganzen Aufgabenvorrat
          ab. <a href={newPoolHref()} className="text-blue-300 underline">Jetzt anlegen</a>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {pools.map((pool) => {
            const status = STATUS_LABELS[pool.status];
            const count = counts?.get(pool.id) ?? { total: 0, usable: 0 };
            const busy = ["analyzing", "generating", "checking"].includes(pool.status);

            return (
              <li key={pool.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={poolHref(pool.id)}
                        className="block truncate text-lg font-semibold text-white hover:text-blue-300"
                      >
                        {pool.title}
                      </a>
                      <p className="truncate text-sm text-slate-400">{pool.subject}</p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                    <Badge>{count.usable} Aufgaben</Badge>
                    {count.total !== count.usable ? (
                      <Badge tone="amber">{count.total - count.usable} aussortiert</Badge>
                    ) : null}
                    <Badge>Stufe {pool.config.difficultyFrom}–{pool.config.difficultyTo}</Badge>
                    {pool.config.emphasizeTricks ? <Badge tone="amber">Kniffe</Badge> : null}
                  </div>

                  {busy ? (
                    <div className="mt-3">
                      <ProgressBar done={pool.progress.done} total={pool.progress.total} />
                      <p className="mt-1 text-xs text-slate-400">{pool.progress.label}</p>
                    </div>
                  ) : null}

                  {pool.lastError ? (
                    <p className="mt-3 text-xs text-red-300">{pool.lastError}</p>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <a
                      href={examHref(pool.id)}
                      className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-400"
                    >
                      Klausur bauen
                    </a>
                    <a
                      href={poolHref(pool.id)}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-white/20"
                    >
                      Aufgaben ansehen
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => void handleDelete(pool.id, pool.title)}
                    >
                      Löschen
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
