import {
  DIFFICULTY_LABELS,
  type Difficulty,
  type GenerationConfig,
  type Question,
  type SourceDoc,
  type TaskType,
} from "@/types";

/**
 * Sämtliche Prompt-Texte an einem Ort. Sie sind auf Deutsch formuliert,
 * weil die Klausuren deutsch sind und Modelle die Sprache der Anweisung
 * gerne in die Ausgabe übernehmen.
 */

const FORMAT_RULES = `
FORMATREGELN
- Formeln immer als LaTeX. Inline mit $…$, abgesetzte Formeln mit $$…$$.
- In JSON-Strings müssen Backslashes verdoppelt werden: "$\\\\frac{1}{2}$".
- Keine Bilder, keine externen Verweise, keine Verweise auf "die Vorlage".
- Jede Aufgabe muss aus sich heraus lösbar sein: alle Zahlenwerte,
  Einheiten und Bedingungen stehen in der Aufgabenstellung.
- Antworte ausschließlich mit einem JSON-Objekt, ohne Vor- oder Nachtext.
`.trim();

function difficultyScale(reference: string): string {
  return `
SCHWIERIGKEITSSKALA (1–9)
Stufe 5 ist exakt das Niveau von ${reference}. Die Skala verändert
NICHT das Thema, sondern nur den Anspruch:
- 1–2: stark vereinfacht. Glatte Zahlen, ein einziger Rechenschritt,
  Zwischenergebnisse werden vorgegeben, keine Fallunterscheidung.
- 3–4: leichter. Weniger Teilschritte, freundlichere Zahlen, der
  Lösungsweg ist durch die Aufgabenstellung vorgezeichnet.
- 5: identischer Anspruch wie ${reference} — gleiche Anzahl
  Teilschritte, gleiche Zahlenqualität, gleicher Umfang.
- 6–7: schwerer. Zusätzlicher Zwischenschritt, unbequemere Zahlen oder
  Parameter statt Zahlen, Ergebnis muss noch interpretiert werden.
- 8–9: deutlich schwerer. Mehrere Verfahren kombiniert, Fallunter-
  scheidungen, Sonderfälle, Beweisanteile oder allgemeine Parameter.
Wichtig: Schwerer heißt NICHT "mehr Rechenaufwand vom Gleichen",
sondern mehr gedankliche Schritte.
`.trim();
}

const TRICK_RULES = `
KNIFFE UND ABKÜRZUNGEN
Der Nutzer will Aufgaben, bei denen sich das Rechnen durch einen guten
Einfall drastisch verkürzt — die Aufgabe sieht aufwendig aus, ist mit
dem richtigen Blick aber schnell erledigt. Typische Beispiele:
Symmetrie ausnutzen, geschickt substituieren, Terme faktorisieren statt
ausmultiplizieren, Grenzwertsätze statt l'Hospital, Linearität von
Integral/Ableitung, Rechnen modulo, Zeilenumformungen sparen, bekannte
Spezialfälle wiedererkennen.
Baue solche Kniffe aktiv in die Aufgaben ein. Markiere im Lösungsweg
JEDEN Schritt, an dem ein Kniff greift, über das Feld "trick": Dort
gehört hin, wie der Kniff heißt, warum er funktioniert und was man
ohne ihn hätte rechnen müssen.
`.trim();

const NO_TRICK_RULES = `
KNIFFE
Halte die Lösungswege geradlinig und schulbuchnah. Nutze das
Standardverfahren, auch wenn es etwas länger ist. Das Feld "trick"
bleibt leer, außer eine Abkürzung drängt sich wirklich auf.
`.trim();

// ── 1. Analyse der hochgeladenen Dokumente ───────────────────

