"use client";

import { newId } from "@/lib/db";
import type { SourceDoc, SourceKind } from "@/types";

/**
 * Alles Einlesen passiert im Browser — hochgeladene Klausuren verlassen
 * das Gerät nur als Text bzw. Bild an das KI-Modell, und auch das nur
 * beim Analyse-Schritt.
 */

/** Seiten, die als Bild ans Vision-Modell gehen, wenn kein Text da ist. */
const MAX_RENDERED_PAGES = 8;
const RENDER_SCALE = 1.6;
const JPEG_QUALITY = 0.72;

/** Unter so vielen Zeichen pro Seite gilt ein PDF als Scan. */
const TEXT_PER_PAGE_THRESHOLD = 120;

export function guessKind(fileName: string): SourceKind {
  const name = fileName.toLowerCase();
  if (/(klausur|exam|pr(ü|ue)fung|test)/.test(name)) return "exam";
  if (/(skript|script|vorlesung|folien|slides)/.test(name)) return "script";
  if (/(blatt|sheet|(ü|ue)bung|aufgaben)/.test(name)) return "exercise-sheet";
  if (/(formel|formula)/.test(name)) return "formula-sheet";
  return "other";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${file.name} konnte nicht gelesen werden.`));
    reader.readAsDataURL(file);
  });
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  // Der Worker wird gebündelt mitgeliefert, damit auch offline geladen
  // werden kann — kein CDN.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

interface ExtractedContent {
  text: string;
  images: string[];
  pageCount: number;
}

async function extractPdf(file: File): Promise<ExtractedContent> {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(`— Seite ${pageNumber} —\n${text}`);
  }

  const joined = pages.join("\n\n");
  const charsPerPage = joined.length / Math.max(1, doc.numPages);
  const images: string[] = [];

  // Gescannte PDFs liefern kaum Text; dann werden die Seiten gerendert
  // und dem Vision-Modell vorgelegt.
  if (charsPerPage < TEXT_PER_PAGE_THRESHOLD) {
    const limit = Math.min(doc.numPages, MAX_RENDERED_PAGES);
    for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) continue;

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    }
  }

  await doc.destroy();
  return { text: joined, images, pageCount: doc.numPages };
}

async function extractText(file: File): Promise<ExtractedContent> {
  return { text: await file.text(), images: [], pageCount: 1 };
}

async function extractImage(file: File): Promise<ExtractedContent> {
  return { text: "", images: [await readAsDataUrl(file)], pageCount: 1 };
}

export async function extractDocument(
  file: File,
  poolId: string,
  kind?: SourceKind
): Promise<SourceDoc> {
  const type = file.type || "";
  let content: ExtractedContent;

  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    content = await extractPdf(file);
  } else if (type.startsWith("image/")) {
    content = await extractImage(file);
  } else if (type.startsWith("text/") || /\.(txt|md|tex|csv)$/i.test(file.name)) {
    content = await extractText(file);
  } else {
    throw new Error(
      `${file.name}: Format wird nicht unterstützt. Bitte PDF, Bild oder Textdatei hochladen.`
    );
  }

  if (!content.text.trim() && content.images.length === 0) {
    throw new Error(`${file.name}: Es ließ sich kein Inhalt auslesen.`);
  }

  return {
    id: newId("doc"),
    poolId,
    name: file.name,
    kind: kind ?? guessKind(file.name),
    mime: type || "application/octet-stream",
    text: content.text,
    images: content.images,
    pageCount: content.pageCount,
    addedAt: new Date().toISOString(),
  };
}
