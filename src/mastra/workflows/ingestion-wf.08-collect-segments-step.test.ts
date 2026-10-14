import { describe, expect, it } from 'bun:test';
import { flattenBranchRun } from './ingestion-wf.08-collect-segments-step';
import type { BranchRun } from './ingestion-wf.schemas';

const multiTopicRun: BranchRun = {
  files: [
    { topic: 'Launch plan', filePath: '.workspace/meetings/sync/launch-plan.md', fileSize: 256, isSegment: true, kind: 'topic' },
    { topic: 'Budget review', filePath: '.workspace/meetings/sync/budget-review.md', fileSize: 192, isSegment: true, kind: 'topic' },
  ],
  transcriptContent: '1 | Launch plan\n2 | Budget review',
  omittedTopics: [{ topic: 'Small talk', lineRanges: [{ startLine: 3, endLine: 3 }] }],
  singleTopic: null,
  meetingDirectoryName: 'sync',
  lineCount: 3,
  meetingType: 'design sync',
};

const singleTopicRun: BranchRun = {
  files: [
    { topic: 'Launch plan', filePath: '.workspace/meetings/sync/launch-plan.md', fileSize: 256, isSegment: false, kind: 'topic' },
  ],
  transcriptContent: '1 | Launch plan',
  omittedTopics: [],
  singleTopic: 'Launch plan',
  meetingDirectoryName: 'sync',
  lineCount: 1,
  meetingType: 'design sync',
};

describe('flattenBranchRun', () => {
  it('returns the multi-topic branch run with its run-level data', () => {
    expect(flattenBranchRun({ 'multiple-topics-path': multiTopicRun })).toEqual(multiTopicRun);
  });

  it('returns the single-topic branch run with its run-level data — no index is gated later, not here', () => {
    expect(flattenBranchRun({ 'single-topic-path': singleTopicRun })).toEqual(singleTopicRun);
  });

  it('throws when neither branch produced a result', () => {
    expect(() => flattenBranchRun({})).toThrow();
  });
});
