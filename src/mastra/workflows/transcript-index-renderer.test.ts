import { describe, expect, it } from 'bun:test';
import { renderTopicIndex } from './transcript-index-renderer';
import type { ClassifiedTopic, ValidatedTopicIndex } from './ingestion-wf.schemas';

function index(overrides: Partial<ValidatedTopicIndex> = {}): ValidatedTopicIndex {
  return {
    title: 'Q3 product sync',
    executiveSummary: 'The team aligned on the launch.',
    recurringThemes: [{ theme: 'Rollout timing', topicFileNames: ['launch-plan', 'budget-review'] }],
    decisions: [
      { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.', quoteVerified: true },
      { statement: 'Budget approved', lineReferences: [2], quote: null, quoteVerified: false },
    ],
    actionItems: [{ assigner: 'Dana', assignee: 'Ari', dueDate: '2026-03-01', deliverable: 'Draft rollout plan' }],
    unresolvedItems: [{ statement: 'Does the budget cover hiring?', lineReferences: [2] }],
    ...overrides,
  };
}

const topicFileNames = ['launch-plan', 'budget-review'];

const omittedTopics: ClassifiedTopic[] = [
  { topic: 'Office move small talk', lineRanges: [{ startLine: 40, endLine: 45 }] },
];

function fullExpectedDocument(): string {
  return [
    '# Q3 product sync',
    '',
    '## Executive Summary',
    '',
    'The team aligned on the launch.',
    '',
    '## Topic Index',
    '',
    '- [[launch-plan]]',
    '- [[budget-review]]',
    '',
    '## Recurring Themes',
    '',
    '- Rollout timing ([[launch-plan]], [[budget-review]])',
    '',
    '## Decision Log',
    '',
    '1. Ship Friday (L1)',
    '  > "We should ship Friday."',
    '2. Budget approved (L2)',
    '',
    '## Action Items',
    '',
    '| Assigner | Assignee | Due | Deliverable |',
    '| --- | --- | --- | --- |',
    '| Dana | Ari | 2026-03-01 | Draft rollout plan |',
    '',
    '## Unresolved Items',
    '',
    '- Does the budget cover hiring? (L2)',
    '',
    '## Topic Omissions',
    '',
    '1. Office move small talk (L40-L45)',
    '',
  ].join('\n');
}

describe('renderTopicIndex', () => {
  it('renders all eight sections in fixed order', () => {
    expect(renderTopicIndex({ index: index(), topicFileNames, omittedTopics })).toBe(fullExpectedDocument());
  });

  it('wikilinks every topic file of the run', () => {
    const markdown = renderTopicIndex({
      index: index({ recurringThemes: [] }),
      topicFileNames,
      omittedTopics: [],
    });

    expect(markdown).toContain('- [[launch-plan]]');
    expect(markdown).toContain('- [[budget-review]]');
  });

  it('numbers the decision log by code', () => {
    const markdown = renderTopicIndex({ index: index(), topicFileNames, omittedTopics: [] });

    expect(markdown).toContain('1. Ship Friday (L1)');
    expect(markdown).toContain('2. Budget approved (L2)');
  });

  it('renders an unverified decision quote unquoted — same words, no quotation marks', () => {
    const markdown = renderTopicIndex({
      index: index({
        decisions: [{ statement: 'Ship Friday', lineReferences: [1], quote: 'words nobody said', quoteVerified: false }],
      }),
      topicFileNames,
      omittedTopics: [],
    });

    expect(markdown).toContain('1. Ship Friday (L1)\n  words nobody said');
    expect(markdown).not.toContain('"words nobody said"');
  });

  it('renders multiple references as a comma-separated citation', () => {
    const markdown = renderTopicIndex({
      index: index({
        decisions: [{ statement: 'Ship Friday', lineReferences: [1, 3, 12], quote: null, quoteVerified: false }],
      }),
      topicFileNames,
      omittedTopics: [],
    });

    expect(markdown).toContain('1. Ship Friday (L1, L3, L12)');
  });

  it('renders the action-item table with all four columns and an unstated due date', () => {
    const markdown = renderTopicIndex({
      index: index({
        actionItems: [
          { assigner: 'Dana', assignee: 'Ari', dueDate: '2026-03-01', deliverable: 'Draft rollout plan' },
          { assigner: 'Sam', assignee: 'Kai', dueDate: 'unstated', deliverable: 'Book the review' },
        ],
      }),
      topicFileNames,
      omittedTopics: [],
    });

    expect(markdown).toContain(
      ['| Assigner | Assignee | Due | Deliverable |', '| --- | --- | --- | --- |', '| Dana | Ari | 2026-03-01 | Draft rollout plan |', '| Sam | Kai | unstated | Book the review |'].join('\n'),
    );
  });

  it('escapes pipes in table cells so a deliverable cannot break the table', () => {
    const markdown = renderTopicIndex({
      index: index({
        actionItems: [{ assigner: 'Dana', assignee: 'Ari', dueDate: 'unstated', deliverable: 'Ship v1 | v2' }],
      }),
      topicFileNames,
      omittedTopics: [],
    });

    expect(markdown).toContain('| Dana | Ari | unstated | Ship v1 \\| v2 |');
  });

  it('numbers the topic omissions with their transcript line ranges, comma-separated per range', () => {
    const markdown = renderTopicIndex({
      index: index(),
      topicFileNames,
      omittedTopics: [
        { topic: 'Office move small talk', lineRanges: [{ startLine: 40, endLine: 45 }] },
        { topic: 'Scheduling aside', lineRanges: [{ startLine: 52, endLine: 54 }, { startLine: 60, endLine: 61 }] },
      ],
    });

    expect(markdown).toContain('1. Office move small talk (L40-L45)');
    expect(markdown).toContain('2. Scheduling aside (L52-L54, L60-L61)');
  });

  it('renders an explicit absence marker under an empty section instead of dropping its header', () => {
    const markdown = renderTopicIndex({
      index: index({
        executiveSummary: '',
        recurringThemes: [],
        decisions: [],
        actionItems: [],
        unresolvedItems: [],
      }),
      topicFileNames,
      omittedTopics: [],
    });

    // All eight sections render, in fixed order — even when empty.
    const headings = markdown.split('\n').filter((line) => line.startsWith('##'));
    expect(headings).toEqual([
      '## Executive Summary',
      '## Topic Index',
      '## Recurring Themes',
      '## Decision Log',
      '## Action Items',
      '## Unresolved Items',
      '## Topic Omissions',
    ]);
    expect(markdown).toContain('## Executive Summary\n\n_None recorded._');
    expect(markdown).toContain('## Recurring Themes\n\n_None recorded._');
    expect(markdown).toContain('## Decision Log\n\n_None recorded._');
    expect(markdown).toContain('## Action Items\n\n_None recorded._');
    expect(markdown).toContain('## Unresolved Items\n\n_None recorded._');
    expect(markdown).toContain('## Topic Omissions\n\n_None recorded._');
  });
});
