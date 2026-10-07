import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { topicResultSchema, transcriptSchema } from './ingestion-wf.schemas';

export const classifyTopicsStep = createStep({
  id: 'classify-topics',
  description: 'Identify unique topics and preserve the transcript for downstream processing.',
  inputSchema: transcriptSchema,
  outputSchema: topicResultSchema,
  execute: async ({ inputData: { transcriptContent, isValidTranscript, meetingType }, mastra }) => {
    if (!isValidTranscript) {
      throw new Error('Invalid transcript');
    }

    const response = await mastra.getAgent('zaiAgent').generate(
      `The provided text is a transcript of a ${meetingType} meeting. Identify each distinct topic, including topics discussed in multiple non-contiguous sections. Return each unique topic once as a concise label.\n\nTranscript:\n${transcriptContent}`,
      {
        structuredOutput: {
          schema: z.object({ topics: z.array(z.string()) }),
        },
      },
    );
    const topics = Array.from(new Set(response.object.topics));

    if (topics.length === 0) {
      throw new Error('Failed to extract topics from the transcript.');
    }

    return {
      transcriptContent,
      topics,
      singleTheme: topics.length === 1 ? topics[0] : null,
    };
  },
});
