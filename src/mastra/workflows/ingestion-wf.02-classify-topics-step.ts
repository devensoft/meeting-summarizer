import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { topicResultSchema, transcriptSchema } from './ingestion-wf.schemas';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';
import { readMeetingContext, reconcileTopics, renderMeetingContextCard } from '../meeting-context';

const classifyTopicsPrompt = loadPrompt(import.meta.url, 'ingestion-wf.02-classify-topics-step.prompt.md');

export const classifyTopicsStep = createStep({
  id: 'classify-topics',
  description: 'Identify unique topics, record topic omissions, and preserve the transcript for downstream processing.',
  inputSchema: transcriptSchema,
  outputSchema: topicResultSchema,
  execute: async ({ inputData: { transcriptContent, isValidTranscript, meetingType }, mastra, getStepResult, requestContext }) => {
    if (!isValidTranscript) {
      throw new Error('Invalid transcript');
    }

    const { meetingDirectoryName } = getStepResult(readTranscriptStep);
    const contextBlock = renderMeetingContextCard(readMeetingContext(requestContext));

    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(classifyTopicsPrompt(), { meetingType, transcriptContent, contextBlock }),
      {
        structuredOutput: jsonOnly(
          z.object({ topics: z.array(z.string()), omittedTopics: z.array(z.string()) }),
          '{"topics":["Topic label","Another topic"],"omittedTopics":["Off-topic tangent label"]}',
        ),
        requestContext,
      },
    );
    const { topics, omittedTopics } = reconcileTopics(response.object.topics, response.object.omittedTopics);

    if (topics.length === 0) {
      throw new Error('Failed to extract topics from the transcript.');
    }

    return {
      transcriptContent,
      topics,
      omittedTopics,
      singleTopic: topics.length === 1 ? topics[0] : null,
      meetingDirectoryName,
    };
  },
});