import { describe, expect, it } from 'bun:test';
import { renderTopicFile } from './topic-file-renderer';
import type { ValidatedTopicFile } from './ingestion-wf.schemas';

function topicFile(overrides: Partial<ValidatedTopicFile> = {}): ValidatedTopicFile {
  return {
    topic: 'Launch plan',
    title: 'Launch plan',
    summary: [{ statement: 'Ship Friday', lineReferences: [1], quote: null, quoteVerified: false }],
    keyInsights: [{ statement: 'Budget approved', lineReferences: [2], quote: null, quoteVerified: false }],
    contextualHighlights: [],
    hasMeetingContext: false,
    isSegment: false,
    meetingDirectoryName: '2026-10-14',
    ...overrides,
  };
}

describe('renderTopicFile', () => {
  it('renders the fixed sections in fixed order under the title', () => {
    expect(
      renderTopicFile(
        topicFile({
          summary: [{ statement: 'Ship Friday', lineReferences: [1], quote: null, quoteVerified: false }],
          keyInsights: [{ statement: 'Budget approved', lineReferences: [2], quote: null, quoteVerified: false }],
        }),
      ),
    ).toBe(
      [
        '# Launch plan',
        '',
        '## Summary',
        '',
        '- Ship Friday (L1)',
        '',
        '## Key Insights',
        '',
        '- Budget approved (L2)',
        '',
      ].join('\n'),
    );
  });

  it('renders multiple references as a comma-separated (Lnn) citation', () => {
    const markdown = renderTopicFile(
      topicFile({ summary: [{ statement: 'Ship Friday', lineReferences: [1, 3, 12], quote: null, quoteVerified: false }] }),
    );

    expect(markdown).toContain('- Ship Friday (L1, L3, L12)');
  });

  it('renders a verified quote as an indented quotation', () => {
    const markdown = renderTopicFile(
      topicFile({
        summary: [
          { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.', quoteVerified: true },
        ],
      }),
    );

    expect(markdown).toContain('- Ship Friday (L1)\n  > "We should ship Friday."');
  });

  it('renders an unverified quote unquoted — same words, no quotation marks', () => {
    const markdown = renderTopicFile(
      topicFile({
        summary: [
          { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.', quoteVerified: false },
        ],
      }),
    );

    expect(markdown).toContain('- Ship Friday (L1)\n  We should ship Friday.');
    expect(markdown).not.toContain('"We should ship Friday."');
  });

  it('omits the Contextual Highlights section entirely when no meeting context exists', () => {
    const markdown = renderTopicFile(
      topicFile({
        contextualHighlights: [{ statement: 'Ties to the series goal', lineReferences: [4], quote: null, quoteVerified: false }],
        hasMeetingContext: false,
      }),
    );

    expect(markdown).not.toContain('Contextual Highlights');
  });

  it('omits Contextual Highlights when there is context but nothing to highlight', () => {
    const markdown = renderTopicFile(topicFile({ hasMeetingContext: true, contextualHighlights: [] }));

    expect(markdown).not.toContain('Contextual Highlights');
  });

  it('renders Contextual Highlights last when meeting context exists', () => {
    const markdown = renderTopicFile(
      topicFile({
        contextualHighlights: [
          { statement: 'Ties to the series goal', lineReferences: [4], quote: null, quoteVerified: false },
        ],
        hasMeetingContext: true,
      }),
    );

    const summaryAt = markdown.indexOf('## Summary');
    const insightsAt = markdown.indexOf('## Key Insights');
    const highlightsAt = markdown.indexOf('## Contextual Highlights');
    expect(highlightsAt).toBeGreaterThan(insightsAt);
    expect(insightsAt).toBeGreaterThan(summaryAt);
    expect(markdown).toContain('- Ties to the series goal (L4)');
  });

  it('omits a section whose points all failed validation instead of rendering it empty', () => {
    const markdown = renderTopicFile(topicFile({ summary: [], keyInsights: [], contextualHighlights: [] }));

    expect(markdown).toBe('# Launch plan\n');
  });
});
