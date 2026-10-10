import { createStep } from '@mastra/core/workflows';
import { extractedTopicSchema, consolidatedTopicSchema, segmentSchema } from './ingestion-wf.schemas';
import { z } from 'zod';
import { jsonOnly } from './structured-output';

export const extractSegmentsStep = createStep({
  id: 'extract-segments',
  description: 'Extract coherent segments from the consolidated topic material.',
  inputSchema: consolidatedTopicSchema,
  outputSchema: extractedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      `Extract the meaningful segments from this consolidated material. Return concise, non-overlapping segments with the topic label and supporting content.\n\nTopic: ${inputData.topic}\n\nMaterial:\n${inputData.consolidatedContent}`,
      {
        structuredOutput: jsonOnly(
          z.object({ segments: z.array(segmentSchema) }),
          '{"segments":[{"topic":"segment topic","content":"segment text"}]}',
        ),
      },
    );

    return { ...inputData, ...response.object };
  },
});