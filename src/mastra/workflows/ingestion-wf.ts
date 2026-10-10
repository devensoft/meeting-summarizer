import { createWorkflow } from '@mastra/core/workflows';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';
import { classifyTopicsStep } from './ingestion-wf.02-classify-topics-step';
import { collectSegmentsStep } from './ingestion-wf.08-collect-segments-step';
import { perTopicSubworkflow } from './per-topic-subworkflow';
import { inputFileSchema, segmentCreatedSchema, topicResultSchema } from './ingestion-wf.schemas';

const singleTopicPath = createWorkflow({
  id: 'single-topic-path',
  inputSchema: topicResultSchema,
  outputSchema: segmentCreatedSchema,
})
  .map(async ({ inputData }) => ({
    transcriptContent: inputData.transcriptContent,
    topic: inputData.singleTheme!,
    isSegment: false,
    meetingDirectoryName: inputData.meetingDirectoryName,
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
      meetingDirectoryName: inputData.meetingDirectoryName,
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
