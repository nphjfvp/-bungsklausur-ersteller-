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

## Auf dem Handy nutzen (GitHub Pages)

Die App wird als reine statische Seite gebaut und per GitHub Action
veröffentlicht — kein Server, kein weiteres Konto.

**Einmalig einrichten:** im Repo unter *Settings → Pages* bei **Source**
`GitHub Actions` auswählen. Danach veröffentlicht jeder Push auf den
Branch automatisch. Die Adresse lautet

```
https://<dein-github-name>.github.io/-bungsklausur-ersteller-/
```

Diese Adresse auf dem Handy öffnen und über das Browser-Menü
„Installieren“ bzw. „Zum Home-Bildschirm hinzufügen“ ablegen. Danach hast
du ein App-Icon, und die App startet auch ohne Verbindung.

> Der OpenRouter-Key wird **in der App** unter *Einstellungen* eingetragen
> und bleibt in deinem Browser. Er landet nie im Repository und nie in der
> veröffentlichten Seite — auch wenn die Adresse öffentlich erreichbar ist,
> kann niemand auf deine Rechnung Aufgaben erzeugen.

## Lokal entwickeln

```bash
npm install
npm run dev      # http://localhost:3000
```

Den Static-Export so bauen und ansehen, wie er später veröffentlicht wird:

```bash
npm run build            # erzeugt out/
npx serve out            # oder ein beliebiger statischer Webserver
```

Der Service Worker ist im Entwicklungsmodus absichtlich abgeschaltet —
sonst bekämst du beim Weiterentwickeln ständig alte Fassungen aus dem
Zwischenspeicher.

## Offline-Betrieb

Nach dem ersten Aufruf funktionieren ohne Internet:

- Fragenpools ansehen, filtern, durchsuchen, Aufgaben aussortieren
- Klausuren zusammenstellen
- alle drei PDFs erzeugen und herunterladen

Eine Verbindung braucht **nur** das Erzeugen neuer Aufgaben und die
Gegenprüfung. Sämtliche Daten liegen in IndexedDB; die PDF-Erzeugung läuft
vollständig im Browser (jsPDF + KaTeX).

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

Damit die Konfiguration nicht auf jedem Gerät neu eingetippt werden muss, kann
sie fest in den Build wandern: im Repo unter *Settings → Secrets and variables →
Actions → Variables* diese vier **Variables** anlegen:

| Name | Wert aus der Firebase-Konsole |
| --- | --- |
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_APP_ID` | `appId` |

Danach zeigt die App nur noch „Mit Google anmelden“ — kein Abtippen mehr.

> Diese vier Werte sind **keine Geheimnisse**. Sie stecken in jeder
> Firebase-Web-App sichtbar im ausgelieferten JavaScript; abgesichert wird über
> die Firestore-Regeln und die Anmeldung, nicht über Geheimhaltung. Deshalb
> *Variables* und nicht *Secrets*.

Ohne Firebase-Konfiguration wird das SDK nie geladen — die App bleibt dann rein
lokal.

## Aufbau

```
src/
  app/                     Seiten (App Router, Static Export)
    pools/new/             Assistent zum Anlegen eines Pools
    pool/                  Poolansicht      (/pool/?id=…)
    pool/exam/             Klausur-Baukasten (/pool/exam/?id=…, offline)
    settings/              Key, Modelle, Synchronisierung
  lib/
    ai/                    Prompts, Analyse, Generierung, Gegenprüfung, Ablauf
    exam/                  Ziehung, HTML-Satz, PDF-Erzeugung
    extract/               PDF-/Bild-/Textextraktion im Browser
    sync/                  Firestore-Abgleich (optional)
    db.ts                  IndexedDB via Dexie, Export/Import
    latex.ts               Markdown + LaTeX → HTML (KaTeX)
    ai/models.ts           Modellliste von OpenRouter + Empfehlungen
    routes.ts              Adressen der Pool-Seiten
    basePath.ts            Unterpfad für GitHub Pages
  components/              UI-Bausteine
  types/                   Datenmodell
```

Der Ablauf einer Pool-Erzeugung steckt in `src/lib/ai/pipeline.ts`: Analyse →
Generierung (parallelisiert, in Stapeln) → Gegenprüfung. Jeder Zwischenstand
wird sofort gespeichert, ein Abbruch verliert also nichts.

## Modellauswahl

Die Auswahlliste wird zur Laufzeit von OpenRouter geholt (`/api/v1/models`) und
einen Tag lang zwischengespeichert — neue Modelle tauchen also von selbst auf,
ohne dass am Code etwas geändert werden muss. Angezeigt werden Preis,
Kontextfenster und ob das Modell Bilder lesen kann. Ist OpenRouter nicht
erreichbar, greift der Zwischenspeicher und zuletzt eine kleine eingebaute
Liste in `src/lib/ai/models.ts`.

Eigene Modell-IDs lassen sich unten im Auswahlfeld direkt eintippen. Steht eine
ID nicht in der geladenen Liste, weist die App darauf hin — das ist entweder ein
Tippfehler oder ein sehr neues Modell.

**Bildfähigkeit beachten:** Gescannte oder abfotografierte Klausuren werden als
Seitenbilder an das Modell geschickt. Ein reines Text-Modell (etwa DeepSeek R1)
kann sie nicht lesen; die App warnt, sobald Bilder im Material sind und das
gewählte Modell keine verarbeiten kann.

## Kosten im Blick behalten

Ein Pool mit 60 Aufgaben und eingeschalteter Gegenprüfung bedeutet grob 20–30
Generierungsaufrufe plus 60 Prüfaufrufe. Für einen ersten Versuch lohnt sich ein
kleiner Zielwert (etwa 20 Aufgaben) und ein günstiges Prüfmodell. Nachlegen geht
später jederzeit gezielt pro Aufgabentyp.

## Warum die Pool-Adressen einen Query-String haben

Ein Static Export muss alle Seiten zur Bauzeit kennen. Pool-IDs entstehen
aber erst im Browser, wenn du einen Pool anlegst — eine Seite pro Pool
lässt sich also nicht vorbauen. Deshalb `/pool/?id=…` statt `/pool/<id>`.
Die Adressen bildet `src/lib/routes.ts`; wer sie ändern will, muss nur
dort hin.
