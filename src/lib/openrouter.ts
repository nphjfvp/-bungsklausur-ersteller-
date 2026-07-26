const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Erzwingt ein JSON-Objekt als Antwort. */
  json?: boolean;
  signal?: AbortSignal;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Bei 429/5xx lohnt ein erneuter Versuch, bei 401/400 nicht. */
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

/**
 * Ein Aufruf gegen OpenRouter. Läuft sowohl im Browser (mit dem Key des
 * Nutzers aus den Einstellungen) als auch auf dem Server (mit
 * OPENROUTER_API_KEY) — die API erlaubt beides.
 */
export async function openRouterChat(
  messages: ChatMessage[],
  options: ChatOptions,
  apiKey: string,
  attribution?: { url?: string; title?: string }
): Promise<string> {
  if (!apiKey) {
    throw new OpenRouterError("Kein OpenRouter-API-Key hinterlegt.", 401, false);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (attribution?.url) headers["HTTP-Referer"] = attribution.url;
  if (attribution?.title) headers["X-Title"] = attribution.title;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 8000,
      temperature: options.temperature ?? 0.4,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter ${res.status}: ${detail.slice(0, 400)}`,
      res.status,
      res.status === 429 || res.status >= 500
    );
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new OpenRouterError("Leere Antwort vom Modell.", 502, true);
  }
  return content;
}

/** Wiederholt den Aufruf bei Rate-Limits mit wachsender Wartezeit. */
export async function openRouterChatWithRetry(
  messages: ChatMessage[],
  options: ChatOptions,
  apiKey: string,
  attribution?: { url?: string; title?: string },
  maxAttempts = 3
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await openRouterChat(messages, options, apiKey, attribution);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof OpenRouterError && error.retryable;
      if (!retryable || attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
    }
  }

  throw lastError;
}
