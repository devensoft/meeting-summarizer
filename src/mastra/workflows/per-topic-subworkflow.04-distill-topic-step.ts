import { createStep } from '@mastra/core/workflows';
import { citedTopicContentSchema, enrichedTopicSchema, validatedTopicFileSchema } from './ingestion-wf.schemas';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';
import { renderMeetingContextCard } from '../meeting-context';
import { validateCitedTopic } from './citation-validator';

const distillTopicPrompt = loadPrompt(import.meta.url, 'per-topic-subworkflow.04-distill-topic-step.prompt.md');

export const distillTopicStep = createStep({
  id: 'distill-topic',
  description:
    'Distill enriched segments into structured, citation-bearing topic-file content: title, summary, key insights, contextual highlights — every reference and quote validated against the normalized transcript.',
  inputSchema: enrichedTopicSchema,
  outputSchema: validatedTopicFileSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(distillTopicPrompt(), {
        topic: inputData.topic,
        enrichedSegments: JSON.stringify(inputData.enrichedSegments),
        transcriptContent: inputData.transcriptContent,
        contextBlock: renderMeetingContextCard({
          meetingType: inputData.meetingType,
          meetingContext: inputData.meetingContext ?? undefined,
        }),
      }),
      {
        structuredOutput: jsonOnly(
          citedTopicContentSchema,
          '{"title":"Topic title","summary":[{"statement":"What was discussed","lineReferences":[3,4],"quote":null}],"keyInsights":[{"statement":"The decision taken","lineReferences":[7],"quote":"exact words from line 7"}],"contextualHighlights":[]}',
        ),
        requestContext,
      },
    );

    return {
      topic: inputData.topic,
      ...validateCitedTopic(response.object, {
        lineCount: inputData.lineCount,
        transcriptContent: inputData.transcriptContent,
      }),
      hasMeetingContext: inputData.meetingContext !== null,
      isSegment: inputData.isSegment,
      meetingDirectoryName: inputData.meetingDirectoryName,
    };
  },
});
