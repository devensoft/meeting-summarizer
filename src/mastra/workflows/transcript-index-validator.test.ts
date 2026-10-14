import { describe, expect, it } from 'bun:test';
import { actionItemSchema } from './ingestion-wf.schemas';
import { INDEX_TITLE_FALLBACK } from './constants';
import { validateTopicIndexContent } from './transcript-index-validator';

const transcript = [
  '1 | We should ship Friday.',
  '2 | The budget is approved.',
  '3 | Let\'s review the roadmap next week.',
].join('\n');

const knownTopicFiles = ['launch-plan', 'budget-review'];

function content(overrides: Partial<Parameters<typeof validateTopicIndexContent>[0]> = {}) {
  return {
    title: 'Q3 product sync',
    executiveSummary: 'The team aligned on the launch.',
    recurringThemes: [],
    decisions: [],
    actionItems: [],
    unresolvedItems: [],
    ...overrides,
  };
}

describe('validateTopicIndexContent — decision log', () => {
  it('validates decisions with the same citation discipline as topic files', () => {
    const result = validateTopicIndexContent(
      content({
        decisions: [
          { statement: 'Ship Friday (L1)', lineReferences: [1], quote: 'We should ship Friday.' },
          { statement: 'Budget approved', lineReferences: [2], quote: null },
        ],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.decisions).toEqual([
      { statement: 'Ship Friday', lineReferences: [1], quote: 'We should ship Friday.', quoteVerified: true },
      { statement: 'Budget approved', lineReferences: [2], quote: null, quoteVerified: false },
    ]);
  });

  it('keeps an unverifiable decision quote for unquoted rendering and drops fully uncited decisions', () => {
    const result = validateTopicIndexContent(
      content({
        decisions: [
          { statement: 'Roadmap next week', lineReferences: [3], quote: 'words nobody said' },
          { statement: 'Dropped, fully uncited', lineReferences: [40], quote: null },
        ],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.decisions).toEqual([
      { statement: 'Roadmap next week', lineReferences: [3], quote: 'words nobody said', quoteVerified: false },
    ]);
  });
});

describe('validateTopicIndexContent — recurring themes', () => {
  it('keeps a theme backed by at least two of the run\'s real topic files', () => {
    const result = validateTopicIndexContent(
      content({
        recurringThemes: [{ theme: 'Rollout timing', topicFileNames: ['launch-plan', 'budget-review'] }],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.recurringThemes).toEqual([
      { theme: 'Rollout timing', topicFileNames: ['launch-plan', 'budget-review'] },
    ]);
  });

  it('drops a theme backed by fewer than two topic files', () => {
    const result = validateTopicIndexContent(
      content({
        recurringThemes: [
          { theme: 'Only one file', topicFileNames: ['launch-plan'] },
          { theme: 'No files at all', topicFileNames: [] },
        ],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.recurringThemes).toEqual([]);
  });

  it('drops a theme whose file names the run does not know — real files only', () => {
    const result = validateTopicIndexContent(
      content({
        recurringThemes: [{ theme: 'Invented backing', topicFileNames: ['launch-plan', 'hallucinated-file'] }],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.recurringThemes).toEqual([]);
  });

  it('resolves file names case-insensitively and tolerates a .md suffix, keeping the run\'s canonical names', () => {
    const result = validateTopicIndexContent(
      content({
        recurringThemes: [{ theme: 'Rollout timing', topicFileNames: ['Launch-Plan.md', 'BUDGET-REVIEW', 'launch-plan'] }],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.recurringThemes).toEqual([
      { theme: 'Rollout timing', topicFileNames: ['launch-plan', 'budget-review'] },
    ]);
  });

  it('drops a theme whose text is blank after trimming', () => {
    const result = validateTopicIndexContent(
      content({
        recurringThemes: [{ theme: '   ', topicFileNames: ['launch-plan', 'budget-review'] }],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.recurringThemes).toEqual([]);
  });
});

describe('validateTopicIndexContent — action items', () => {
  it('passes trimmed action items through with all four fields', () => {
    const result = validateTopicIndexContent(
      content({
        actionItems: [
          { assigner: ' Dana ', assignee: 'Ari', dueDate: '2026-03-01', deliverable: 'Draft rollout plan' },
          { assigner: 'Sam', assignee: 'Kai', dueDate: 'unstated', deliverable: 'Book the review' },
        ],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.actionItems).toEqual([
      { assigner: 'Dana', assignee: 'Ari', dueDate: '2026-03-01', deliverable: 'Draft rollout plan' },
      { assigner: 'Sam', assignee: 'Kai', dueDate: 'unstated', deliverable: 'Book the review' },
    ]);
  });

  it('drops an action item whose field trims to nothing — ownership must stay unambiguous', () => {
    const result = validateTopicIndexContent(
      content({
        actionItems: [
          { assigner: 'Dana', assignee: '   ', dueDate: '2026-03-01', deliverable: 'Draft rollout plan' },
        ],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.actionItems).toEqual([]);
  });
});

describe('actionItemSchema — the due-date contract', () => {
  it('accepts an ISO YYYY-MM-DD due date or the literal "unstated"', () => {
    expect(actionItemSchema.safeParse({ assigner: 'A', assignee: 'B', dueDate: '2026-03-01', deliverable: 'D' }).success).toBe(true);
    expect(actionItemSchema.safeParse({ assigner: 'A', assignee: 'B', dueDate: 'unstated', deliverable: 'D' }).success).toBe(true);
  });

  it('rejects due dates in any other shape, and rows missing a field', () => {
    expect(actionItemSchema.safeParse({ assigner: 'A', assignee: 'B', dueDate: 'March 1st', deliverable: 'D' }).success).toBe(false);
    expect(actionItemSchema.safeParse({ assigner: 'A', assignee: 'B', dueDate: '2026-3-1', deliverable: 'D' }).success).toBe(false);
    expect(actionItemSchema.safeParse({ assigner: 'A', assignee: 'B', dueDate: '2026-03-01' }).success).toBe(false);
    expect(actionItemSchema.safeParse({ assigner: 'A', dueDate: 'unstated', deliverable: 'D' }).success).toBe(false);
  });
});

describe('validateTopicIndexContent — unresolved items, title, summary', () => {
  it('validates unresolved items like cited points and drops uncited ones', () => {
    const result = validateTopicIndexContent(
      content({
        unresolvedItems: [
          { statement: 'Does the budget cover hiring? (L2)', lineReferences: [2, 40] },
          { statement: 'Dropped, fully uncited', lineReferences: [41] },
        ],
      }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.unresolvedItems).toEqual([
      { statement: 'Does the budget cover hiring?', lineReferences: [2] },
    ]);
  });

  it('falls back to the constant title when the model title trims to nothing', () => {
    const result = validateTopicIndexContent(content({ title: '   ' }), { lineCount: 3, transcriptContent: transcript }, knownTopicFiles);

    expect(result.title).toBe(INDEX_TITLE_FALLBACK);
  });

  it('strips inline (Lnn) tokens the model leaked into the executive summary', () => {
    const result = validateTopicIndexContent(
      content({ executiveSummary: 'The team aligned (L1) on the launch.' }),
      { lineCount: 3, transcriptContent: transcript },
      knownTopicFiles,
    );

    expect(result.executiveSummary).toBe('The team aligned on the launch.');
  });
});
