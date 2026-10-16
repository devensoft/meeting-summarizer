import { describe, expect, it } from 'bun:test';
import { branchRunSchema, citedPointSchema, citedTopicContentSchema, inputFileSchema, meetingMetadataSchema, topicIndexContentSchema } from './ingestion-wf.schemas';

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

describe('meeting metadata input', () => {
  const metadata = {
    date: '2026-03-01',
    time: '14:30',
    attendees: ['Dana', 'Ari'],
    title: 'Q3 sync',
    description: 'Quarterly planning',
  };

  it('accepts full, partial, and empty metadata alongside filePath', () => {
    expect(inputFileSchema.parse({ filePath: 'a.vtt', meetingMetadata: metadata }).meetingMetadata).toEqual(metadata);
    expect(inputFileSchema.parse({ filePath: 'a.vtt', meetingMetadata: { title: 'Sync' } }).meetingMetadata).toEqual({ title: 'Sync' });
    expect(inputFileSchema.parse({ filePath: 'a.vtt', meetingMetadata: {} }).meetingMetadata).toEqual({});
  });

  it('leaves metadata absent when not supplied', () => {
    const parsed = inputFileSchema.parse({ filePath: 'a.vtt' });
    expect('meetingMetadata' in parsed).toBe(false);
  });

  it('rejects malformed fields and blank attendees', () => {
    expect(meetingMetadataSchema.safeParse({ date: '03/01/2026' }).success).toBe(false);
    expect(meetingMetadataSchema.safeParse({ time: '25:00' }).success).toBe(false);
    expect(meetingMetadataSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(meetingMetadataSchema.safeParse({ attendees: ['Dana', ' '] }).success).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    for (const date of ['2026-99-99', '2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10']) {
      expect(meetingMetadataSchema.safeParse({ date }).success).toBe(false);
    }
    expect(meetingMetadataSchema.safeParse({ date: '2028-02-29' }).success).toBe(true);
  });

  it('survives the branch-run envelope and stays absent without it', () => {
    const run = {
      files: [],
      transcriptContent: '',
      omittedTopics: [],
      singleTopic: null,
      meetingDirectoryName: 'sync',
      lineCount: 0,
      format: 'planning',
      mode: 'status',
    };
    expect(branchRunSchema.parse({ ...run, meetingMetadata: metadata }).meetingMetadata).toEqual(metadata);
    expect('meetingMetadata' in branchRunSchema.parse(run)).toBe(false);
  });
});
