import { createStep } from '@mastra/core/workflows';
import { enrichedTopicSchema, extractedTopicSchema, segmentSchema } from './ingestion-wf.schemas';
import { z } from 'zod';
import { jsonOnly } from './structured-output';

export const enrichSegmentsStep = createStep({
  id: 'enrich-segments',
  description: 'Enrich each extracted segment with its relevant context.',
  inputSchema: extractedTopicSchema,
  outputSchema: enrichedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      `Enrich these meeting segments without inventing facts. Preserve the topic and content while improving clarity and context.\n\nSegments:\n${JSON.stringify(inputData.segments)}`,
      {
        structuredOutput: jsonOnly(
          z.object({ enrichedSegments: z.array(segmentSchema) }),
          '{"enrichedSegments":[{"topic":"segment topic","content":"enriched segment text"}]}',
        ),
      },
    );

    return { ...inputData, ...response.object };
  },
});