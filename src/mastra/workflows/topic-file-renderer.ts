import type { ValidatedPoint, ValidatedTopicFile } from './ingestion-wf.schemas';

/**
 * Topic-file renderer (spec: "Per-topic files are schema-enforced").
 *
 * The markdown of a topic file is assembled here, in code, from validated
 * structured output — no free-form model markdown reaches the file. Sections
 * render in fixed order — Title, Summary, Key Insights, Contextual
 * Highlights — every point carries its validated `(Lnn)` references, and a
 * verified quote renders as a quotation while an unverified one renders
 * unquoted. Contextual Highlights exist only when meeting context exists;
 * any section left empty by validation is omitted entirely, so no empty
 * headers reach the file.
 */

/** Renders the full markdown document for one validated topic file. */
export function renderTopicFile(file: ValidatedTopicFile): string {
  const sections = [
    `# ${file.title}`,
    renderSection('Summary', file.summary, file.hasMeetingContext),
    renderSection('Key Insights', file.keyInsights, file.hasMeetingContext),
    renderSection('Contextual Highlights', file.contextualHighlights, file.hasMeetingContext),
  ];

  return `${sections.filter((section) => section !== null).join('\n')}\n`;
}

/** Renders one `##` section, or null when it must be omitted: sections with
 * no points never render, and Contextual Highlights additionally require
 * meeting context. */
function renderSection(heading: string, points: ValidatedPoint[], hasMeetingContext: boolean): string | null {
  if (points.length === 0 || (heading === 'Contextual Highlights' && !hasMeetingContext)) {
    return null;
  }

  return ['', `## ${heading}`, '', ...points.map(renderPoint)].join('\n');
}

/** Renders one bullet: the statement with its comma-separated `(Lnn)`
 * citation, then the quote line — a blockquote quotation when the quote was
 * verified against the transcript, bare text otherwise. */
function renderPoint(point: ValidatedPoint): string {
  return `- ${renderCitedPointBody(point)}`;
}

/** Renders the statement with its comma-separated `(Lnn)` citation plus the
 * quote line — a blockquote quotation when the quote was verified against
 * the transcript, bare text otherwise. Shared with the transcript index's
 * decision log so both documents quote identically. */
export function renderCitedPointBody(point: ValidatedPoint): string {
  const references = point.lineReferences.map((line) => `L${line}`).join(', ');
  const body = `${point.statement} (${references})`;

  if (point.quote === null) {
    return body;
  }
  return point.quoteVerified ? `${body}\n  > "${point.quote}"` : `${body}\n  ${point.quote}`;
}
