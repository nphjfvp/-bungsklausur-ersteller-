"use client";

import { useMemo } from "react";
import { renderLatexBlock, renderRichText } from "@/lib/latex";

/**
 * Zeigt Aufgabentext mit eingebetteten Formeln. Der HTML-Code kommt aus
 * renderRichText, das alles escaped und nur KaTeX-Ausgabe durchlässt.
 */
export function RichText({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  const html = useMemo(() => renderRichText(children ?? ""), [children]);
  return (
    <div
      className={`richtext ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Für Felder, die reines LaTeX enthalten. */
export function LatexBlock({ tex, className = "" }: { tex: string; className?: string }) {
  const html = useMemo(() => renderLatexBlock(tex ?? ""), [tex]);
  return (
    <div
      className={`overflow-x-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
