import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { classifiedTopicSchema, topicResultSchema, transcriptSchema } from './ingestion-wf.schemas';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';
import { readMeetingContext, reconcileTopics, renderMeetingContextCard } from '../meeting-context';
import { resolveTopicDominance } from './topic-dominance';

const classifyTopicsPrompt = loadPrompt(import.meta.url, 'ingestion-wf.02-classify-topics-step.prompt.md');

const classifierOutputSchema = z.object({
  topics: z.array(classifiedTopicSchema),
  omittedTopics: z.array(classifiedTopicSchema),
  isCohesive: z.boolean(),
});

export const classifyTopicsStep = createStep({
  id: 'classify-topics',
  description:
    'Identify unique topics and topic omissions with their transcript line ranges, judge cohesion, and resolve topic dominance.',
  inputSchema: transcriptSchema,
  outputSchema: topicResultSchema,
  execute: async ({ inputData: { transcriptContent, isValidTranscript, meetingType, durationSeconds, lineCount }, mastra, getStepResult, requestContext }) => {
    if (!isValidTranscript) {
      throw new Error('Invalid transcript');
    }

    const { meetingDirectoryName } = getStepResult(readTranscriptStep);
    const contextBlock = renderMeetingContextCard(readMeetingContext(requestContext));

    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(classifyTopicsPrompt(), { meetingType, transcriptContent, contextBlock }),
      {
        structuredOutput: jsonOnly(
          classifierOutputSchema,
          '{"topics":[{"topic":"Topic label","lineRanges":[{"startLine":1,"endLine":12}]}],"omittedTopics":[{"topic":"Off-topic tangent label","lineRanges":[{"startLine":40,"endLine":45}]}],"isCohesive":true}',
        ),
        requestContext,
      },
    );
    const { topics, omittedTopics } = reconcileTopics(response.object.topics, response.object.omittedTopics);
    const { isCohesive } = response.object;

    if (topics.length === 0) {
      throw new Error('Failed to extract topics from the transcript.');
    }

    const outcome = resolveTopicDominance({ topics, omittedTopics, lineCount, durationSeconds, isCohesive });

    return {
      transcriptContent,
      topics: outcome.topics,
      omittedTopics: outcome.omittedTopics,
      singleTopic: outcome.singleTopic,
      isCohesive,
      collapsedToSingleTopic: outcome.collapsedToSingleTopic,
      durationSeconds,
      lineCount,
      meetingDirectoryName,
    };
  },
});
