import katex from "katex";

/**
 * Die Modelle liefern Aufgabentexte als leichtes Markdown mit
 * eingebettetem LaTeX. Hier wird daraus HTML — einmal für die Anzeige in
 * der App und einmal für den PDF-Export, damit beide identisch aussehen.
 *
 * Der Text stammt von einem Sprachmodell, also wird konsequent escaped,
 * bevor irgendetwas als HTML durchgereicht wird.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "html",
      trust: false,
    });
  } catch {
    // Unrettbares LaTeX wird lieber roh gezeigt als die Seite zu sprengen.
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br />");
}

/** Erkennt $$…$$ und $…$ und lässt \$ als echtes Dollarzeichen durch. */
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;

export function renderRichText(source: string): string {
  if (!source) return "";

  let html = "";
  let lastIndex = 0;

  for (const match of source.matchAll(MATH_PATTERN)) {
    const index = match.index ?? 0;
    html += inlineMarkdown(source.slice(lastIndex, index));

    const [, display, inline] = match;
    html += display !== undefined ? renderMath(display, true) : renderMath(inline, false);

    lastIndex = index + match[0].length;
  }

  html += inlineMarkdown(source.slice(lastIndex));
  return html.replace(/\\\$/g, "$");
}

/** Für Felder, die reines LaTeX enthalten (z.B. der Rechenweg). */
export function renderLatexBlock(tex: string): string {
  return renderMath(tex, true);
}
