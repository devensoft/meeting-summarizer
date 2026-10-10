import { createWorkflow } from '@mastra/core/workflows';
import { consolidateTopicStep } from './per-topic-subworkflow.01-consolidate-topic-step';
import { extractSegmentsStep } from './per-topic-subworkflow.02-extract-segments-step';
import { enrichSegmentsStep } from './per-topic-subworkflow.03-enrich-segments-step';
import { distillTopicStep } from './per-topic-subworkflow.04-distill-topic-step';
import { writeSegmentFileStep } from './per-topic-subworkflow.05-write-segment-file-step';
import { segmentCreatedSchema, topicContextSchema } from './ingestion-wf.schemas';

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

export { perTopicSubworkflow };