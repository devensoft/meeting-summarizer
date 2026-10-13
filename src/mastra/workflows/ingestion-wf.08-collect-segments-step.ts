import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { segmentCreatedSchema } from './ingestion-wf.schemas';

// Branch output is keyed by the id of whichever path ran.
export const collectSegmentsStep = createStep({
  id: 'collect-segments',
  description: 'Flatten the single-topic or multi-segment branch result into one list of created files.',
  inputSchema: z.object({
    'single-topic-path': segmentCreatedSchema.optional(),
    'multiple-topics-path': segmentCreatedSchema.array().optional(),
  }),
  outputSchema: segmentCreatedSchema.array(),
  execute: async ({ inputData }) => [
    ...(inputData['single-topic-path'] ? [inputData['single-topic-path']] : []),
    ...(inputData['multiple-topics-path'] ?? []),
  ],
});
