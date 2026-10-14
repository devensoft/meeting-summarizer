import type { ComposedTopicFile, EnrichedConcept, ValidatedPoint } from './ingestion-wf.schemas';

/**
 * Topic-file renderer (spec: "Per-topic files are schema-enforced").
 *
 * The markdown of a topic file is assembled here, in code, from validated
 * structured output — no free-form model markdown reaches the file. Sections
 * render in fixed order — Title, Summary, Key Insights, Contextual
 * Highlights, Enriched Concepts — every point carries its validated `(Lnn)`
 * references, and a verified quote renders as a quotation while an unverified
 * one renders unquoted. Contextual Highlights exist only when meeting context
 * exists, and Enriched Concepts only when the topic proposed candidates; any
 * section left empty by validation is omitted entirely, so no empty headers
 * reach the file.
 */

/** Renders the full markdown document for one validated topic file. */
export function renderTopicFile(file: ComposedTopicFile): string {
  const sections = [
    `# ${file.title}`,
    renderSection('Summary', file.summary, file.hasMeetingContext),
    renderSection('Key Insights', file.keyInsights, file.hasMeetingContext),
    renderSection('Contextual Highlights', file.contextualHighlights, file.hasMeetingContext),
    renderConceptsSection(file.enrichedConcepts),
  ];

  return `${sections.filter((section) => section !== null).join('\n')}\n`;
}

/** Renders the Enriched Concepts section, or null when the topic proposed no
 * candidates — the section never renders empty. */
function renderConceptsSection(concepts: readonly EnrichedConcept[]): string | null {
  if (concepts.length === 0) {
    return null;
  }

  return ['', '## Enriched Concepts', '', ...concepts.map(renderConcept)].join('\n');
}

/** Renders one concept: the informal mention tied to its formal foundation,
 * the blurb beneath it, the provenance label, then its reference links. A
 * searched concept left with zero links after matching shows an explicit
 * note instead of nothing after its provenance label. */
function renderConcept(concept: EnrichedConcept): string {
  return [
    `- **${concept.informalMention}** → ${concept.formalFoundation}`,
    `  ${concept.blurb}`,
    `  ${groundingLabel(concept.grounding)}`,
    ...conceptLinks(concept),
  ].join('\n');
}

/** The concept's link lines: one bullet per link, or the explicit
 * `(no links returned)` note for a searched concept the matching left empty —
 * a model-suggested concept without links stays bare, as before. */
function conceptLinks(concept: EnrichedConcept): string[] {
  if (concept.links.length === 0) {
    return concept.grounding === 'web-search' ? ['  (no links returned)'] : [];
  }
  return concept.links.map((link) => `  - [${link.title}](${link.url})`);
}

/** The provenance label spec'd for enriched concepts: searched links say so;
 * model-proposed links (allowed only when the chain yielded nothing) carry
 * the unverified label. */
function groundingLabel(grounding: EnrichedConcept['grounding']): string {
  return grounding === 'web-search' ? 'Grounding: web search' : 'Grounding: model-suggested (unverified)';
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
