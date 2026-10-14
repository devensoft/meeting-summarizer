import type { BranchRun, SegmentCreated, TopicResult, TopicRunContext } from './ingestion-wf.schemas';

/**
 * Branch-path assembly (spec: "Transcript index" — run-level data threads
 * through both branch paths to the collector).
 *
 * Each branch path of the ingestion workflow is built from two code steps
 * backed by the pure functions here: a context step that turns the classifier
 * result into the per-topic pipeline's inputs, carrying the run-level data on
 * every item, and a run step that wraps the branch's created files — each
 * marked `kind: 'topic'` — together with the run-level data into the envelope
 * the collector flattens. Whether a run gets a transcript index is decided
 * later by the index step from `singleTopic`; a natural single-topic run and
 * a collapsed one pass through identically.
 */

/** Maps the classification to the single per-topic context: the leading
 * topic runs the per-topic pipeline as a whole-meeting file, and the
 * run-level data rides along to the branch's run step. */
export function toSingleTopicContext(input: TopicResult): TopicRunContext {
  return {
    transcriptContent: input.transcriptContent,
    topic: input.singleTopic!,
    isSegment: false,
    durationSeconds: input.durationSeconds,
    lineCount: input.lineCount,
    meetingDirectoryName: input.meetingDirectoryName,
    meetingType: input.meetingType,
    meetingContext: input.meetingContext,
    omittedTopics: input.omittedTopics,
    singleTopic: input.singleTopic,
  };
}

/** Maps the classification to one per-topic context per topic, each carrying
 * the run-level data (they all flow to the same run step, which reads the
 * first). */
export function toMultipleTopicContexts(input: TopicResult): TopicRunContext[] {
  return input.topics.map(({ topic }) => ({
    transcriptContent: input.transcriptContent,
    topic,
    isSegment: true,
    durationSeconds: input.durationSeconds,
    lineCount: input.lineCount,
    meetingDirectoryName: input.meetingDirectoryName,
    meetingType: input.meetingType,
    meetingContext: input.meetingContext,
    omittedTopics: input.omittedTopics,
    singleTopic: input.singleTopic,
  }));
}

/** Envelope for the single-topic path: the one written file, marked
 * `kind: 'topic'`, plus the run-level data. */
export function singleTopicBranchRun(context: TopicRunContext, file: SegmentCreated): BranchRun {
  return {
    files: [{ ...file, kind: 'topic' }],
    transcriptContent: context.transcriptContent ?? '',
    omittedTopics: context.omittedTopics ?? [],
    singleTopic: context.singleTopic ?? null,
    meetingDirectoryName: context.meetingDirectoryName,
    lineCount: context.lineCount,
    meetingType: context.meetingType,
  };
}

/** Envelope for the multi-topic path: every written file marked
 * `kind: 'topic'`, plus the run-level data. */
export function multipleTopicsBranchRun(contexts: TopicRunContext[], files: SegmentCreated[]): BranchRun {
  const context = contexts[0]!;
  return {
    files: files.map((file) => ({ ...file, kind: 'topic' })),
    transcriptContent: context.transcriptContent ?? '',
    omittedTopics: context.omittedTopics ?? [],
    singleTopic: context.singleTopic ?? null,
    meetingDirectoryName: context.meetingDirectoryName,
    lineCount: context.lineCount,
    meetingType: context.meetingType,
  };
}
