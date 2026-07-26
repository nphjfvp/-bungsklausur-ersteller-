"use client";

/**
 * Modellauswahl.
 *
 * Eine fest eingebaute Liste veraltet zwangsläufig — bei OpenRouter
 * kommen ständig Modelle dazu und alte verschwinden. Deshalb wird die
 * echte Liste zur Laufzeit geholt und zwischengespeichert. Die kuratierte
 * Liste unten ist nur Startpunkt und Notnagel: sie greift, solange nichts
 * geladen wurde oder das Gerät offline ist.
 */

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "openrouter-models-v1";
/** Nach einem Tag wird im Hintergrund neu geladen. */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ModelInfo {
  id: string;
  name: string;
  /** Kontextfenster in Token, 0 wenn unbekannt. */
  contextLength: number;
  /** Preis je 1 Mio. Eingabe-Token in US-Dollar, null wenn unbekannt. */
  promptPricePerM: number | null;
  completionPricePerM: number | null;
  /** Kann das Modell Bilder lesen? Wichtig für gescannte Klausuren. */
  vision: boolean;
  /** Kostenlose Modelle bei OpenRouter enden auf ":free". */
  free: boolean;
  /** Kurzer Hinweis aus der kuratierten Liste, falls vorhanden. */
  note?: string;
}

/**
 * Handverlesene Empfehlungen. Die IDs entsprechen der Schreibweise von
 * OpenRouter; ob ein Modell dort aktuell verfügbar ist, entscheidet die
 * geladene Liste — nicht diese Aufstellung.
 */
export const CURATED_MODELS: ModelInfo[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    contextLength: 200_000,
    promptPricePerM: 3,
    completionPricePerM: 15,
    vision: true,
    free: false,
    note: "Ausgewogen — gute Standardwahl zum Erzeugen",
  },
  {
    id: "anthropic/claude-opus-4.1",
    name: "Claude Opus 4.1",
    contextLength: 200_000,
    promptPricePerM: 15,
    completionPricePerM: 75,
    vision: true,
    free: false,
    note: "Stark bei Mathematik, deutlich teurer",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    contextLength: 200_000,
    promptPricePerM: 1,
    completionPricePerM: 5,
    vision: true,
    free: false,
    note: "Schnell und günstig",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    contextLength: 1_000_000,
    promptPricePerM: 1.25,
    completionPricePerM: 10,
    vision: true,
    free: false,
    note: "Sehr großes Kontextfenster — gut für dicke Skripte",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    contextLength: 1_000_000,
    promptPricePerM: 0.3,
    completionPricePerM: 2.5,
    vision: true,
    free: false,
    note: "Günstig und schnell — gute Wahl zum Gegenprüfen",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    contextLength: 1_000_000,
    promptPricePerM: 0.1,
    completionPricePerM: 0.4,
    vision: true,
    free: false,
    note: "Am günstigsten, dafür schwächer bei mehrschrittigen Rechnungen",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    contextLength: 400_000,
    promptPricePerM: 1.25,
    completionPricePerM: 10,
    vision: true,
    free: false,
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 mini",
    contextLength: 400_000,
    promptPricePerM: 0.25,
    completionPricePerM: 2,
    vision: true,
    free: false,
    note: "Günstige Alternative zum Gegenprüfen",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    contextLength: 128_000,
    promptPricePerM: 0.4,
    completionPricePerM: 2,
    vision: false,
    free: false,
    note: "Rechenstark und günstig, liest aber keine Bilder",
  },
  {
    id: "x-ai/grok-4",
    name: "Grok 4",
    contextLength: 256_000,
    promptPricePerM: 3,
    completionPricePerM: 15,
    vision: true,
    free: false,
  },
  {
    id: "qwen/qwen3-235b-a22b",
    name: "Qwen3 235B",
    contextLength: 128_000,
    promptPricePerM: 0.2,
    completionPricePerM: 0.8,
    vision: false,
    free: false,
    note: "Offenes Modell, sehr günstig",
  },
];

export const DEFAULT_GENERATOR = "anthropic/claude-sonnet-4.5";
export const DEFAULT_CHECKER = "google/gemini-2.5-flash";

// ── Laden und Zwischenspeichern ──────────────────────────────

interface CachedModels {
  fetchedAt: number;
  models: ModelInfo[];
}

function toNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * OpenRouter gibt Preise pro Token als String an ("0.000003"). Für die
 * Anzeige ist der Preis je Million Token handlicher.
 */
