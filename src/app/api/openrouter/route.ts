import { NextRequest, NextResponse } from "next/server";
import {
  OpenRouterError,
  openRouterChatWithRetry,
  type ChatMessage,
  type ChatOptions,
} from "@/lib/openrouter";

/**
 * Proxy für den Fall, dass der OpenRouter-Key serverseitig in .env liegt.
 * Trägt der Nutzer seinen Key stattdessen in den Einstellungen ein, ruft
 * der Browser OpenRouter direkt auf und diese Route wird nie benutzt.
 */

function serverKey(): string {
  return process.env.OPENROUTER_API_KEY ?? "";
}

const attribution = {
  url: process.env.OPENROUTER_APP_URL,
  title: process.env.OPENROUTER_APP_TITLE ?? "Übungsklausur-Ersteller",
};

/** Verrät der UI, ob sie ohne eigenen Key auskommt. */
export async function GET() {
  return NextResponse.json({ serverKeyAvailable: Boolean(serverKey()) });
}

export async function POST(req: NextRequest) {
  const key = serverKey();
  if (!key) {
    return NextResponse.json(
      { error: "Auf dem Server ist kein OPENROUTER_API_KEY gesetzt. Trage deinen Key unter /settings ein." },
      { status: 501 }
    );
  }

  let body: { messages?: ChatMessage[]; options?: ChatOptions };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON im Request-Body." }, { status: 400 });
  }

  const { messages, options } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages fehlt oder ist leer." }, { status: 400 });
  }
  if (!options?.model) {
    return NextResponse.json({ error: "options.model fehlt." }, { status: 400 });
  }

  try {
    const content = await openRouterChatWithRetry(messages, options, key, attribution);
    return NextResponse.json({ content });
  } catch (error) {
    const status = error instanceof OpenRouterError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ error: message }, { status });
  }
}
