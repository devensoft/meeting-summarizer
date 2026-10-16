import { describe, expect, it } from 'bun:test';
import { renderTopicFile } from './topic-file-renderer';
import type { ComposedTopicFile, EnrichedConcept } from './ingestion-wf.schemas';

function concept(overrides: Partial<EnrichedConcept> = {}): EnrichedConcept {
  return {
    informalMention: 'five whys',
    formalFoundation: 'Root cause analysis',
    blurb: 'An iterative questioning technique for finding the root cause of a problem.',
    links: [{ title: 'Five whys — Wikipedia', url: 'https://en.wikipedia.org/wiki/Five_whys' }],
    grounding: 'web-search',
    ...overrides,
  };
}

function topicFile(overrides: Partial<ComposedTopicFile> = {}): ComposedTopicFile {
  return {
    topic: 'Launch plan',
    title: 'Launch plan',
    fileName: 'launch-plan',
    summary: [{ statement: 'Ship Friday', lineReferences: [1], quote: null, quoteVerified: false }],
    keyInsights: [{ statement: 'Budget approved', lineReferences: [2], quote: null, quoteVerified: false }],
    contextualHighlights: [],
    enrichedConcepts: [],
    hasMeetingContext: false,
    isSegment: false,
    meetingDirectoryName: '2026-10-14',
    transcriptContent: '1 | We talk about launch\n',
    conceptCandidates: [],
    conceptSearches: [],
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

  it('renders Enriched Concepts last, after Contextual Highlights, in the fixed section order', () => {
    const markdown = renderTopicFile(
      topicFile({
        contextualHighlights: [
          { statement: 'Ties to the series goal', lineReferences: [4], quote: null, quoteVerified: false },
        ],
        hasMeetingContext: true,
        enrichedConcepts: [concept()],
      }),
    );

    const summaryAt = markdown.indexOf('## Summary');
    const insightsAt = markdown.indexOf('## Key Insights');
    const highlightsAt = markdown.indexOf('## Contextual Highlights');
    const conceptsAt = markdown.indexOf('## Enriched Concepts');
    expect(conceptsAt).toBeGreaterThan(highlightsAt);
    expect(highlightsAt).toBeGreaterThan(insightsAt);
    expect(insightsAt).toBeGreaterThan(summaryAt);
  });

  it('omits the Enriched Concepts section entirely when a topic proposed no candidates', () => {
    const markdown = renderTopicFile(topicFile({ enrichedConcepts: [] }));

    expect(markdown).not.toContain('Enriched Concepts');
  });

  it('renders each concept as mention → foundation, its blurb, its grounding label, and its links', () => {
    const markdown = renderTopicFile(
      topicFile({
        enrichedConcepts: [
          concept({
            links: [
              { title: 'Five whys — Wikipedia', url: 'https://en.wikipedia.org/wiki/Five_whys' },
              { title: 'The Five Whys, explained', url: 'https://example.com/five-whys-explained' },
            ],
          }),
        ],
      }),
    );

    expect(markdown).toContain(
      [
        '## Enriched Concepts',
        '',
        '- **five whys** → Root cause analysis',
        '  An iterative questioning technique for finding the root cause of a problem.',
        '  Grounding: web search',
        '  - [Five whys — Wikipedia](https://en.wikipedia.org/wiki/Five_whys)',
        '  - [The Five Whys, explained](https://example.com/five-whys-explained)',
      ].join('\n'),
    );
  });

  it('labels model-suggested links as unverified', () => {
    const markdown = renderTopicFile(
      topicFile({
        enrichedConcepts: [concept({ grounding: 'model-suggested', links: [] })],
      }),
    );

    expect(markdown).toContain('Grounding: model-suggested (unverified)');
    expect(markdown).not.toContain('Grounding: web search');
  });

  it('renders a concept without links as blurb and grounding label only', () => {
    const markdown = renderTopicFile(
      topicFile({ enrichedConcepts: [concept({ grounding: 'model-suggested', links: [] })] }),
    );

    expect(markdown).toContain('- **five whys** → Root cause analysis');
    expect(markdown).toContain('  Grounding: model-suggested (unverified)');
    expect(markdown).not.toContain('](');
  });

  it('notes a searched concept left with zero links after matching, instead of showing nothing after its label', () => {
    const markdown = renderTopicFile(
      topicFile({ enrichedConcepts: [concept({ grounding: 'web-search', links: [] })] }),
    );

    expect(markdown).toContain('  Grounding: web search\n  (no links returned)');
  });
});
