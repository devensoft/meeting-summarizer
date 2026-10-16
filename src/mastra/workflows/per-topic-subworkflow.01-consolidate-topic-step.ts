import { createStep } from '@mastra/core/workflows';
import { consolidatedTopicSchema, topicContextSchema } from './ingestion-wf.schemas';
import { z } from 'zod';
import { loadPrompt, renderTemplate } from '../prompts';
import { resolveModelSelection } from '../models/model-selection';

const consolidateTopicPrompt = loadPrompt(import.meta.url, 'per-topic-subworkflow.01-consolidate-topic-step.prompt.md');

export const consolidateTopicStep = createStep({
  id: 'consolidate-topic',
  description: 'Consolidate all transcript passages related to one topic.',
  inputSchema: topicContextSchema,
  outputSchema: consolidatedTopicSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(consolidateTopicPrompt(), {
        topic: inputData.topic,
        transcriptContent: inputData.transcriptContent,
      }),
      {
        ...resolveModelSelection(requestContext).profile.callOptions({
          schema: z.object({ consolidatedContent: z.string() }),
          shapeExample: '{"consolidatedContent":"consolidated passages text"}',
          intent: 'low',
        }),
        requestContext,
      },
    );

    return { ...inputData, ...response.object };
  },
});
