import type { ClassifiedTopic, LineRange } from './ingestion-wf.schemas';
import { reconcileTopics } from '../meeting-context';
import { SHORT_MEETING_MAX_SECONDS, TOPIC_DOMINANCE_THRESHOLD } from './constants';

/**
 * Air time and topic dominance (GLOSSARY.md) as deterministic code.
 *
 * A topic's air-time share is the union of its transcript line ranges —
 * overlapping ranges count their shared lines once — over the total number
 * of numbered lines in the normalized transcript. Topic dominance resolves
 * a multi-topic classification to a single topic file when the leading
 * topic's share crosses the dominance threshold in a short (or undated)
 * meeting the classifier judged cohesive; the demoted topics become
 * recorded topic omissions carrying their line ranges.
 */

/** Shares of the transcript's lines a topic holds: the overlap-deduplicated
 * union of its ranges over `lineCount`. Ranges are clamped into
 * `1..lineCount`; ranges that fall outside or invert contribute nothing. */
export function airTimeShare(lineRanges: LineRange[], lineCount: number): number {
  if (lineCount <= 0 || lineRanges.length === 0) {
    return 0;
  }

  const spans: Array<[number, number]> = [];
  for (const { startLine, endLine } of lineRanges) {
    const start = Math.max(1, startLine);
    const end = Math.min(lineCount, endLine);
    if (start <= end) {
      spans.push([start, end]);
    }
  }
  if (spans.length === 0) {
    return 0;
  }

  spans.sort((a, b) => a[0] - b[0]);
  let unionLines = 0;
  let [currentStart, currentEnd] = spans[0]!;
  for (const [start, end] of spans.slice(1)) {
    if (start > currentEnd) {
      unionLines += currentEnd - currentStart + 1;
      currentStart = start;
    }
    currentEnd = Math.max(currentEnd, end);
  }
  unionLines += currentEnd - currentStart + 1;

  return unionLines / lineCount;
}

/** How a classification resolves once air time is known: the topics and
 * recorded omissions that flow downstream, the leading topic when the run
 * resolves to one file, whether the dominance collapse fired, and the
 * leading share the decision was made on. */
export interface TopicDominanceOutcome {
  topics: ClassifiedTopic[];
  omittedTopics: ClassifiedTopic[];
  singleTopic: string | null;
  collapsedToSingleTopic: boolean;
  leadingShare: number;
}

/**
 * Applies the dominance collapse (GLOSSARY.md): a multi-topic classification
 * resolves to a single topic file only when the leading topic holds at least
 * `TOPIC_DOMINANCE_THRESHOLD` of the transcript's lines, the meeting is no
 * longer than `SHORT_MEETING_MAX_SECONDS` (the gate is skipped when the
 * duration is unknown), and the classifier judged the meeting cohesive.
 * Demoted topics are reconciled into the recorded omissions under the
 * existing omission rules; everything else is passed through unchanged.
 */
export function resolveTopicDominance(input: {
  topics: ClassifiedTopic[];
  omittedTopics: ClassifiedTopic[];
  lineCount: number;
  durationSeconds: number | null;
  isCohesive: boolean;
}): TopicDominanceOutcome {
  const shares = input.topics.map((topic) => airTimeShare(topic.lineRanges, input.lineCount));
  const leadingIndex = shares.reduce((best, share, index) => (share > shares[best]! ? index : best), 0);
  const leadingShare = shares[leadingIndex] ?? 0;
  const durationWithinBound = input.durationSeconds === null || input.durationSeconds <= SHORT_MEETING_MAX_SECONDS;
  const collapse =
    input.topics.length > 1 && input.isCohesive && durationWithinBound && leadingShare >= TOPIC_DOMINANCE_THRESHOLD;

  if (!collapse) {
    return {
      topics: input.topics,
      omittedTopics: input.omittedTopics,
      singleTopic: input.topics.length === 1 ? input.topics[0]!.topic : null,
      collapsedToSingleTopic: false,
      leadingShare,
    };
  }

  const leader = input.topics[leadingIndex]!;
  // Demotion under the existing omission rules: the leader is the only kept
  // topic; demoted topics and recorded omissions flow through the omission
  // slot together, so blanks drop, duplicates merge (first entry wins), and
  // nothing shadows the leader.
  const { omittedTopics } = reconcileTopics(
    [leader],
    [...input.topics.filter((_, index) => index !== leadingIndex), ...input.omittedTopics],
  );

  return {
    topics: [leader],
    omittedTopics,
    singleTopic: leader.topic,
    collapsedToSingleTopic: true,
    leadingShare,
  };
}