function pricePerMillion(value: unknown): number | null {
  const perToken = toNumber(value);
  return perToken === null ? null : perToken * 1_000_000;
}

function normalizeModel(raw: unknown): ModelInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;

  const architecture = (record.architecture ?? {}) as Record<string, unknown>;
  const inputModalities = Array.isArray(architecture.input_modalities)
    ? (architecture.input_modalities as unknown[]).map(String)
    : [];
  const modality = typeof architecture.modality === "string" ? architecture.modality : "";

  const pricing = (record.pricing ?? {}) as Record<string, unknown>;

  return {
    id,
    name: typeof record.name === "string" && record.name ? record.name : id,
    contextLength: toNumber(record.context_length) ?? 0,
    promptPricePerM: pricePerMillion(pricing.prompt),
    completionPricePerM: pricePerMillion(pricing.completion),
    // Je nach Alter des Eintrags steht die Bildfähigkeit in einem von
    // zwei Feldern — beide werden geprüft.
    vision: inputModalities.includes("image") || modality.includes("image"),
    free: id.endsWith(":free"),
  };
}

function readCache(): CachedModels | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedModels;
    return Array.isArray(parsed?.models) && parsed.models.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(models: ModelInfo[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), models } satisfies CachedModels)
    );
  } catch {
    // Voller Speicher ist kein Grund, die App anzuhalten.
  }
}

/** Ergänzt geladene Einträge um die Hinweise aus der kuratierten Liste. */
function withNotes(models: ModelInfo[]): ModelInfo[] {
  const notes = new Map(CURATED_MODELS.map((model) => [model.id, model.note]));
  return models.map((model) =>
    notes.has(model.id) ? { ...model, note: notes.get(model.id) } : model
  );
}

export async function fetchModels(signal?: AbortSignal): Promise<ModelInfo[]> {
  const res = await fetch(MODELS_URL, { signal });
  if (!res.ok) throw new Error(`Modellliste konnte nicht geladen werden (${res.status}).`);

  const payload = await res.json();
  const list = Array.isArray(payload?.data) ? payload.data : [];

  const models = withNotes(
    list
      .map(normalizeModel)
      .filter((model: ModelInfo | null): model is ModelInfo => model !== null)
      .sort((a: ModelInfo, b: ModelInfo) => a.name.localeCompare(b.name))
  );

  if (models.length === 0) {
    throw new Error("Die Modellliste kam leer zurück.");
  }

  writeCache(models);
  return models;
}

export interface ModelSource {
  models: ModelInfo[];
  /** "curated" = Notnagel, "cache" = gespeichert, "live" = frisch geladen. */
  origin: "curated" | "cache" | "live";
  fetchedAt: number | null;
  stale: boolean;
}

/**
 * Liefert sofort das Beste, was da ist, und lädt bei Bedarf nach. Ohne
 * Netz bleibt es bei Zwischenspeicher bzw. kuratierter Liste — die
 * Auswahl funktioniert dadurch auch offline.
 */
export async function loadModels(forceRefresh = false): Promise<ModelSource> {
  const cached = readCache();
  const stale = !cached || Date.now() - cached.fetchedAt > CACHE_MAX_AGE_MS;

  if (cached && !forceRefresh && !stale) {
    return { models: cached.models, origin: "cache", fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const models = await fetchModels();
    return { models, origin: "live", fetchedAt: Date.now(), stale: false };
  } catch {
    if (cached) {
      return { models: cached.models, origin: "cache", fetchedAt: cached.fetchedAt, stale: true };
    }
    return { models: CURATED_MODELS, origin: "curated", fetchedAt: null, stale: true };
  }
}

/** Formatiert den Preis für die Anzeige in der Liste. */
export function formatPrice(model: ModelInfo): string {
  if (model.free) return "kostenlos";
  if (model.promptPricePerM === null) return "Preis unbekannt";

  const format = (value: number) =>
    value >= 1 ? value.toFixed(2).replace(/\.00$/, "") : value.toFixed(3).replace(/0+$/, "");

  const input = format(model.promptPricePerM);
  const output =
    model.completionPricePerM === null ? "?" : format(model.completionPricePerM);

  return `$${input} / $${output} je Mio. Token`;
}

export function formatContext(model: ModelInfo): string {
  if (!model.contextLength) return "";
  if (model.contextLength >= 1_000_000) {
    return `${(model.contextLength / 1_000_000).toFixed(1).replace(/\.0$/, "")} Mio. Token`;
  }
  return `${Math.round(model.contextLength / 1000)}k Token`;
}
