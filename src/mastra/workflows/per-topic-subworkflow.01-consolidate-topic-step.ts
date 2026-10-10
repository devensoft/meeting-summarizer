import { createStep } from '@mastra/core/workflows';
import { consolidatedTopicSchema, topicContextSchema } from './ingestion-wf.schemas';
import { z } from 'zod';
import { jsonOnly } from './structured-output';

export const consolidateTopicStep = createStep({
  id: 'consolidate-topic',
  description: 'Consolidate all transcript passages related to one topic.',
  inputSchema: topicContextSchema,
  outputSchema: consolidatedTopicSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      `Find and consolidate every passage related to the topic "${inputData.topic}". The passages may be scattered throughout the transcript. Preserve important details and chronology.\n\nTranscript:\n${inputData.transcriptContent}`,
      {
        structuredOutput: jsonOnly(
          z.object({ consolidatedContent: z.string() }),
          '{"consolidatedContent":"consolidated passages text"}',
        ),
      },
    );

    return { ...inputData, ...response.object };
  },
});