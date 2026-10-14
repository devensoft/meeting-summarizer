import type { CitedPoint, CitedTopicContent, ValidatedPoint } from './ingestion-wf.schemas';

/**
 * Citation discipline (spec: "Citation discipline") as deterministic code.
 *
 * Every line reference a model emits is validated against the normalized
 * transcript's line count — out-of-range references are stripped — and every
 * direct quote is verified against the normalized transcript
 * whitespace/case-insensitively, so a quote that survives says what the
 * transcript says. The topic-file renderer treats an unverified quote as
 * unquoted: it keeps the words but drops the quotation marks, which is why
 * the validator records verification instead of deleting the quote.
 */

/** Pattern of an inline `(Lnn)` citation token leaked into a statement. */
const INLINE_REFERENCE_PATTERN = /\(\s*L\d+\s*\)/gi;

/**
 * The normalized transcript citations are checked against (GLOSSARY.md:
 * "citation target") — its numbered text plus its line count, carried as data
 * from the read step and never recomputed. The clump travels together
 * through every citation-checking signature, so it has a name.
 */
export interface CitationTarget {
  transcriptContent: string;
  lineCount: number;
}

/** A cited topic content with every reference and quote checked. */
export interface ValidatedCitedTopic {
  title: string;
  summary: ValidatedPoint[];
  keyInsights: ValidatedPoint[];
  contextualHighlights: ValidatedPoint[];
}

/** Keeps the references that exist in `1..lineCount`; the survivors come
 * back deduplicated and ascending, so rendering is deterministic. */
export function validateLineReferences(lineReferences: number[], lineCount: number): number[] {
  const inRange = lineReferences.filter((reference) => Number.isInteger(reference) && reference >= 1 && reference <= lineCount);
  return [...new Set(inRange)].sort((a, b) => a - b);
}

/** True when `quote` appears in the numbered transcript, ignoring case and
 * whitespace — including across line boundaries, whose `NN |` prefixes and
 * newlines the comparison strips before matching. */
export function isVerifiableQuote(quote: string, transcriptContent: string): boolean {
  const trimmedQuote = quote.trim();
  if (trimmedQuote === '' || transcriptContent.trim() === '') {
    return false;
  }

  const corpus = transcriptContent
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d+\s*\|\s/, ''))
    .join(' ');

  return normalizeForQuoteMatch(corpus).includes(normalizeForQuoteMatch(trimmedQuote));
}

/** Whitespace/case-insensitive form of a quote-matching input. */
function normalizeForQuoteMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Validates a whole distilled topic: strips inline `(Lnn)` tokens from
 * statements (references render from the structured field, never from model
 * prose), drops points whose statement is empty after stripping or whose
 * references all fell out of range — an uncited claim must not render — and
 * records quote verification. The title is trimmed; contextual highlights
 * are validated like any other section (whether the section renders is the
 * renderer's meeting-context decision, not a citation matter).
 */
export function validateCitedTopic(content: CitedTopicContent, citationTarget: CitationTarget): ValidatedCitedTopic {
  return {
    title: content.title.trim(),
    summary: validateCitedPoints(content.summary, citationTarget),
    keyInsights: validateCitedPoints(content.keyInsights, citationTarget),
    contextualHighlights: validateCitedPoints(content.contextualHighlights, citationTarget),
  };
}

/** Validates one list of cited points — the same discipline
 * `validateCitedTopic` applies to each topic-file section, exported for the
 * transcript index's decision log (GLOSSARY.md: a decision record carries a
 * supporting quote and transcript line reference, verified like any note). */
export function validateCitedPoints(points: CitedPoint[], citationTarget: CitationTarget): ValidatedPoint[] {
  const validated: ValidatedPoint[] = [];
  for (const point of points) {
    const statement = stripInlineReferences(point.statement);
    const lineReferences = validateLineReferences(point.lineReferences, citationTarget.lineCount);
    if (statement === '' || lineReferences.length === 0) {
      continue;
    }

    const quote = point.quote?.trim() || null;
    validated.push({
      statement,
      lineReferences,
      quote,
      quoteVerified: quote !== null && isVerifiableQuote(quote, citationTarget.transcriptContent),
    });
  }
  return validated;
}

/** Removes inline `(Lnn)` tokens and collapses the whitespace they leave
 * behind. Exported for prose fields that carry no structured references —
 * the index's executive summary — so no unvalidated citation token can leak
 * into rendered markdown. */
export function stripInlineReferences(statement: string): string {
  return statement.replace(INLINE_REFERENCE_PATTERN, '').replace(/\s+/g, ' ').trim();
}
