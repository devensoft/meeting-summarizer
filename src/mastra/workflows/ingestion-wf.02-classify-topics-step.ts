import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { topicResultSchema, transcriptSchema } from './ingestion-wf.schemas';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';

const classifyTopicsPrompt = loadPrompt(import.meta.url, 'ingestion-wf.02-classify-topics-step.prompt.md');

export const classifyTopicsStep = createStep({
  id: 'classify-topics',
  description: 'Identify unique topics and preserve the transcript for downstream processing.',
  inputSchema: transcriptSchema,
  outputSchema: topicResultSchema,
  execute: async ({ inputData: { transcriptContent, isValidTranscript, meetingType }, mastra, getStepResult }) => {
    if (!isValidTranscript) {
      throw new Error('Invalid transcript');
    }

    const { meetingDirectoryName } = getStepResult(readTranscriptStep);

    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(classifyTopicsPrompt(), { meetingType, transcriptContent }),
      {
        structuredOutput: jsonOnly(
          z.object({ topics: z.array(z.string()) }),
          '{"topics":["Topic label","Another topic"]}',
        ),
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
      meetingDirectoryName,
    };
  },
});