export const ANALYZE_SYSTEM = `
Du bist erfahrene Lehrkraft und analysierst Klausur- und Übungsmaterial.
Deine Aufgabe: die wiederkehrenden AUFGABENTYPEN erkennen und die
enthaltenen Aufgaben wörtlich extrahieren.

Ein Aufgabentyp ist ein strukturelles Muster, kein Themengebiet.
Gut: "Extremwertaufgabe mit Nebenbedingung, 2 Variablen".
Schlecht: "Analysis".
Zwei Aufgaben gehören zum selben Typ, wenn man sie mit demselben
Verfahren und derselben Schrittfolge löst — auch bei anderen Zahlen.

${FORMAT_RULES}

ANTWORTSCHEMA
{
  "subject": "Fach, z.B. Analysis I",
  "taskTypes": [
    {
      "name": "kurzer, präziser Name des Musters",
      "description": "worum es inhaltlich geht, 1-2 Sätze",
      "pattern": "Aufbau: was ist gegeben, was gesucht, welche Teilaufgaben",
      "prerequisites": ["benötigter Satz/Formel/Verfahren"],
      "occurrences": 3,
      "typicalPoints": 8,
      "referenceDifficulty": 5,
      "examples": ["kurzes wörtliches Zitat aus der Vorlage"]
    }
  ],
  "questions": [
    {
      "taskTypeName": "muss exakt einem name aus taskTypes entsprechen",
      "prompt": "die Aufgabenstellung, so wörtlich wie möglich",
      "subQuestions": [{"label": "a", "prompt": "…", "answer": "…", "points": 4}],
      "answer": "knappes Endergebnis",
      "steps": [
        {"text": "Erklärung des Schritts", "latex": "optionale Rechnung",
         "trick": {"label": "…", "explanation": "…", "withoutTrick": "…"}}
      ],
      "points": 8,
      "estimatedMinutes": 12,
      "tags": ["Stichwort"]
    }
  ]
}

Regeln zur Extraktion:
- Übernimm Aufgaben so originalgetreu wie möglich, korrigiere nur
  offensichtliche OCR-Fehler.
- Stand im Material keine Lösung, rechne sie selbst sauber vor.
- "referenceDifficulty" ist auf der 1–9-Skala immer 5, sofern eine
  Aufgabe nicht erkennbar aus der Reihe fällt.
- Fehlt eine Punktangabe, schätze sie aus dem Umfang.
- Erfinde in diesem Schritt KEINE neuen Aufgaben.
`.trim();

export function buildAnalyzeUserMessage(docs: SourceDoc[], notes: string): string {
  const parts = docs.map((doc, index) => {
    const label = `[Dokument ${index + 1}: ${doc.name} — ${describeKind(doc.kind)}]`;
    const body = doc.text.trim()
      ? doc.text.slice(0, 60_000)
      : "(kein Text extrahierbar — siehe die beigefügten Seitenbilder)";
    return `${label}\n${body}`;
  });

  const extra = notes.trim() ? `\n\nZusätzliche Hinweise des Nutzers:\n${notes.trim()}` : "";

  return `Analysiere das folgende Material.\n\n${parts.join("\n\n---\n\n")}${extra}`;
}

function describeKind(kind: SourceDoc["kind"]): string {
  switch (kind) {
    case "exam":
      return "Übungsklausur / Altklausur, maßgeblich für Niveau und Stil";
    case "script":
      return "Skript / Vorlesungsunterlagen, liefert Stoffumfang";
    case "exercise-sheet":
      return "Übungsblatt";
    case "formula-sheet":
      return "Formelsammlung";
    default:
      return "sonstiges Material";
  }
}

// ── 2. Generierung neuer Aufgaben ────────────────────────────

export function buildGenerateSystem(config: GenerationConfig): string {
  return `
Du bist erfahrene Lehrkraft und schreibst neue Klausuraufgaben, die sich
nahtlos in eine vorgegebene Übungsklausur einfügen würden.

${difficultyScale("der vorgegebenen Übungsklausur")}

${config.emphasizeTricks ? TRICK_RULES : NO_TRICK_RULES}

${FORMAT_RULES}

ANTWORTSCHEMA
{
  "questions": [
    {
      "difficulty": 5,
      "prompt": "vollständige Aufgabenstellung",
      "subQuestions": [{"label": "a", "prompt": "…", "answer": "…", "points": 4}],
      "answer": "knappes Endergebnis, nur das Resultat",
      "steps": [
        {"text": "Erklärung", "latex": "Rechnung ohne $-Zeichen",
         "trick": {"label": "…", "explanation": "…", "withoutTrick": "…"}}
      ],
      "points": 8,
      "estimatedMinutes": 12,
      "tags": ["Stichwort"]
    }
  ]
}

QUALITÄTSREGELN
- Jede Aufgabe muss lösbar sein und ein sauberes Ergebnis haben. Rechne
  den Weg vollständig durch, BEVOR du die Aufgabe formulierst — passe
  notfalls die Zahlen an, statt ein hässliches Ergebnis stehenzulassen.
- "answer" enthält nur das Endergebnis, "steps" den ganzen Weg.
- Bei Teilaufgaben summieren sich deren Punkte zu "points".
- Variiere Kontext, Zahlen und Fragestellung deutlich. Keine zwei
  Aufgaben dürfen sich nur in einer Zahl unterscheiden.
- Halte dich strikt an die angeforderten Schwierigkeitsstufen.
`.trim();
}

