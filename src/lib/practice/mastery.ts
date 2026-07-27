import type { MasteryLevel, Question } from "@/types";

/**
 * Zieht aus einem Freitext die erste Zahl heraus — Komma und Punkt gelten
 * beide als Dezimaltrennzeichen, da Nutzereingaben auf dem Handy meist
 * das Komma verwenden. Gibt null zurück, wenn keine Zahl gefunden wurde.
 */
export function parseNumericAnswer(text: string): number | null {
  const match = text.trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Rundungsfehler sollen keine Rolle spielen — 1% oder mindestens 0.01 Toleranz. */
export function numbersMatch(a: number, b: number): boolean {
  const tolerance = Math.max(0.01, Math.abs(b) * 0.01);
  return Math.abs(a - b) <= tolerance;
}

/**
 * Ob sich eine Aufgabe offline automatisch prüfen lässt: einteilig und
 * die Musterlösung ist eine reine Zahl. Mehrteilige oder symbolische
 * Antworten (Formeln, Text) gehen stattdessen über die
 * Selbsteinschätzung ("Notfall-Knopf").
 */
export function isAutoGradable(question: Question): boolean {
  return question.subQuestions.length === 0 && parseNumericAnswer(question.answer) !== null;
}

const MASTERY_WEIGHT: Record<MasteryLevel, number> = { red: 5, yellow: 2, green: 1 };

/**
 * Wählt die nächste Übungsaufgabe. Noch nicht beherrschte (rote) Aufgaben
 * kommen deutlich häufiger dran als grüne — komplett ausgeschlossen wird
 * aber nichts, damit auch Gelerntes ab und zu wiederholt wird.
 */
export function pickPracticeQuestion(
  questions: Question[],
  random: () => number = Math.random
): Question | null {
  const pool = questions.filter((question) => !question.archived);
  if (pool.length === 0) return null;

  const weights = pool.map((question) => MASTERY_WEIGHT[question.mastery ?? "red"]);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;

  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Wie dringend ein Aufgabentyp im Übungsmodus noch Aufmerksamkeit
 * braucht: 0 = alles beherrscht oder keine Kniffe enthalten, 1 = alle
 * Kniff-Aufgaben dieses Typs stehen noch auf Rot. Fließt in die
 * Vorbelegung der Klausur-Zusammensetzung ein, damit gerade die Typen
 * mit noch unsicheren Kniffen häufiger geübt werden.
 */
export function trickWeakness(questions: Question[], taskTypeId: string): number {
  const own = questions.filter(
    (question) => !question.archived && question.taskTypeId === taskTypeId && question.tricks.length > 0
  );
  if (own.length === 0) return 0;

  const score = own.reduce((sum, question) => {
    const level = question.mastery ?? "red";
    if (level === "red") return sum + 1;
    if (level === "yellow") return sum + 0.5;
    return sum;
  }, 0);

  return score / own.length;
}
