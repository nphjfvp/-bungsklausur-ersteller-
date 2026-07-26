// ─────────────────────────────────────────────────────────────
// Domänenmodell des Übungsklausur-Erstellers.
//
// Alles hier ist reines JSON — keine Klassen, keine Funktionen.
// Damit lässt sich jedes Objekt unverändert in IndexedDB ablegen,
// nach Firestore synchronisieren und als Datei exportieren.
// ─────────────────────────────────────────────────────────────

/**
 * Schwierigkeit auf einer Skala von 1 bis 9.
 * 5 = exakt das Niveau der hochgeladenen Übungsklausur.
 * 1 = deutlich leichter, 9 = deutlich schwerer.
 */
export type Difficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 9;
export const DIFFICULTY_REFERENCE: Difficulty = 5;

/** Beschriftungen für den Slider — der Nutzer sieht nie nackte Zahlen. */
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Sehr viel leichter",
  2: "Deutlich leichter",
  3: "Leichter",
  4: "Etwas leichter",
  5: "Wie die Vorlage",
  6: "Etwas schwerer",
  7: "Schwerer",
  8: "Deutlich schwerer",
  9: "Sehr viel schwerer",
};

// ── Dokumente ────────────────────────────────────────────────

export type SourceKind = "exam" | "script" | "exercise-sheet" | "formula-sheet" | "other";

export interface SourceDoc {
  id: string;
  poolId: string;
  name: string;
  /** Wofür das Dokument steht — beeinflusst, wie die KI es liest. */
  kind: SourceKind;
  mime: string;
  /** Text-Extrakt (PDF/TXT/DOCX). Leer bei reinen Bildern. */
  text: string;
  /** Data-URLs von Seitenbildern, die an ein Vision-Modell gehen. */
  images: string[];
  pageCount: number;
  addedAt: string;
}

// ── Aufgabentypen ────────────────────────────────────────────

/**
 * Ein von der KI erkanntes wiederkehrendes Aufgabenmuster,
 * z.B. "Extremwertaufgabe mit Nebenbedingung" oder "Matrix invertieren".
 * Der Fragenpool wird nach diesen Typen sortiert.
 */
export interface TaskType {
  id: string;
  poolId: string;
  name: string;
  /** Worum es inhaltlich geht. */
  description: string;
  /** Der strukturelle Aufbau: Was ist gegeben, was ist gesucht, wie viele Teilaufgaben. */
  pattern: string;
  /** Fachliche Voraussetzungen (Sätze, Formeln, Verfahren). */
  prerequisites: string[];
  /** Wie oft dieses Muster in den Vorlagen auftauchte — steuert die Gewichtung. */
  occurrences: number;
  /** Typische Punktzahl in der Originalklausur. */
  typicalPoints: number;
  /** Wie schwer eine Aufgabe dieses Typs im Original war. */
  referenceDifficulty: Difficulty;
  /** Kurzzitate aus den Vorlagen, damit die Generierung den Ton trifft. */
  examples: string[];
  createdAt: string;
}

// ── Fragen ───────────────────────────────────────────────────

export interface SolutionStep {
  /** Fließtext-Erklärung des Schritts. */
  text: string;
  /** Optionale Rechnung als LaTeX (ohne $-Delimiter). */
  latex?: string;
  /** Markiert Schritte, an denen ein Trick/Kniff greift. */
  trick?: TrickMark;
}

export interface TrickMark {
  /** Kurzname, z.B. "Symmetrie ausnutzen". */
  label: string;
  /** Warum das hier die Arbeit spart. */
  explanation: string;
  /** Was man ohne den Trick hätte tun müssen. */
  withoutTrick?: string;
}

export type QuestionOrigin = "extracted" | "generated" | "variant";

export type CheckStatus = "unchecked" | "passed" | "corrected" | "failed";

