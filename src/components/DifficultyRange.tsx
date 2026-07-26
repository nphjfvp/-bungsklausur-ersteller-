"use client";

import {
  DIFFICULTY_LABELS,
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  DIFFICULTY_REFERENCE,
  type Difficulty,
} from "@/types";

/**
 * Der Schwierigkeitsregler. Die Mitte (Stufe 5) ist definitionsgemäß das
 * Niveau der hochgeladenen Klausur; nach links wird es leichter, nach
 * rechts schwerer. Der Nutzer wählt eine Spanne, keinen Einzelwert.
 */

const SPAN = DIFFICULTY_MAX - DIFFICULTY_MIN;

function percent(value: number): number {
  return ((value - DIFFICULTY_MIN) / SPAN) * 100;
}

export function DifficultyRange({
  from,
  to,
  onChange,
  idPrefix = "difficulty",
}: {
  from: Difficulty;
  to: Difficulty;
  onChange: (from: Difficulty, to: Difficulty) => void;
  idPrefix?: string;
}) {
  const low = Math.min(from, to) as Difficulty;
  const high = Math.max(from, to) as Difficulty;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-100">
          {low === high
            ? DIFFICULTY_LABELS[low]
            : `${DIFFICULTY_LABELS[low]} → ${DIFFICULTY_LABELS[high]}`}
        </span>
        <span className="text-xs text-slate-400">
          Stufe {low}–{high} von {DIFFICULTY_MAX}
        </span>
      </div>

      <div className="relative">
        {/* Schiene mit hervorgehobenem gewähltem Bereich */}
        <div className="pointer-events-none absolute inset-x-0 top-[11px] h-1.5 rounded-full bg-white/10">
          <div
            className="absolute h-full rounded-full bg-blue-500"
            style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }}
          />
          {/* Markierung für „wie die Vorlage“ */}
          <div
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-slate-300/70"
            style={{ left: `${percent(DIFFICULTY_REFERENCE)}%` }}
          />
        </div>

        <div className="range-dual">
          <input
            id={`${idPrefix}-from`}
            type="range"
            min={DIFFICULTY_MIN}
            max={DIFFICULTY_MAX}
            step={1}
            value={low}
            aria-label="Leichteste Stufe"
            onChange={(event) => {
              const next = Number(event.target.value) as Difficulty;
              onChange(Math.min(next, high) as Difficulty, high);
            }}
          />
          <input
            id={`${idPrefix}-to`}
            type="range"
            min={DIFFICULTY_MIN}
            max={DIFFICULTY_MAX}
            step={1}
            value={high}
            aria-label="Schwerste Stufe"
            onChange={(event) => {
              const next = Number(event.target.value) as Difficulty;
              onChange(low, Math.max(next, low) as Difficulty);
            }}
          />
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>viel leichter</span>
        <span className="text-slate-400">wie die Vorlage</span>
        <span>viel schwerer</span>
      </div>
    </div>
  );
}

/** Kompakte Variante für Tabellenzeilen im Klausur-Baukasten. */
export function DifficultyRangeCompact({
  from,
  to,
  onChange,
}: {
  from: Difficulty;
  to: Difficulty;
  onChange: (from: Difficulty, to: Difficulty) => void;
}) {
  const low = Math.min(from, to) as Difficulty;
  const high = Math.max(from, to) as Difficulty;

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: SPAN + 1 }, (_, index) => {
        const level = (DIFFICULTY_MIN + index) as Difficulty;
        const selected = level >= low && level <= high;

        return (
          <button
            key={level}
            type="button"
            title={`${DIFFICULTY_LABELS[level]} (Stufe ${level})`}
            aria-pressed={selected}
            onClick={() => {
              // Erster Klick setzt den Anfang, ein Klick rechts davon das Ende.
              if (low === high) {
                onChange(Math.min(low, level) as Difficulty, Math.max(low, level) as Difficulty);
              } else {
                onChange(level, level);
              }
            }}
            className={`h-6 w-4 rounded-sm transition ${
              selected ? "bg-blue-500" : "bg-white/10 hover:bg-white/20"
            } ${level === DIFFICULTY_REFERENCE ? "ring-1 ring-slate-400/60" : ""}`}
          >
            <span className="sr-only">Stufe {level}</span>
          </button>
        );
      })}
    </div>
  );
}
