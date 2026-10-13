import { createStep } from '@mastra/core/workflows';
import { extractedTopicSchema, consolidatedTopicSchema, segmentSchema } from './ingestion-wf.schemas';
import { z } from 'zod';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';

const extractSegmentsPrompt = loadPrompt(import.meta.url, 'per-topic-subworkflow.02-extract-segments-step.prompt.md');

export const extractSegmentsStep = createStep({
  id: 'extract-segments',
  description: 'Extract coherent segments from the consolidated topic material.',
  inputSchema: consolidatedTopicSchema,
  outputSchema: extractedTopicSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(extractSegmentsPrompt(), {
        topic: inputData.topic,
        consolidatedContent: inputData.consolidatedContent,
      }),
      {
        structuredOutput: jsonOnly(
          z.object({ segments: z.array(segmentSchema) }),
          '{"segments":[{"topic":"segment topic","content":"segment text"}]}',
        ),
        requestContext,
      },
    );

    return { ...inputData, ...response.object };
  },
});