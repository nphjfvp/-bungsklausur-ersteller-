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

/**
 * Bei großem Material (viele oder lange Dokumente) reicht das Token-
 * Limit einer Antwort manchmal nicht — das Modell bricht das JSON
 * mitten im Wort ab. Statt dann komplett aufzugeben, wird das Modell
 * gebeten, exakt an der Abbruchstelle weiterzuschreiben; die Bruchstücke
 * werden aneinandergehängt und neu geparst. Erst wenn das mehrfach
 * scheitert, wird der Fehler nach oben gereicht.
 */
const MAX_CONTINUATIONS = 2;

const CONTINUE_PROMPT =
  "Deine letzte Antwort wurde mitten im JSON abgeschnitten. Setze EXAKT an der " +
  "Abbruchstelle fort — keine Wiederholung des bisherigen Textes, keine Einleitung, " +
  "kein Codezaun. Schreibe nur den fehlenden Rest, bis das JSON-Objekt vollständig " +
  "geschlossen ist.";

/** Wie callModel, aber mit JSON-Modus, geparster Antwort und Fortsetzung bei Abbruch. */
export async function callModelJson<T>(
  messages: ChatMessage[],
  options: ChatOptions
): Promise<T> {
  let combined = "";
  let conversation = messages;

  for (let attempt = 0; ; attempt++) {
    const isFirstAttempt = attempt === 0;
    const raw = await callModel(conversation, {
      ...options,
      json: isFirstAttempt,
      // Beim Fortsetzen zählt Wortgenauigkeit mehr als Kreativität.
      temperature: isFirstAttempt ? options.temperature : 0,
    });
    combined += raw;

    try {
      return parseJsonResponse<T>(combined);
    } catch (error) {
      if (attempt >= MAX_CONTINUATIONS) throw error;
      conversation = [
        ...conversation,
        { role: "assistant", content: raw },
        { role: "user", content: CONTINUE_PROMPT },
      ];
    }
  }
}

/** Prüft, ob überhaupt generiert werden kann. */
export async function canGenerate(): Promise<boolean> {
  return Boolean((await getSettings()).openRouterKey.trim());
}
