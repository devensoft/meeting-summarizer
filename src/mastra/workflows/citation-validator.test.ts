import { describe, expect, it } from 'bun:test';
import { isVerifiableQuote, stripInlineReferences, validateCitedPoints, validateCitedTopic, validateLineReferences } from './citation-validator';

const transcript = [
  '1 | We should ship Friday.',
  '2 | The budget is approved.',
  '3 |  Let\'s   review the roadmap next week.',
].join('\n');

describe('validateLineReferences', () => {
  it('keeps references inside the transcript and strips the rest', () => {
    expect(validateLineReferences([1, 4, 0, -2], 3)).toEqual([1]);
  });

  it('dedupes and sorts the survivors ascending', () => {
    expect(validateLineReferences([3, 1, 3, 2], 3)).toEqual([1, 2, 3]);
  });

  it('returns nothing when every reference is out of range', () => {
    expect(validateLineReferences([9, 10], 3)).toEqual([]);
  });
});

describe('isVerifiableQuote', () => {
  it('verifies a quote that appears in the transcript', () => {
    expect(isVerifiableQuote('The budget is approved.', transcript)).toBe(true);
  });

  it('verifies case-insensitively', () => {
    expect(isVerifiableQuote('the budget is approved', transcript)).toBe(true);
  });

  it('verifies whitespace-insensitively, across line boundaries and their NN | prefixes', () => {
    expect(isVerifiableQuote('Ship Friday. The budget', transcript)).toBe(true);
  });

  it('rejects a quote whose words the transcript does not contain', () => {
    expect(isVerifiableQuote('Ship Friday morning', transcript)).toBe(false);
  });

  it('rejects a quote against an empty transcript', () => {
    expect(isVerifiableQuote('The budget is approved.', '')).toBe(false);
  });

  it('rejects a blank quote', () => {
    expect(isVerifiableQuote('   ', transcript)).toBe(false);
  });
});

describe('validateCitedTopic', () => {
  it('validates references and records whether each quote verified', () => {
    const result = validateCitedTopic(
      {
        title: 'Launch plan',
        summary: [
          { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.' },
        ],
        keyInsights: [
          { statement: 'Budget approved', lineReferences: [2], quote: null },
        ],
        contextualHighlights: [],
      },
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result.title).toBe('Launch plan');
    expect(result.summary).toEqual([
      { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.', quoteVerified: true },
    ]);
    expect(result.keyInsights).toEqual([
      { statement: 'Budget approved', lineReferences: [2], quote: null, quoteVerified: false },
    ]);
    expect(result.contextualHighlights).toEqual([]);
  });

  it('keeps an unverifiable quote for unquoted rendering instead of dropping it', () => {
    const result = validateCitedTopic(
      {
        title: 'T',
        summary: [{ statement: 'S', lineReferences: [1], quote: 'words nobody said' }],
        keyInsights: [],
        contextualHighlights: [],
      },
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result.summary).toEqual([
      { statement: 'S', lineReferences: [1], quote: 'words nobody said', quoteVerified: false },
    ]);
  });

  it('strips invalid references and drops points left with none', () => {
    const result = validateCitedTopic(
      {
        title: 'T',
        summary: [
          { statement: 'Survives with fewer refs', lineReferences: [1, 40], quote: null },
          { statement: 'Dropped, fully uncited', lineReferences: [40, 41], quote: null },
        ],
        keyInsights: [],
        contextualHighlights: [],
      },
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result.summary).toEqual([
      { statement: 'Survives with fewer refs', lineReferences: [1], quote: null, quoteVerified: false },
    ]);
  });

  it('strips inline (Lnn) tokens the model leaked into statements', () => {
    const result = validateCitedTopic(
      {
        title: 'T',
        summary: [{ statement: 'Ship Friday (L1) at noon', lineReferences: [1], quote: null }],
        keyInsights: [],
        contextualHighlights: [],
      },
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result.summary[0]!.statement).toBe('Ship Friday at noon');
  });

  it('drops points whose statement is empty after stripping', () => {
    const result = validateCitedTopic(
      {
        title: 'T',
        summary: [{ statement: '  (L2)  ', lineReferences: [2], quote: null }],
        keyInsights: [],
        contextualHighlights: [],
      },
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result.summary).toEqual([]);
  });

  it('normalizes blank quotes to null', () => {
    const result = validateCitedTopic(
      {
        title: 'T',
        summary: [{ statement: 'S', lineReferences: [1], quote: '   ' }],
        keyInsights: [],
        contextualHighlights: [],
      },
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result.summary[0]!.quote).toBeNull();
  });
});

describe('validateCitedPoints', () => {
  it('applies the same discipline as validateCitedTopic to a standalone list — the index decision log reuses it', () => {
    const result = validateCitedPoints(
      [
        { statement: 'Ship Friday (L1)', lineReferences: [1], quote: 'We should ship Friday.' },
        { statement: 'Uncited claim', lineReferences: [40], quote: null },
      ],
      { lineCount: 3, transcriptContent: transcript },
    );

    expect(result).toEqual([
      { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.', quoteVerified: true },
    ]);
  });
});

describe('stripInlineReferences', () => {
  it('removes inline (Lnn) tokens from plain prose and collapses the whitespace', () => {
    expect(stripInlineReferences('Ship Friday (L1) at noon')).toBe('Ship Friday at noon');
  });

  it('trims the survivors', () => {
    expect(stripInlineReferences('  (L2)  ')).toBe('');
  });
});
