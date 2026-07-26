"use client";

import { useRef, useState } from "react";
import { extractDocument } from "@/lib/extract";
import type { SourceDoc, SourceKind } from "@/types";
import { Badge, Button, Select, Spinner } from "./ui";

const KIND_LABELS: Record<SourceKind, string> = {
  exam: "Übungsklausur",
  script: "Skript",
  "exercise-sheet": "Übungsblatt",
  "formula-sheet": "Formelsammlung",
  other: "Sonstiges",
};

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.tex,.csv";

/**
 * Mehrere Dokumente hochladen, damit die App alle Aufgabentypen zu sehen
 * bekommt. Das Einlesen passiert lokal im Browser.
 */
export function UploadZone({
  poolId,
  docs,
  onChange,
}: {
  poolId: string;
  docs: SourceDoc[];
  onChange: (docs: SourceDoc[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function ingest(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;

    setBusy(true);
    setErrors([]);

    const added: SourceDoc[] = [];
    const failed: string[] = [];

    for (const file of list) {
      try {
        added.push(await extractDocument(file, poolId));
      } catch (error) {
        failed.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (added.length > 0) onChange([...docs, ...added]);
    setErrors(failed);
    setBusy(false);
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void ingest(event.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragging ? "border-blue-400 bg-blue-500/10" : "border-white/15 bg-white/[0.02]"
        }`}
      >
        <p className="text-sm text-slate-200">
          Übungsklausuren, Skripte und Übungsblätter hierher ziehen
        </p>
        <p className="mt-1 text-xs text-slate-400">
          PDF, Bilder oder Textdateien. Je mehr Material, desto vollständiger erkennt die App
          die Aufgabentypen.
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void ingest(event.target.files);
            event.target.value = "";
          }}
        />

        <Button
          type="button"
          variant="primary"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Spinner /> : null}
          {busy ? "Wird eingelesen …" : "Dateien auswählen"}
        </Button>
      </div>

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-red-300">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      {docs.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-slate-100" title={doc.name}>
                {doc.name}
              </span>

              <Badge tone={doc.images.length > 0 ? "amber" : "neutral"}>
                {doc.images.length > 0
                  ? `${doc.images.length} Seitenbilder`
                  : `${Math.round(doc.text.length / 1000)}k Zeichen`}
              </Badge>

              <Select
                value={doc.kind}
                aria-label={`Art von ${doc.name}`}
                className="w-auto py-1 text-xs"
                onChange={(event) =>
                  onChange(
                    docs.map((entry) =>
                      entry.id === doc.id
                        ? { ...entry, kind: event.target.value as SourceKind }
                        : entry
                    )
                  )
                }
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${doc.name} entfernen`}
                onClick={() => onChange(docs.filter((entry) => entry.id !== doc.id))}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
