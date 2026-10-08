import { createWorkflow } from '@mastra/core/workflows';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';
import { classifyTopicsStep } from './ingestion-wf.02-classify-topics-step';
import { consolidateTopicStep } from './ingestion-wf.03-consolidate-topic-step';
import { extractSegmentsStep } from './ingestion-wf.04-extract-segments-step';
import { enrichSegmentsStep } from './ingestion-wf.05-enrich-segments-step';
import { distillTopicStep } from './ingestion-wf.06-distill-topic-step';
import { writeSegmentFileStep } from './ingestion-wf.07-write-segment-file-step';
import { collectSegmentsStep } from './ingestion-wf.08-collect-segments-step';
import { inputFileSchema, segmentCreatedSchema, topicContextSchema, topicResultSchema } from './ingestion-wf.schemas';

const perTopicSubworkflow = createWorkflow({
  id: 'per-topic-subworkflow',
  inputSchema: topicContextSchema,
  outputSchema: segmentCreatedSchema,
})
  .then(consolidateTopicStep)
  .then(extractSegmentsStep)
  .then(enrichSegmentsStep)
  .then(distillTopicStep)
  .then(writeSegmentFileStep)
  .commit();

const singleTopicPath = createWorkflow({
  id: 'single-topic-path',
  inputSchema: topicResultSchema,
  outputSchema: segmentCreatedSchema,
})
  .map(async ({ inputData }) => ({
    transcriptContent: inputData.transcriptContent,
    topic: inputData.singleTheme!,
    isSegment: false,
  }))
  .then(perTopicSubworkflow)
  .commit();

const multipleTopicsPath = createWorkflow({
  id: 'multiple-topics-path',
  inputSchema: topicResultSchema,
  outputSchema: segmentCreatedSchema.array(),
})
  .map(async ({ inputData }) =>
    inputData.topics.map(topic => ({
      transcriptContent: inputData.transcriptContent,
      topic,
      isSegment: true,
    })),
  )
  .foreach(perTopicSubworkflow, { concurrency: 4 })
  .commit();

const ingestionWorkflow = createWorkflow({
  id: 'ingestionWorkflow',
  inputSchema: inputFileSchema,
  outputSchema: segmentCreatedSchema.array(),
})
  .then(readTranscriptStep)
  .then(classifyTopicsStep)
  .branch([
    [async ({ inputData }) => inputData.singleTheme !== null, singleTopicPath],
    [async ({ inputData }) => inputData.singleTheme === null, multipleTopicsPath],
  ])
  .then(collectSegmentsStep)
  .commit();

export { ingestionWorkflow };
