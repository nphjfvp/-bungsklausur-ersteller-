import { renderLatexBlock, renderRichText } from "@/lib/latex";
import { DIFFICULTY_LABELS, type ExamConfig, type Question } from "@/types";

/**
 * Baut die drei Dokumente einer Klausur als Folge von HTML-Blöcken.
 * Blockweise deshalb, weil der PDF-Export beim Umbruch nie mitten in
 * einer Aufgabe trennen soll.
 */

export type SheetKind = "exam" | "answers" | "solutions";

export interface RenderedSheet {
  kind: SheetKind;
  title: string;
  fileName: string;
  /** Fertiges HTML je Block, in Druckreihenfolge. */
  blocks: string[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "klausur"
  );
}

function headerBlock(config: ExamConfig, subtitle: string, meta: string): string {
  return `
    <header class="sheet-header">
      <div class="sheet-header-top">
        <span>${escapeHtml(config.subject)}</span>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <h1>${escapeHtml(config.title)}</h1>
      <div class="sheet-meta">${escapeHtml(meta)}</div>
      ${
        config.instructions.trim()
          ? `<div class="sheet-instructions">${renderRichText(config.instructions)}</div>`
          : ""
      }
      <div class="sheet-nameline">
        <span>Name: ________________________________</span>
        <span>Matrikelnr.: ______________</span>
      </div>
    </header>
  `;
}

function subQuestionsHtml(question: Question, withAnswers: boolean): string {
  if (question.subQuestions.length === 0) return "";

  const items = question.subQuestions
    .map(
      (sub) => `
      <li>
        <div class="sub-prompt">
          <span class="sub-label">${escapeHtml(sub.label)})</span>
          <span>${renderRichText(sub.prompt)}</span>
          <span class="sub-points">(${sub.points} P.)</span>
        </div>
        ${withAnswers && sub.answer ? `<div class="sub-answer">${renderRichText(sub.answer)}</div>` : ""}
      </li>`
    )
    .join("");

  return `<ol class="sub-list">${items}</ol>`;
}

/** Dokument 1: die Klausur selbst, mit Platz zum Rechnen. */
export function renderExamSheet(config: ExamConfig, questions: Question[]): RenderedSheet {
  const totalPoints = questions.reduce((sum, question) => sum + question.points, 0);
  const meta = `${questions.length} Aufgaben · ${totalPoints} Punkte · Bearbeitungszeit ${config.durationMinutes} Minuten`;

  const blocks = [headerBlock(config, "Klausur", meta)];

  questions.forEach((question, index) => {
    // Der Platz zum Rechnen wächst mit dem Umfang der Aufgabe.
    const writingSpace = Math.min(280, Math.max(80, question.estimatedMinutes * 14));

    blocks.push(`
      <section class="question">
        <div class="question-head">
          <h2>Aufgabe ${index + 1}</h2>
          <span class="points">${question.points} Punkte</span>
        </div>
        <div class="question-body">${renderRichText(question.prompt)}</div>
        ${subQuestionsHtml(question, false)}
        <div class="writing-space" style="height:${writingSpace}px"></div>
      </section>
    `);
  });

  return {
    kind: "exam",
    title: config.title,
    fileName: `${slugify(config.title)}-klausur.pdf`,
    blocks,
  };
}

/** Dokument 2: nur die Ergebnisse, zum schnellen Abgleichen. */
export function renderAnswerSheet(config: ExamConfig, questions: Question[]): RenderedSheet {
  const blocks = [
    headerBlock(
      config,
      "Ergebnisse",
      `Kurzlösungen · Seed ${config.seed} · ${questions.length} Aufgaben`
    ),
  ];

  const rows = questions
    .map((question, index) => {
      const answer = question.subQuestions.length
        ? question.subQuestions
            .map(
              (sub) =>
                `<div class="answer-sub"><span class="sub-label">${escapeHtml(sub.label)})</span> ${renderRichText(sub.answer)}</div>`
            )
            .join("")
        : renderRichText(question.answer);

      return `
        <tr>
          <td class="answer-index">${index + 1}</td>
          <td class="answer-value">${answer}</td>
          <td class="answer-points">${question.points} P.</td>
        </tr>`;
    })
    .join("");

  blocks.push(`<table class="answer-table"><tbody>${rows}</tbody></table>`);

  return {
    kind: "answers",
    title: `${config.title} — Ergebnisse`,
    fileName: `${slugify(config.title)}-ergebnisse.pdf`,
    blocks,
  };
}

