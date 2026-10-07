import { createStep } from '@mastra/core/workflows';
import { enrichedTopicSchema, extractedTopicSchema, segmentSchema } from './ingestion-wf.schemas';
import { z } from 'zod';

export const enrichSegmentsStep = createStep({
  id: 'enrich-segments',
  description: 'Enrich each extracted segment with its relevant context.',
  inputSchema: extractedTopicSchema,
  outputSchema: enrichedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('zaiAgent').generate(
      `Enrich these meeting segments without inventing facts. Preserve the topic and content while improving clarity and context.\n\nSegments:\n${JSON.stringify(inputData.segments)}`,
      {
        structuredOutput: {
          schema: z.object({ enrichedSegments: z.array(segmentSchema) }),
          jsonPromptInjection: true,
        },
      },
    );

    return { ...inputData, ...response.object };
  },
});