export interface CrossCheck {
  status: CheckStatus;
  /** Modell, das geprüft hat. */
  model: string;
  /** Gefundene Probleme im Klartext. */
  issues: string[];
  /** Freitext-Urteil des Prüfmodells. */
  verdict: string;
  checkedAt: string;
}

export interface SubQuestion {
  /** a), b), c) … */
  label: string;
  prompt: string;
  answer: string;
  points: number;
}

export interface Question {
  id: string;
  poolId: string;
  taskTypeId: string;
  /** Denormalisiert, damit Listen ohne Join gruppieren können. */
  taskTypeName: string;
  difficulty: Difficulty;
  /** Aufgabenstellung, Markdown mit $…$ / $$…$$ für Formeln. */
  prompt: string;
  /** Teilaufgaben; leer, wenn die Aufgabe einteilig ist. */
  subQuestions: SubQuestion[];
  /** Kurzes Endergebnis für das reine Ergebnisblatt. */
  answer: string;
  /** Ausführlicher Rechenweg für die Musterlösung. */
  steps: SolutionStep[];
  /** Alle im Rechenweg genutzten Kniffe, gesammelt. */
  tricks: TrickMark[];
  points: number;
  /** Geschätzte Bearbeitungszeit in Minuten — Basis der Klausurlänge. */
  estimatedMinutes: number;
  origin: QuestionOrigin;
  sourceDocId?: string;
  tags: string[];
  crossCheck?: CrossCheck;
  /** Vom Nutzer aussortierte Fragen bleiben erhalten, werden aber nie gezogen. */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Pool ─────────────────────────────────────────────────────

export type GenerationMode = "extract-only" | "extract-and-generate" | "generate-only";

export interface GenerationConfig {
  mode: GenerationMode;
  /** Zielgröße des Pools (bei generate-Modi). */
  targetCount: number;
  difficultyFrom: Difficulty;
  difficultyTo: Difficulty;
  /** Aufgaben sollen elegante Abkürzungen enthalten und diese markieren. */
  emphasizeTricks: boolean;
  /** Zweites Modell prüft Aufgabe + Musterlösung gegen. */
  crossCheck: boolean;
  generatorModel: string;
  checkerModel: string;
  /** Freitext des Nutzers, z.B. "keine Taschenrechner-Aufgaben". */
  notes: string;
}

export type PoolStatus = "draft" | "analyzing" | "generating" | "checking" | "ready" | "error";

export interface Pool {
  id: string;
  title: string;
  subject: string;
  status: PoolStatus;
  config: GenerationConfig;
  /** Fortschritt des letzten Laufs, damit die UI etwas anzeigen kann. */
  progress: { done: number; total: number; label: string };
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Klausur ──────────────────────────────────────────────────

export interface ExamBlueprintRow {
  taskTypeId: string;
  taskTypeName: string;
  count: number;
  difficultyFrom: Difficulty;
  difficultyTo: Difficulty;
}

export interface ExamConfig {
  title: string;
  subject: string;
  /** Beliebiger Text, z.B. "Hilfsmittel: Formelsammlung". */
  instructions: string;
  durationMinutes: number;
  rows: ExamBlueprintRow[];
  /** Gleicher Seed ⇒ gleiche Klausur. Ermöglicht reproduzierbares Nachdrucken. */
  seed: string;
  /** Aufgaben nach Schwierigkeit aufsteigend anordnen. */
  sortByDifficulty: boolean;
  /** Bereits in früheren Klausuren genutzte Fragen meiden. */
  avoidUsed: boolean;
}

export interface Exam {
  id: string;
  poolId: string;
  config: ExamConfig;
  questionIds: string[];
  totalPoints: number;
  createdAt: string;
}

// ── Einstellungen (nur lokal, nie synchronisiert) ────────────

export interface Settings {
  id: "settings";
  openRouterKey: string;
  generatorModel: string;
  checkerModel: string;
  firebase: FirebaseConfig | null;
  syncEnabled: boolean;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}