export function buildGenerateUserMessage(
  taskType: TaskType,
  difficulties: Difficulty[],
  config: GenerationConfig,
  existingPrompts: string[]
): string {
  const spread = difficulties
    .map((d) => `${d} (${DIFFICULTY_LABELS[d]})`)
    .join(", ");

  const examples = taskType.examples.length
    ? `\nSo sehen Aufgaben dieses Typs in der Vorlage aus:\n${taskType.examples
        .map((e) => `• ${e}`)
        .join("\n")}`
    : "";

  const avoid = existingPrompts.length
    ? `\nDiese Aufgaben existieren bereits — schreibe deutlich andere:\n${existingPrompts
        .slice(0, 12)
        .map((p) => `• ${p.slice(0, 160)}`)
        .join("\n")}`
    : "";

  const notes = config.notes.trim() ? `\nVorgaben des Nutzers: ${config.notes.trim()}` : "";

  return `
AUFGABENTYP: ${taskType.name}
Inhalt: ${taskType.description}
Aufbau: ${taskType.pattern}
Benötigtes Vorwissen: ${taskType.prerequisites.join(", ") || "—"}
Übliche Punktzahl: ${taskType.typicalPoints}
${examples}
${avoid}
${notes}

Schreibe genau ${difficulties.length} neue Aufgaben dieses Typs, eine je
Schwierigkeitsstufe in dieser Reihenfolge: ${spread}.
Setze "difficulty" jeweils auf genau diesen Wert.
`.trim();
}

// ── 3. Gegenprüfung durch ein zweites Modell ─────────────────

export const CROSSCHECK_SYSTEM = `
Du bist Korrektor. Vor dir liegt eine Klausuraufgabe mit Musterlösung.
Prüfe sie so kritisch, wie du eine fremde Klausur vor dem Druck prüfen
würdest. Rechne den Weg selbst nach — verlasse dich nicht darauf, dass
die vorgelegte Lösung stimmt.

PRÜFPUNKTE
1. Ist die Aufgabe eindeutig und vollständig? Fehlt eine Angabe?
2. Ist sie mit den gegebenen Werten überhaupt lösbar?
3. Stimmt jeder Rechenschritt? Stimmt das Endergebnis?
4. Passt "answer" zum Ergebnis aus "steps"?
5. Sind die markierten Kniffe wirklich korrekt und wirklich Abkürzungen?
6. Passt die angegebene Schwierigkeitsstufe zum tatsächlichen Anspruch?
7. Summieren sich die Punkte der Teilaufgaben zur Gesamtpunktzahl?

${FORMAT_RULES}

ANTWORTSCHEMA
{
  "status": "passed" | "corrected" | "failed",
  "verdict": "ein bis drei Sätze Urteil",
  "issues": ["konkret benanntes Problem", "…"],
  "correction": null
}

- "passed": alles korrekt, "issues" ist leer, "correction" ist null.
- "corrected": es gab Fehler, du kannst sie beheben. Lege in
  "correction" die vollständig reparierte Aufgabe ab — gleiche Felder
  wie die Eingabe (prompt, subQuestions, answer, steps, points,
  estimatedMinutes, difficulty, tags).
- "failed": die Aufgabe ist grundsätzlich kaputt (nicht lösbar,
  widersprüchlich) und nicht sinnvoll reparierbar. "correction" bleibt null.
Sei streng: eine Aufgabe mit falschem Endergebnis ist niemals "passed".
`.trim();

export function buildCrossCheckUserMessage(question: Question, taskType?: TaskType): string {
  const payload = {
    taskType: taskType?.name ?? question.taskTypeName,
    difficulty: question.difficulty,
    difficultyMeaning: `${question.difficulty} von 9, wobei 5 dem Niveau der Originalklausur entspricht`,
    prompt: question.prompt,
    subQuestions: question.subQuestions,
    answer: question.answer,
    steps: question.steps,
    points: question.points,
    estimatedMinutes: question.estimatedMinutes,
    tags: question.tags,
  };

  return `Prüfe die folgende Aufgabe:\n\n${JSON.stringify(payload, null, 2)}`;
}
