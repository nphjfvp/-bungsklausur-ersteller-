"use client";

import { getSettings } from "@/lib/db";
import {
  openRouterChatWithRetry,
  type ChatMessage,
  type ChatOptions,
} from "@/lib/openrouter";
import { parseJsonResponse } from "./json";

/**
 * Die App wird als statische Seite ausgeliefert, es gibt also keinen
 * Server, der Aufrufe weiterreichen könnte. Der Browser spricht deshalb
 * direkt mit OpenRouter — mit dem Key, den der Nutzer in den
 * Einstellungen hinterlegt hat. OpenRouter erlaubt das per CORS
 * ausdrücklich.
 *
 * Der Key wird nur lokal gespeichert und nie synchronisiert.
 */

export class MissingKeyError extends Error {
  constructor() {
    super(
      "Kein OpenRouter-Key hinterlegt. Trage ihn unter Einstellungen ein, dann können Aufgaben erzeugt werden."
    );
    this.name = "MissingKeyError";
  }
}

async function requireKey(): Promise<string> {
  const key = (await getSettings()).openRouterKey.trim();
  if (!key) throw new MissingKeyError();
  return key;
}

export async function callModel(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<string> {
  return openRouterChatWithRetry(messages, options, await requireKey(), {
    url: window.location.origin,
    title: "Übungsklausur-Ersteller",
  });
}

/** Wie callModel, aber mit JSON-Modus und geparster Antwort. */
export async function callModelJson<T>(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<T> {
  const raw = await callModel(messages, { ...options, json: true });
  return parseJsonResponse<T>(raw);
}

/** Prüft, ob überhaupt generiert werden kann. */
export async function canGenerate(): Promise<boolean> {
  return Boolean((await getSettings()).openRouterKey.trim());
}
