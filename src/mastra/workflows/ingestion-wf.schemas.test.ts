import { describe, expect, it } from 'bun:test';
import { citedPointSchema, citedTopicContentSchema, topicIndexContentSchema } from './ingestion-wf.schemas';

/**
 * Regression (run 6d28b271-1fe0-47f0-9ba5-a0bb7ef05986): the distill call
 * replied with contextual-highlight points that omitted the `quote` key —
 * the shape example the model is shown ends `"contextualHighlights":[]`, so
 * it never saw a highlight element — and the strict parse killed the whole
 * run with `contextualHighlights.0.quote: Invalid input: expected string,
 * received undefined`. A missing quote is semantically `null` ("no wording
 * worth quoting"), and the downstream citation validator already treats it
 * that way (`point.quote?.trim() || null`), so the schema must accept the
 * omission instead of failing the run.
 */

/** The distill reply as the model actually emitted it: summary and key
 * insights carried `quote`, the three contextual highlights did not. */
const observedDistillReply = {
  title: 'Vendor lock-in risks',
  summary: [{ statement: 'The panel compared hosting options.', lineReferences: [3, 4], quote: null }],
  keyInsights: [{ statement: 'The panel picked the portable option.', lineReferences: [7], quote: 'we stay portable' }],
  contextualHighlights: [
    { statement: 'Connects to the standing portability concern.', lineReferences: [12] },
    { statement: "Answers last quarter's open migration question.", lineReferences: [15] },
    { statement: "Feeds the series' vendor-review track.", lineReferences: [21] },
  ],
};

describe('citedTopicContentSchema', () => {
  it('accepts a point that omits the quote key, as null', () => {
    const parsed = citedTopicContentSchema.parse(observedDistillReply);
    expect(parsed.contextualHighlights.map((point) => point.quote)).toEqual([null, null, null]);
  });

  it('still rejects a point with no statement — only the quote is tolerable', () => {
    const result = citedPointSchema.safeParse({ lineReferences: [1], quote: null });
    expect(result.success).toBe(false);
  });

  it('accepts the index decision log omitting quotes too — same shared point schema', () => {
    const result = topicIndexContentSchema.safeParse({
      title: 'Q3 sync',
      executiveSummary: 'A paragraph.',
      recurringThemes: [],
      decisions: [{ statement: 'Ship Friday', lineReferences: [1] }],
      actionItems: [],
      unresolvedItems: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.decisions[0]?.quote).toBeNull();
    }
  });
});
