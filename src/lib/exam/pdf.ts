"use client";

import { SHEET_STYLES, type RenderedSheet } from "./render";

/**
 * PDF-Erzeugung passiert vollständig im Browser: Die Blöcke werden in
 * eine unsichtbare A4-breite Bühne gehängt, seitenweise gruppiert und
 * dann als Bild in ein jsPDF-Dokument gelegt. Kein Server, kein Netz —
 * damit klappt der Druck auch offline.
 */

// A4 bei 96 dpi, abzüglich 15 mm Rand auf jeder Seite.
const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;
const MARGIN_PX = 57;
const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 2 * MARGIN_PX;
const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - 2 * MARGIN_PX;

const MARGIN_MM = 15;
const A4_WIDTH_MM = 210;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - 2 * MARGIN_MM;

/** Doppelte Auflösung, sonst wirken die Formeln beim Drucken unscharf. */
const RENDER_SCALE = 2;

function createStage(): { stage: HTMLDivElement; cleanup: () => void } {
  const stage = document.createElement("div");
  stage.className = "sheet pdf-stage";
  stage.style.cssText = [
    "position:fixed",
    "top:0",
    `left:-${PAGE_WIDTH_PX * 2}px`,
    `width:${CONTENT_WIDTH_PX}px`,
    "background:#ffffff",
    "z-index:-1",
    "pointer-events:none",
  ].join(";");

  const style = document.createElement("style");
  style.textContent = SHEET_STYLES;

  document.body.append(style, stage);
  return {
    stage,
    cleanup: () => {
      stage.remove();
      style.remove();
    },
  };
}

/**
 * Verteilt die Blöcke auf Seiten, ohne innerhalb eines Blocks zu
 * trennen. Ein Block, der allein schon höher als eine Seite ist, bekommt
 * eine eigene Seite und darf überlaufen — besser als ihn zu zerreißen.
 */
function paginate(stage: HTMLDivElement, blocks: string[]): string[][] {
  const probe = document.createElement("div");
  probe.style.width = `${CONTENT_WIDTH_PX}px`;
  stage.append(probe);

  const pages: string[][] = [];
  let current: string[] = [];

  for (const block of blocks) {
    const candidate = [...current, block];
    probe.innerHTML = candidate.join("");

    if (probe.scrollHeight > CONTENT_HEIGHT_PX && current.length > 0) {
      pages.push(current);
      current = [block];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) pages.push(current);
  probe.remove();
  return pages.length > 0 ? pages : [[]];
}

/**
 * jsPDF und html2canvas werden nachgeladen, damit sie nicht in jedem
 * Seitenaufruf stecken. Genau deshalb müssen sie aber im Zwischenspeicher
 * liegen, bevor das Gerät offline geht — sonst scheitert ausgerechnet der
 * Export, der offline funktionieren soll. Diese Funktion holt die Bündel
 * vorab; der Klausur-Baukasten ruft sie beim Öffnen auf.
 */
let warmUpPromise: Promise<unknown> | null = null;

export function warmUpPdfEngine(): Promise<unknown> {
  warmUpPromise ??= Promise.all([import("html2canvas-pro"), import("jspdf")]).catch(
    (error) => {
      // Fehlschlag ist nicht schlimm: beim Export wird erneut geladen.
      warmUpPromise = null;
      throw error;
    }
  );
  return warmUpPromise;
}

export interface PdfProgress {
  page: number;
  totalPages: number;
}

/** Erzeugt das PDF eines Dokuments und gibt es als Blob zurück. */
export async function buildSheetPdf(
  sheet: RenderedSheet,
  onProgress?: (progress: PdfProgress) => void
): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const { stage, cleanup } = createStage();

  try {
    const pages = paginate(stage, sheet.blocks);
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

    for (const [index, pageBlocks] of pages.entries()) {
      const pageEl = document.createElement("div");
      pageEl.style.width = `${CONTENT_WIDTH_PX}px`;
      pageEl.style.background = "#ffffff";
      pageEl.innerHTML = pageBlocks.join("");
      stage.append(pageEl);

      // Webfonts müssen fertig sein, sonst rendert html2canvas Fallbacks.
      if (document.fonts?.ready) await document.fonts.ready;

      const canvas = await html2canvas(pageEl, {
        scale: RENDER_SCALE,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });

      if (index > 0) pdf.addPage();

      const heightMm = (canvas.height / canvas.width) * CONTENT_WIDTH_MM;
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        MARGIN_MM,
        MARGIN_MM,
        CONTENT_WIDTH_MM,
        heightMm,
        undefined,
        "FAST"
      );

      pageEl.remove();
      onProgress?.({ page: index + 1, totalPages: pages.length });
    }

    pdf.setProperties({ title: sheet.title, creator: "Übungsklausur-Ersteller" });
    return pdf.output("blob");
  } finally {
    cleanup();
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Erst freigeben, wenn der Download angestoßen ist.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadSheet(
  sheet: RenderedSheet,
  onProgress?: (progress: PdfProgress) => void
): Promise<void> {
  downloadBlob(await buildSheetPdf(sheet, onProgress), sheet.fileName);
}
