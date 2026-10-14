import { describe, expect, it } from 'bun:test';
import { airTimeShare, resolveTopicDominance } from './topic-dominance';

describe('airTimeShare', () => {
  it('measures one range as its length over the transcript line count', () => {
    expect(airTimeShare([{ startLine: 1, endLine: 8 }], 10)).toBe(0.8);
  });

  it('sums disjoint ranges', () => {
    expect(airTimeShare([{ startLine: 1, endLine: 2 }, { startLine: 5, endLine: 7 }], 10)).toBe(0.5);
  });

  it('dedupes overlapping ranges instead of counting lines twice', () => {
    expect(airTimeShare([{ startLine: 1, endLine: 5 }, { startLine: 3, endLine: 8 }], 10)).toBe(0.8);
  });

  it('clamps ranges that run past the end of the transcript', () => {
    expect(airTimeShare([{ startLine: 9, endLine: 20 }], 10)).toBe(0.2);
  });

  it('drops inverted ranges', () => {
    expect(airTimeShare([{ startLine: 4, endLine: 2 }], 10)).toBe(0);
  });

  it('returns 0 for a topic with no ranges', () => {
    expect(airTimeShare([], 10)).toBe(0);
  });

  it('returns 0 for an empty transcript instead of dividing by zero', () => {
    expect(airTimeShare([{ startLine: 1, endLine: 5 }], 0)).toBe(0);
  });
});

describe('resolveTopicDominance', () => {
  const leader = { topic: 'Launch plan', lineRanges: [{ startLine: 1, endLine: 8 }] };
  const sideTopic = { topic: 'Offsite logistics', lineRanges: [{ startLine: 9, endLine: 9 }] };

  it('collapses a dominant, short, cohesive multi-topic meeting to its leading topic', () => {
    expect(
      resolveTopicDominance({
        topics: [leader, sideTopic],
        omittedTopics: [],
        lineCount: 10,
        durationSeconds: 1800,
        isCohesive: true,
      }),
    ).toEqual({
      topics: [leader],
      omittedTopics: [sideTopic],
      singleTopic: 'Launch plan',
      collapsedToSingleTopic: true,
      leadingShare: 0.8,
    });
  });

  it('leaves a multi-topic meeting alone when the leading share is below the threshold', () => {
    const outcome = resolveTopicDominance({
      topics: [
        { topic: 'Launch plan', lineRanges: [{ startLine: 1, endLine: 6 }] },
        { topic: 'Roadmap', lineRanges: [{ startLine: 7, endLine: 10 }] },
      ],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: 1800,
      isCohesive: true,
    });

    expect(outcome.collapsedToSingleTopic).toBe(false);
    expect(outcome.topics).toHaveLength(2);
    expect(outcome.singleTopic).toBeNull();
    expect(outcome.leadingShare).toBe(0.6);
  });

  it('leaves a multi-topic meeting alone when the meeting ran longer than the short-meeting bound', () => {
    const outcome = resolveTopicDominance({
      topics: [leader, sideTopic],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: 3601,
      isCohesive: true,
    });

    expect(outcome.collapsedToSingleTopic).toBe(false);
    expect(outcome.singleTopic).toBeNull();
  });

  it('collapses when the duration sits exactly on the short-meeting bound', () => {
    const outcome = resolveTopicDominance({
      topics: [leader, sideTopic],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: 3600,
      isCohesive: true,
    });

    expect(outcome.collapsedToSingleTopic).toBe(true);
  });

  it('skips the duration gate when the duration is unknown', () => {
    const outcome = resolveTopicDominance({
      topics: [leader, sideTopic],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: null,
      isCohesive: true,
    });

    expect(outcome.collapsedToSingleTopic).toBe(true);
  });

  it('leaves a multi-topic meeting alone when the classifier judged it not cohesive', () => {
    const outcome = resolveTopicDominance({
      topics: [leader, sideTopic],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: 1800,
      isCohesive: false,
    });

    expect(outcome.collapsedToSingleTopic).toBe(false);
    expect(outcome.singleTopic).toBeNull();
  });

  it('never collapses an already-single-topic classification', () => {
    const existingOmission = { topic: 'Small talk', lineRanges: [{ startLine: 10, endLine: 10 }] };
    const outcome = resolveTopicDominance({
      topics: [{ topic: 'Launch plan', lineRanges: [{ startLine: 1, endLine: 9 }] }],
      omittedTopics: [existingOmission],
      lineCount: 10,
      durationSeconds: 600,
      isCohesive: true,
    });

    expect(outcome).toEqual({
      topics: [{ topic: 'Launch plan', lineRanges: [{ startLine: 1, endLine: 9 }] }],
      omittedTopics: [existingOmission],
      singleTopic: 'Launch plan',
      collapsedToSingleTopic: false,
      leadingShare: 0.9,
    });
  });

  it('breaks share ties in favor of the topic the classifier listed first', () => {
    const alsoDominant = { topic: 'Roadmap', lineRanges: [{ startLine: 1, endLine: 8 }] };
    const outcome = resolveTopicDominance({
      topics: [leader, alsoDominant],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: 600,
      isCohesive: true,
    });

    expect(outcome.singleTopic).toBe('Launch plan');
    expect(outcome.omittedTopics).toEqual([alsoDominant]);
  });

  it('reconciles demoted topics with recorded omissions under the omission rules', () => {
    const shadowed = { topic: 'offsite logistics', lineRanges: [{ startLine: 9, endLine: 9 }] };
    const distinct = { topic: 'Hiring', lineRanges: [{ startLine: 10, endLine: 10 }] };
    const outcome = resolveTopicDominance({
      topics: [leader, sideTopic],
      omittedTopics: [shadowed, distinct],
      lineCount: 10,
      durationSeconds: 600,
      isCohesive: true,
    });

    expect(outcome.omittedTopics).toEqual([sideTopic, distinct]);
  });

  it('collapses only when the share is at or above the threshold, not merely near it', () => {
    const outcome = resolveTopicDominance({
      topics: [
        { topic: 'Launch plan', lineRanges: [{ startLine: 1, endLine: 7 }] },
        sideTopic,
        { topic: 'Budget', lineRanges: [{ startLine: 8, endLine: 10 }] },
      ],
      omittedTopics: [],
      lineCount: 10,
      durationSeconds: 600,
      isCohesive: true,
    });

    expect(outcome.collapsedToSingleTopic).toBe(false);
  });

  it('degrades gracefully on an empty classification', () => {
    expect(
      resolveTopicDominance({ topics: [], omittedTopics: [], lineCount: 10, durationSeconds: 600, isCohesive: true }),
    ).toEqual({
      topics: [],
      omittedTopics: [],
      singleTopic: null,
      collapsedToSingleTopic: false,
      leadingShare: 0,
    });
  });
});
