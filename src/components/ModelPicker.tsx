"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CURATED_MODELS,
  formatContext,
  formatPrice,
  loadModels,
  type ModelSource,
} from "@/lib/ai/models";
import { Badge, Button, Spinner, TextInput } from "./ui";

/**
 * Auswahl eines OpenRouter-Modells: durchsuchbare Liste, die beim ersten
 * Öffnen die echten Modelle von OpenRouter lädt. Eigene IDs lassen sich
 * trotzdem eintippen — neue Modelle sind so sofort nutzbar, auch wenn
 * die Liste sie noch nicht kennt.
 */

const ORIGIN_LABELS: Record<ModelSource["origin"], string> = {
  live: "Liste von OpenRouter geladen",
  cache: "Liste aus dem Zwischenspeicher",
  curated: "Eingebaute Auswahl (OpenRouter nicht erreichbar)",
};

export function ModelPicker({
  value,
  onChange,
  label,
  hint,
  disabled,
  /** Markiert Modelle ohne Bildunterstützung als ungeeignet. */
  needsVision = false,
}: {
  value: string;
  onChange: (modelId: string) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  needsVision?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<ModelSource | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Geladen wird erst beim Aufklappen — das spart beim Seitenaufruf eine
   * unnötige Anfrage. Bewusst im Klick-Handler und nicht in einem Effekt.
   */
  function refresh(force = false) {
    if (loading) return;
    setLoading(true);
    void loadModels(force)
      .then(setSource)
      .finally(() => setLoading(false));
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !source) refresh();
  }

  // Klick außerhalb schließt die Liste.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const models = source?.models ?? CURATED_MODELS;

  const selected = useMemo(
    () => models.find((model) => model.id === value),
    [models, value]
  );

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? models.filter(
          (model) =>
            model.id.toLowerCase().includes(needle) ||
            model.name.toLowerCase().includes(needle)
        )
      : models;

    // Empfohlene Modelle zuerst, danach alphabetisch.
    const curatedIds = new Set(CURATED_MODELS.map((model) => model.id));
    return [...matching]
      .sort((a, b) => {
        const rank = Number(curatedIds.has(b.id)) - Number(curatedIds.has(a.id));
        return rank !== 0 ? rank : a.name.localeCompare(b.name);
      })
      .slice(0, 60);
  }, [models, query]);

  const unknownId = source !== null && !selected;
  const missesVision = needsVision && selected?.vision === false;

  return (
    <div ref={containerRef} className="relative">
      <span className="mb-1.5 block text-sm font-medium text-slate-200">{label}</span>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-left text-sm text-slate-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{selected?.name ?? value}</span>
          <span className="block truncate text-xs text-slate-500">{value}</span>
        </span>
        {selected?.free ? <Badge tone="green">gratis</Badge> : null}
        <span aria-hidden className="text-slate-500">
          ▾
        </span>
      </button>

      {hint ? <span className="mt-1.5 block text-xs text-slate-400">{hint}</span> : null}

      {missesVision ? (
        <span className="mt-1.5 block text-xs text-amber-300">
          Dieses Modell liest keine Bilder. Gescannte oder abfotografierte Klausuren kann es
          nicht auswerten — bei reinen Text-PDFs ist das egal.
        </span>
      ) : null}

      {unknownId ? (
        <span className="mt-1.5 block text-xs text-amber-300">
          Diese ID steht nicht in der Liste von OpenRouter. Tippfehler — oder ein sehr neues
          Modell.
        </span>
      ) : null}

      {open ? (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl shadow-black/50">
          <div className="border-b border-white/10 p-2">
            <TextInput
              autoFocus
              value={query}
              placeholder="Suchen, z.B. gemini flash …"
              aria-label="Modell suchen"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <ul role="listbox" className="max-h-80 overflow-y-auto">
            {loading && !source ? (
              <li className="flex items-center gap-2 px-3 py-4 text-sm text-slate-400">
                <Spinner /> Modellliste wird geladen …
              </li>
            ) : null}

            {results.map((model) => (
              <li key={model.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={model.id === value}
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                    model.id === value ? "bg-blue-500/15" : "hover:bg-white/5"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-100">{model.name}</span>
                    {model.free ? <Badge tone="green">gratis</Badge> : null}
                    {model.vision ? (
                      <Badge tone="blue" title="Kann Bilder lesen">
                        Bild
                      </Badge>
                    ) : null}
                    {needsVision && !model.vision ? (
                      <Badge tone="amber" title="Kann keine gescannten Klausuren lesen">
                        kein Bild
                      </Badge>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-slate-500">{model.id}</span>
                  <span className="text-xs text-slate-400">
                    {[formatPrice(model), formatContext(model)].filter(Boolean).join(" · ")}
                  </span>
                  {model.note ? (
                    <span className="text-xs text-slate-300">{model.note}</span>
                  ) : null}
                </button>
              </li>
            ))}

            {!loading && results.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-400">
                Nichts gefunden. Du kannst die Modell-ID unten direkt eintragen.
              </li>
            ) : null}
          </ul>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-2">
            <TextInput
              value={value}
              aria-label="Modell-ID direkt eingeben"
              placeholder="anbieter/modell"
              onChange={(event) => onChange(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button
              size="sm"
              disabled={loading}
              onClick={() => refresh(true)}
            >
              {loading ? <Spinner /> : null}
              Neu laden
            </Button>
          </div>

          {source ? (
            <p className="px-3 pb-2 text-[11px] text-slate-500">
              {ORIGIN_LABELS[source.origin]}
              {source.models.length > 0 ? ` · ${source.models.length} Modelle` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
