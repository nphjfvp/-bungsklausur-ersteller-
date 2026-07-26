"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  Spinner,
  TextArea,
  TextInput,
  Toggle,
} from "@/components/ui";
import { ModelPicker } from "@/components/ModelPicker";
import { getSettings, saveSettings } from "@/lib/db";
import {
  FIRESTORE_RULES,
  configFromEnv,
  currentAccount,
  signIn,
  signOut,
  syncNow,
  type SyncAccount,
  type SyncReport,
} from "@/lib/sync/firebase";
import type { FirebaseConfig, Settings } from "@/types";

const EMPTY_FIREBASE: FirebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [firebase, setFirebase] = useState<FirebaseConfig>(EMPTY_FIREBASE);
  const [account, setAccount] = useState<SyncAccount | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await getSettings();
      setSettings(stored);
      setFirebase(stored.firebase ?? EMPTY_FIREBASE);

      try {
        setAccount(await currentAccount());
      } catch {
        setAccount(null);
      }
    })();
  }, []);

  async function persist(patch: Partial<Settings>) {
    const next = await saveSettings(patch);
    setSettings(next);
    setMessage("Gespeichert.");
    setError(null);
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setReport(null);
    try {
      setReport(await syncNow());
      setMessage("Synchronisierung abgeschlossen.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  }

  if (!settings) return <p className="text-sm text-slate-400">Wird geladen …</p>;

  // Ist Firebase beim Bauen mitgegeben worden, muss auf keinem Gerät
  // mehr etwas eingetippt werden.
  const envConfig = configFromEnv();
  const manualConfigured = Boolean(firebase.apiKey && firebase.projectId);
  const syncConfigured = manualConfigured || envConfig !== null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Einstellungen</h1>
        <p className="mt-1 text-sm text-slate-400">
          Alles hier bleibt auf diesem Gerät. Weder Key noch Firebase-Zugangsdaten werden
          synchronisiert.
        </p>
      </div>

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">OpenRouter</h2>
        <p className="mb-4 text-sm text-slate-400">
          Wird nur zum Erzeugen und Prüfen von Aufgaben gebraucht. Klausuren bauen und
          drucken geht auch ohne.
        </p>

        <Field
          label="API-Key"
          hint={
            <>
              Kostenlos anlegbar unter openrouter.ai. Der Key wird im Browser gespeichert und
              geht direkt an OpenRouter.
            </>
          }
        >
          <TextInput
            type="password"
            autoComplete="off"
            value={settings.openRouterKey}
            placeholder="sk-or-v1-…"
            onChange={(event) =>
              setSettings({ ...settings, openRouterKey: event.target.value })
            }
          />
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ModelPicker
            label="Standardmodell zum Erzeugen"
            value={settings.generatorModel}
            onChange={(generatorModel) => setSettings({ ...settings, generatorModel })}
            hint="Vorbelegung für neue Fragenpools."
          />
          <ModelPicker
            label="Standardmodell zum Gegenprüfen"
            value={settings.checkerModel}
            onChange={(checkerModel) => setSettings({ ...settings, checkerModel })}
          />
        </div>

        <Button
          variant="primary"
          className="mt-4"
          onClick={() =>
            void persist({
              openRouterKey: settings.openRouterKey,
              generatorModel: settings.generatorModel,
              checkerModel: settings.checkerModel,
            })
          }
        >
          Speichern
        </Button>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">Geräte-Synchronisierung</h2>
        <p className="mb-4 text-sm text-slate-400">
          Optional. Ohne diese Einrichtung liegen alle Fragenpools nur auf diesem Gerät —
          du kannst sie dann trotzdem über „Als Datei exportieren“ übertragen.
        </p>

        <Toggle
          checked={settings.syncEnabled}
          onChange={(value) => void persist({ syncEnabled: value })}
          label="Über Firebase synchronisieren"
          description="Fragenpools, Aufgaben und Klausuren werden mit deinem Google-Konto abgeglichen. Firestore hält eine lokale Kopie vor, der Abgleich holt Änderungen also auch nach Offline-Phasen nach."
        />

        {settings.syncEnabled ? (
          <div className="mt-4 space-y-4">
            {envConfig ? (
              <Notice tone="success" title="Firebase ist bereits eingebaut">
                Projekt <strong>{envConfig.projectId}</strong> kam mit dem Build mit. Du musst
                hier nichts eintragen — nur einmal anmelden.
              </Notice>
            ) : null}

            <details className="rounded-lg border border-white/10 bg-slate-900/40 p-3" open={!envConfig}>
              <summary className="cursor-pointer text-sm font-medium text-slate-200">
                {envConfig
                  ? "Abweichendes Firebase-Projekt verwenden"
                  : "Firebase-Konfiguration eintragen"}
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["apiKey", "API-Key"],
                    ["projectId", "Projekt-ID"],
                    ["authDomain", "Auth-Domain"],
                    ["appId", "App-ID"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <TextInput
                      value={firebase[key]}
                      onChange={(event) =>
                        setFirebase({ ...firebase, [key]: event.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
              <Button className="mt-3" onClick={() => void persist({ firebase })}>
                Konfiguration speichern
              </Button>
            </details>

            <div className="flex flex-wrap gap-2">

              {account ? (
                <>
                  <Badge tone="green">Angemeldet als {account.email ?? account.uid}</Badge>
                  <Button
                    variant="primary"
                    disabled={syncing}
                    onClick={() => void handleSync()}
                  >
                    {syncing ? <Spinner /> : null}
                    Jetzt synchronisieren
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void signOut().then(() => {
                        setAccount(null);
                        setReport(null);
                      })
                    }
                  >
                    Abmelden
                  </Button>
                </>
              ) : (
                <Button
                  disabled={!syncConfigured}
                  onClick={() =>
                    void signIn()
                      .then(setAccount)
                      .catch((cause) =>
                        setError(cause instanceof Error ? cause.message : String(cause))
                      )
                  }
                >
                  Mit Google anmelden
                </Button>
              )}
            </div>

            {report ? (
              <Notice tone="success" title="Abgleich fertig">
                Hochgeladen: {report.pushed.pools} Pools, {report.pushed.questions} Aufgaben.
                Heruntergeladen: {report.pulled.pools} Pools, {report.pulled.questions} Aufgaben.
              </Notice>
            ) : null}

            <details className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-200">
                Was muss in der Firebase-Konsole eingerichtet sein?
              </summary>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
                <li>Firebase-Projekt anlegen und eine Web-App hinzufügen.</li>
                <li>Unter „Authentication“ den Anbieter Google aktivieren.</li>
                <li>
                  Eine Firestore-Datenbank anlegen und diese Sicherheitsregeln setzen — sie
                  sorgen dafür, dass jeder nur an die eigenen Daten kommt:
                </li>
              </ol>
              <TextArea
                readOnly
                rows={9}
                value={FIRESTORE_RULES}
                className="mt-3 font-mono text-xs"
              />
              <p className="mt-2 text-xs text-slate-400">
                Die Werte für API-Key, Projekt-ID und App-ID stehen in den Projekt-
                einstellungen unter „Meine Apps“.
              </p>
            </details>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-white">Offline nutzen</h2>
        <p className="text-sm text-slate-400">
          Die App installiert sich als PWA: im Browser-Menü „Zum Startbildschirm hinzufügen“
          bzw. „Installieren“ wählen. Danach starten Fragenpool-Ansicht, Klausur-Baukasten
          und PDF-Export auch ohne Internet. Nur das Erzeugen neuer Aufgaben braucht eine
          Verbindung.
        </p>
      </Card>
    </div>
  );
}