/** Dokument 3: ausführlicher Rechenweg, Kniffe hervorgehoben. */
export function renderSolutionSheet(config: ExamConfig, questions: Question[]): RenderedSheet {
  const trickCount = questions.reduce((sum, question) => sum + question.tricks.length, 0);

  const blocks = [
    headerBlock(
      config,
      "Musterlösung",
      `Ausführlicher Rechenweg · ${trickCount} markierte Kniffe · Seed ${config.seed}`
    ),
  ];

  questions.forEach((question, index) => {
    const steps = question.steps
      .map((step, stepIndex) => {
        const trick = step.trick
          ? `
            <div class="trick">
              <div class="trick-label">💡 Kniff: ${escapeHtml(step.trick.label)}</div>
              <div class="trick-text">${renderRichText(step.trick.explanation)}</div>
              ${
                step.trick.withoutTrick
                  ? `<div class="trick-alt"><strong>Ohne diesen Kniff:</strong> ${renderRichText(step.trick.withoutTrick)}</div>`
                  : ""
              }
            </div>`
          : "";

        return `
          <li class="step${step.trick ? " step-trick" : ""}">
            <div class="step-number">${stepIndex + 1}</div>
            <div class="step-content">
              <div class="step-text">${renderRichText(step.text)}</div>
              ${step.latex ? `<div class="step-latex">${renderLatexBlock(step.latex)}</div>` : ""}
              ${trick}
            </div>
          </li>`;
      })
      .join("");

    blocks.push(`
      <section class="solution">
        <div class="question-head">
          <h2>Aufgabe ${index + 1}</h2>
          <span class="points">${question.points} Punkte · ${escapeHtml(question.taskTypeName)} · ${escapeHtml(DIFFICULTY_LABELS[question.difficulty])}</span>
        </div>
        <div class="question-body">${renderRichText(question.prompt)}</div>
        ${subQuestionsHtml(question, true)}
        ${steps ? `<ol class="step-list">${steps}</ol>` : ""}
        <div class="final-answer"><strong>Ergebnis:</strong> ${renderRichText(question.answer)}</div>
      </section>
    `);
  });

  return {
    kind: "solutions",
    title: `${config.title} — Musterlösung`,
    fileName: `${slugify(config.title)}-musterloesung.pdf`,
    blocks,
  };
}

export function renderAllSheets(config: ExamConfig, questions: Question[]): RenderedSheet[] {
  return [
    renderExamSheet(config, questions),
    renderAnswerSheet(config, questions),
    renderSolutionSheet(config, questions),
  ];
}

/** Gemeinsames Stylesheet für Bildschirmvorschau, Druck und PDF-Export. */
export const SHEET_STYLES = `
.sheet {
  font-family: "Times New Roman", Georgia, serif;
  color: #111;
  background: #fff;
  font-size: 11.5pt;
  line-height: 1.5;
}
.sheet-header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
.sheet-header-top {
  display: flex; justify-content: space-between;
  font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #555;
}
.sheet-header h1 { font-size: 19pt; margin: 6px 0 2px; font-weight: 700; }
.sheet-meta { font-size: 10pt; color: #444; }
.sheet-instructions {
  margin-top: 10px; padding: 8px 10px; border: 1px solid #bbb;
  background: #f6f6f6; font-size: 10pt;
}
.sheet-nameline {
  display: flex; justify-content: space-between; gap: 24px;
  margin-top: 14px; font-size: 10.5pt;
}
.question, .solution { margin-bottom: 22px; }
.question-head {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 8px;
}
.question-head h2 { font-size: 13pt; margin: 0; font-weight: 700; }
.points { font-size: 9.5pt; color: #555; white-space: nowrap; }
.question-body { margin-bottom: 8px; }
.sub-list { list-style: none; margin: 8px 0 0; padding: 0; }
.sub-list > li { margin-bottom: 8px; }
.sub-prompt { display: flex; gap: 6px; align-items: baseline; }
.sub-label { font-weight: 700; }
.sub-points { margin-left: auto; font-size: 9.5pt; color: #666; white-space: nowrap; }
.sub-answer { margin: 4px 0 0 20px; padding-left: 8px; border-left: 3px solid #888; }
.writing-space { border-bottom: 1px dotted #ccc; }
.answer-table { width: 100%; border-collapse: collapse; }
.answer-table td { border-bottom: 1px solid #ddd; padding: 7px 6px; vertical-align: top; }
.answer-index { width: 32px; font-weight: 700; }
.answer-points { width: 56px; text-align: right; color: #666; font-size: 9.5pt; }
.answer-sub { margin-bottom: 3px; }
.step-list { list-style: none; margin: 10px 0 0; padding: 0; }
.step { display: flex; gap: 10px; margin-bottom: 10px; }
.step-number {
  flex: 0 0 22px; height: 22px; border-radius: 50%; background: #e8e8e8;
  text-align: center; line-height: 22px; font-size: 9.5pt; font-weight: 700;
}
.step-content { flex: 1; min-width: 0; }
.step-latex { margin: 6px 0; overflow-x: auto; }
.step-trick .step-number { background: #ffd84d; }
.trick {
  margin-top: 6px; padding: 8px 10px; border-left: 4px solid #e8a800;
  background: #fff8e1; font-size: 10pt;
}
.trick-label { font-weight: 700; margin-bottom: 3px; }
.trick-alt { margin-top: 4px; color: #6b5a1f; }
.final-answer {
  margin-top: 10px; padding: 7px 10px; background: #eef4ff; border-left: 4px solid #3b6fd4;
}
.katex { font-size: 1em; }
.katex-display { margin: 0.4em 0; }
`;
