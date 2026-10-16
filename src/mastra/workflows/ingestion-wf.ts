import { createStep, createWorkflow } from '@mastra/core/workflows';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';
import { classifyTopicsStep } from './ingestion-wf.02-classify-topics-step';
import { collectSegmentsStep } from './ingestion-wf.08-collect-segments-step';
import { writeIndexStep } from './ingestion-wf.09-write-index-step';
import { perTopicSubworkflow } from './per-topic-subworkflow';
import { multipleTopicsBranchRun, singleTopicBranchRun, toMultipleTopicContexts, toSingleTopicContext } from './branch-run';
import {
  branchRunSchema,
  inputFileSchema,
  runOutputEntrySchema,
  segmentCreatedSchema,
  topicResultSchema,
  topicRunContextSchema,
} from './ingestion-wf.schemas';
import { z } from 'zod';
import { meetingContextSchema } from '../meeting-context';

// Run-level data (normalized transcript, recorded omissions, single-topic
// gate) rides into each branch path on the per-topic contexts and comes back
// out wrapped around the created files, so both paths hand the collector the
// same envelope. Each half is a named step because the wrapping half reads
// its partner's result with getStepResult.
const toSingleTopicContextStep = createStep({
  id: 'to-single-topic-context',
  inputSchema: topicResultSchema,
  outputSchema: topicRunContextSchema,
  execute: async ({ inputData }) => toSingleTopicContext(inputData),
});

const singleTopicRunStep = createStep({
  id: 'single-topic-run',
  inputSchema: segmentCreatedSchema,
  outputSchema: branchRunSchema,
  execute: async ({ inputData, getStepResult }) => singleTopicBranchRun(getStepResult(toSingleTopicContextStep), inputData),
});

const singleTopicPath = createWorkflow({
  id: 'single-topic-path',
  inputSchema: topicResultSchema,
  outputSchema: branchRunSchema,
})
  .then(toSingleTopicContextStep)
  .then(perTopicSubworkflow)
  .then(singleTopicRunStep)
  .commit();

const toMultipleTopicContextsStep = createStep({
  id: 'to-multiple-topic-contexts',
  inputSchema: topicResultSchema,
  outputSchema: z.array(topicRunContextSchema),
  execute: async ({ inputData }) => toMultipleTopicContexts(inputData),
});

const multipleTopicsRunStep = createStep({
  id: 'multiple-topics-run',
  inputSchema: segmentCreatedSchema.array(),
  outputSchema: branchRunSchema,
  execute: async ({ inputData, getStepResult }) =>
    multipleTopicsBranchRun(getStepResult(toMultipleTopicContextsStep), inputData),
});

const multipleTopicsPath = createWorkflow({
  id: 'multiple-topics-path',
  inputSchema: topicResultSchema,
  outputSchema: branchRunSchema,
})
  .then(toMultipleTopicContextsStep)
  .foreach(perTopicSubworkflow, { concurrency: 4 })
  .then(multipleTopicsRunStep)
  .commit();

const ingestionWorkflow = createWorkflow({
  id: 'ingestionWorkflow',
  inputSchema: inputFileSchema,
  outputSchema: runOutputEntrySchema.array(),
  requestContextSchema: meetingContextSchema,
})
  .then(readTranscriptStep)
  .then(classifyTopicsStep)
  .branch([
    [async ({ inputData }) => inputData.singleTopic !== null, singleTopicPath],
    [async ({ inputData }) => inputData.singleTopic === null, multipleTopicsPath],
  ])
  .then(collectSegmentsStep)
  .then(writeIndexStep)
  .commit();

export { ingestionWorkflow };
