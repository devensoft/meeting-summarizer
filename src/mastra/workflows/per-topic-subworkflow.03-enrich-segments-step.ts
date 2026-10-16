import { createStep } from '@mastra/core/workflows';
import { enrichedTopicSchema, extractedTopicSchema, segmentSchema } from './ingestion-wf.schemas';
import { z } from 'zod';
import { loadPrompt, renderTemplate } from '../prompts';
import { resolveModelSelection } from '../models/model-selection';

const enrichSegmentsPrompt = loadPrompt(import.meta.url, 'per-topic-subworkflow.03-enrich-segments-step.prompt.md');

export const enrichSegmentsStep = createStep({
  id: 'enrich-segments',
  description: 'Enrich each extracted segment with its relevant context.',
  inputSchema: extractedTopicSchema,
  outputSchema: enrichedTopicSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(enrichSegmentsPrompt(), { segments: JSON.stringify(inputData.segments) }),
      {
        ...resolveModelSelection(requestContext).profile.callOptions({
          schema: z.object({ enrichedSegments: z.array(segmentSchema) }),
          shapeExample: '{"enrichedSegments":[{"topic":"segment topic","content":"enriched segment text"}]}',
          intent: 'low',
        }),
        requestContext,
      },
    );

    return { ...inputData, ...response.object };
  },
});
