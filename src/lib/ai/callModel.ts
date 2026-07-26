"use client";

import { getSettings } from "@/lib/db";
import {
  OpenRouterError,
  openRouterChatWithRetry,
  type ChatMessage,
  type ChatOptions,
} from "@/lib/openrouter";
import { parseJsonResponse } from "./json";

/**
 * Der Browser spricht bevorzugt direkt mit OpenRouter — dann läuft die
 * Generierung auch, wenn die App nur als statische Seite ausgeliefert
 * wird. Nur wenn kein lokaler Key hinterlegt ist, geht der Aufruf über
 * den Server-Proxy.
 */

let serverKeyAvailable: boolean | null = null;

async function hasServerKey(): Promise<boolean> {
  if (serverKeyAvailable !== null) return serverKeyAvailable;
  try {
    const res = await fetch("/api/openrouter", { method: "GET" });
    const data = await res.json();
    serverKeyAvailable = Boolean(data?.serverKeyAvailable);
  } catch {
    serverKeyAvailable = false;
  }
  return serverKeyAvailable;
}

async function viaProxy(messages: ChatMessage[], options: ChatOptions): Promise<string> {
  const res = await fetch("/api/openrouter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, options: { ...options, signal: undefined } }),
    signal: options.signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new OpenRouterError(
      data?.error ?? `Proxy-Fehler ${res.status}`,
      res.status,
      res.status === 429 || res.status >= 500
    );
  }
  return data.content as string;
}

export class MissingKeyError extends Error {
  constructor() {
    super(
      "Kein OpenRouter-Key gefunden. Trage ihn unter Einstellungen ein — oder setze OPENROUTER_API_KEY auf dem Server."
    );
    this.name = "MissingKeyError";
  }
}

export async function callModel(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<string> {
  const settings = await getSettings();

  if (settings.openRouterKey.trim()) {
    return openRouterChatWithRetry(messages, options, settings.openRouterKey.trim(), {
      url: window.location.origin,
      title: "Übungsklausur-Ersteller",
    });
  }

  if (await hasServerKey()) return viaProxy(messages, options);

  throw new MissingKeyError();
}

/** Wie callModel, aber mit JSON-Modus und geparster Antwort. */
export async function callModelJson<T>(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<T> {
  const raw = await callModel(messages, { ...options, json: true });
  return parseJsonResponse<T>(raw);
}

/** Prüft beim Laden der Einstellungsseite, ob überhaupt generiert werden kann. */
export async function canGenerate(): Promise<boolean> {
  const settings = await getSettings();
  if (settings.openRouterKey.trim()) return true;
  return hasServerKey();
}

export function resetServerKeyCache() {
  serverKeyAvailable = null;
}
