/**
 * Modelle liefern JSON gerne mit Beiwerk: ```json-Zäune, ein einleitender
 * Satz, ein nachgeschobenes "Hoffe das hilft!". Diese Helfer holen das
 * eigentliche Objekt heraus, statt am ersten Zeichen zu scheitern.
 */

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

/** Schneidet auf das äußerste balancierte { … } bzw. [ … ] zu. */
function carveOutJson(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return text.slice(start, i + 1);
  }

  return null;
}

export function parseJsonResponse<T>(raw: string): T {
  const cleaned = stripFences(raw);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Weiter unten mit dem ausgeschnittenen Block versuchen.
  }

  const carved = carveOutJson(cleaned);
  if (carved) {
    try {
      return JSON.parse(carved) as T;
    } catch {
      // Fällt durch zum Fehler.
    }
  }

  throw new Error(
    `Antwort war kein gültiges JSON. Anfang der Antwort: ${cleaned.slice(0, 200)}`
  );
}

/** Liest ein Feld als Array, egal ob das Modell null, Objekt oder Liste liefert. */
export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined) return [];
  return [value as T];
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}
