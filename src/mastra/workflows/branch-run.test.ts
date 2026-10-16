import { describe, expect, it } from 'bun:test';
import { multipleTopicsBranchRun, singleTopicBranchRun, toMultipleTopicContexts, toSingleTopicContext } from './branch-run';
import type { MeetingMetadata, SegmentCreated, TopicResult } from './ingestion-wf.schemas';

const topicResult: TopicResult = {
  transcriptContent: '1 | Launch plan\n2 | Budget review\n3 | Small talk',
  topics: [
    { topic: 'Launch plan', lineRanges: [{ startLine: 1, endLine: 1 }] },
    { topic: 'Budget review', lineRanges: [{ startLine: 2, endLine: 2 }] },
  ],
  omittedTopics: [{ topic: 'Small talk', lineRanges: [{ startLine: 3, endLine: 3 }] }],
  singleTopic: null,
  isCohesive: false,
  collapsedToSingleTopic: false,
  durationSeconds: 600,
  lineCount: 3,
  meetingDirectoryName: 'sync-1760000000000',
  format: 'planning',
  modeScores: { status: 0.6, discussion: 0.3, learning: 0.1 },
  mode: 'status',
  meetingContext: null,
};

const file: SegmentCreated = {
  topic: 'Launch plan',
  filePath: '.workspace/meetings/sync-1760000000000/launch-plan.md',
  fileSize: 256,
  isSegment: true,
};

describe('toSingleTopicContext', () => {
  it('maps the single topic into the per-topic context and carries the run-level fields', () => {
    const context = toSingleTopicContext({ ...topicResult, singleTopic: 'Launch plan' });

    expect(context.topic).toBe('Launch plan');
    expect(context.isSegment).toBe(false);
    expect(context.transcriptContent).toBe(topicResult.transcriptContent);
    expect(context.meetingDirectoryName).toBe('sync-1760000000000');
    expect(context.lineCount).toBe(3);
    expect(context.format).toBe('planning');
    expect(context.mode).toBe('status');
    expect(context.omittedTopics).toEqual(topicResult.omittedTopics);
    expect(context.singleTopic).toBe('Launch plan');
  });
});

describe('toMultipleTopicContexts', () => {
  it('maps one context per topic, each carrying the run-level fields', () => {
    const contexts = toMultipleTopicContexts(topicResult);

    expect(contexts.map((context) => context.topic)).toEqual(['Launch plan', 'Budget review']);
    expect(contexts.map((context) => context.isSegment)).toEqual([true, true]);
    expect(contexts[1]!.omittedTopics).toEqual(topicResult.omittedTopics);
    expect(contexts[1]!.singleTopic).toBeNull();
    expect(contexts[1]!.transcriptContent).toBe(topicResult.transcriptContent);
    expect(contexts[1]!.meetingDirectoryName).toBe('sync-1760000000000');
    expect(contexts[1]!.lineCount).toBe(3);
    expect(contexts[1]!.format).toBe('planning');
    expect(contexts[1]!.mode).toBe('status');
  });
});

describe('singleTopicBranchRun', () => {
  it('wraps the one topic file as a kind-topic entry inside the run envelope', () => {
    const run = singleTopicBranchRun(toSingleTopicContext({ ...topicResult, singleTopic: 'Launch plan' }), {
      ...file,
      isSegment: false,
    });

    expect(run.files).toEqual([
      { ...file, isSegment: false, kind: 'topic' },
    ]);
    expect(run.transcriptContent).toBe(topicResult.transcriptContent);
    expect(run.omittedTopics).toEqual(topicResult.omittedTopics);
    expect(run.singleTopic).toBe('Launch plan');
    expect(run.meetingDirectoryName).toBe('sync-1760000000000');
    expect(run.lineCount).toBe(3);
    expect(run.format).toBe('planning');
    expect(run.mode).toBe('status');
  });
});

describe('multipleTopicsBranchRun', () => {
  it('wraps every topic file as a kind-topic entry and carries the run-level data', () => {
    const budgetFile: SegmentCreated = { ...file, topic: 'Budget review', filePath: '.workspace/meetings/sync-1760000000000/budget-review.md' };
    const run = multipleTopicsBranchRun(toMultipleTopicContexts(topicResult), [file, budgetFile]);

    expect(run.files).toEqual([
      { ...file, kind: 'topic' },
      { ...budgetFile, kind: 'topic' },
    ]);
    expect(run.omittedTopics).toEqual(topicResult.omittedTopics);
    expect(run.singleTopic).toBeNull();
    expect(run.transcriptContent).toBe(topicResult.transcriptContent);
    expect(run.meetingDirectoryName).toBe('sync-1760000000000');
    expect(run.lineCount).toBe(3);
    expect(run.format).toBe('planning');
    expect(run.mode).toBe('status');
  });
});

describe('meeting metadata propagation', () => {
  const meetingMetadata: MeetingMetadata = { date: '2026-03-01', attendees: ['Dana', 'Ari'], title: 'Q3 sync' };
  const withMetadata: TopicResult = { ...topicResult, meetingMetadata };

  it('carries metadata intact through the single-topic path', () => {
    const context = toSingleTopicContext({ ...withMetadata, singleTopic: 'Launch plan' });
    expect(context.meetingMetadata).toEqual(meetingMetadata);
    expect(singleTopicBranchRun(context, { ...file, isSegment: false }).meetingMetadata).toEqual(meetingMetadata);
  });

  it('carries metadata intact through the multi-topic path', () => {
    const contexts = toMultipleTopicContexts(withMetadata);
    expect(contexts.every((context) => context.meetingMetadata === meetingMetadata)).toBe(true);
    expect(multipleTopicsBranchRun(contexts, [file]).meetingMetadata).toEqual(meetingMetadata);
  });

  it('keeps metadata absent when the run has none', () => {
    const contexts = toMultipleTopicContexts(topicResult);
    expect('meetingMetadata' in contexts[0]!).toBe(false);
    expect('meetingMetadata' in multipleTopicsBranchRun(contexts, [file])).toBe(false);
    const single = toSingleTopicContext({ ...topicResult, singleTopic: 'Launch plan' });
    expect('meetingMetadata' in singleTopicBranchRun(single, file)).toBe(false);
  });
});
