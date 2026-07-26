# Übungsklausur-Ersteller

Eine lokale Web-App (PWA), die aus hochgeladenen Übungsklausuren einen großen
Aufgabenpool erzeugt — und daraus **offline** beliebig viele neue Klausuren mit
Musterlösung baut.

## Was die App macht

1. **Material einlesen.** Du lädst eine oder mehrere Übungsklausuren hoch, dazu
   optional Skripte, Übungsblätter und Formelsammlungen. PDFs (auch gescannte),
   Bilder und Textdateien werden im Browser eingelesen — nichts geht an einen
   fremden Server außer an das KI-Modell selbst.
2. **Aufgabentypen erkennen.** Ein Modell über OpenRouter analysiert das
   Material und leitet die wiederkehrenden *Muster* ab („Extremwertaufgabe mit
   Nebenbedingung“), nicht bloß Themengebiete.
3. **Pool füllen.** Du entscheidest, ob die App
   - nur die vorhandenen Aufgaben **extrahiert**,
   - sie extrahiert **und ergänzt**, oder
   - **ausschließlich neue** Aufgaben schreibt.
4. **Schwierigkeit steuern.** Ein Regler von 1 bis 9; **Stufe 5 ist exakt das
   Niveau deiner hochgeladenen Klausur**, die Ränder sind deutlich leichter bzw.
   deutlich schwerer. Du wählst eine Spanne, nicht einen einzelnen Wert.
5. **Kniffe.** Ein Schalter verlangt Aufgaben, die aufwendig aussehen, sich mit
   dem richtigen Einfall aber stark verkürzen (Symmetrie, geschickte
   Substitution, Faktorisieren statt Ausmultiplizieren …). Jede solche Stelle
   wird in der Musterlösung markiert — samt Erklärung, was man ohne den Kniff
   hätte rechnen müssen.
6. **Gegenprüfung.** Auf Wunsch rechnet ein **zweites Modell** jede Aufgabe nach,
   korrigiert Fehler und sortiert Unlösbares aus.
7. **Klausur bauen — ohne Internet.** Aus dem fertigen Pool ziehst du je
   Aufgabentyp und Schwierigkeitsspanne die gewünschte Anzahl. Heraus kommen
   drei PDFs:
   - die **Klausur** (mit Platz zum Rechnen),
   - das **Ergebnisblatt** (nur die Resultate),
   - die **Musterlösung** (vollständiger Rechenweg, Kniffe hervorgehoben).

## Schnellstart

```bash
npm install
npm run dev      # http://localhost:3000
```

Danach unter **Einstellungen** einen [OpenRouter](https://openrouter.ai)-Key
eintragen. Alternativ serverseitig in `.env`:

```bash
cp .env.example .env
# OPENROUTER_API_KEY=sk-or-v1-…
```

Ist der Key auf dem Server hinterlegt, laufen alle Modellaufrufe über
`/api/openrouter` und der Key verlässt den Server nie. Trägst du ihn stattdessen
in der App ein, spricht der Browser direkt mit OpenRouter.

Für den produktiven Betrieb (und damit der Service Worker aktiv wird):

```bash
npm run build && npm start
```

## Offline-Betrieb

Die App ist eine PWA — im Browser-Menü „Installieren“ bzw. „Zum Startbildschirm
hinzufügen“ wählen. Danach funktionieren ohne Internet:

- Fragenpools ansehen, filtern, durchsuchen, Aufgaben aussortieren
- Klausuren zusammenstellen
- alle drei PDFs erzeugen und herunterladen

Eine Verbindung braucht **nur** das Erzeugen neuer Aufgaben und die
Gegenprüfung. Sämtliche Daten liegen in IndexedDB; die PDF-Erzeugung läuft
vollständig im Browser (jsPDF + KaTeX), ohne Server.

## Synchronisierung über mehrere Geräte

Zwei Wege, beide optional:

**Datei-Export.** Jeder Pool lässt sich als eine JSON-Datei exportieren und auf
einem anderen Gerät importieren. Kein Setup nötig.

**Firebase.** Unter *Einstellungen → Geräte-Synchronisierung* aktivierbar. Nötig
sind ein Firebase-Projekt mit aktivierter Google-Anmeldung und eine
Firestore-Datenbank; die passenden Sicherheitsregeln zeigt die App zum Kopieren
an. Der Abgleich läuft in beide Richtungen, pro Datensatz gewinnt die neuere
Fassung (`updatedAt`), gelöschte Einträge hinterlassen Grabsteine, damit sie
nicht von einem anderen Gerät zurückkommen.

Ohne Firebase-Konfiguration wird das SDK nie geladen — die App bleibt dann rein
lokal.

## Aufbau

```
src/
  app/                     Seiten (App Router)
    api/openrouter/        Proxy für den serverseitigen Key
    pools/new/             Assistent zum Anlegen eines Pools
    pools/[poolId]/        Poolansicht
    pools/[poolId]/exam/   Klausur-Baukasten (läuft offline)
    settings/              Key, Modelle, Synchronisierung
  lib/
    ai/                    Prompts, Analyse, Generierung, Gegenprüfung, Ablauf
    exam/                  Ziehung, HTML-Satz, PDF-Erzeugung
    extract/               PDF-/Bild-/Textextraktion im Browser
    sync/                  Firestore-Abgleich (optional)
    db.ts                  IndexedDB via Dexie, Export/Import
    latex.ts               Markdown + LaTeX → HTML (KaTeX)
  components/              UI-Bausteine
  types/                   Datenmodell
```

Der Ablauf einer Pool-Erzeugung steckt in `src/lib/ai/pipeline.ts`: Analyse →
Generierung (parallelisiert, in Stapeln) → Gegenprüfung. Jeder Zwischenstand
wird sofort gespeichert, ein Abbruch verliert also nichts.

## Kosten im Blick behalten

Ein Pool mit 60 Aufgaben und eingeschalteter Gegenprüfung bedeutet grob 20–30
Generierungsaufrufe plus 60 Prüfaufrufe. Für einen ersten Versuch lohnt sich ein
kleiner Zielwert (etwa 20 Aufgaben) und ein günstiges Prüfmodell. Nachlegen geht
später jederzeit gezielt pro Aufgabentyp.
