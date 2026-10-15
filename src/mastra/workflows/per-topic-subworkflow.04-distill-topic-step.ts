import { createStep } from '@mastra/core/workflows';
import {
  citedTopicContentSchema,
  distilledTopicSchema,
  enrichedTopicSchema,
} from './ingestion-wf.schemas';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';
import { renderMeetingContextCard } from '../meeting-context';
import { meetingModeGuidance } from './meeting-mode';
import { validateCitedTopic } from './citation-validator';

const distillTopicPrompt = loadPrompt(import.meta.url, 'per-topic-subworkflow.04-distill-topic-step.prompt.md');

export const distillTopicStep = createStep({
  id: 'distill-topic',
  description:
    'Distill enriched segments into structured, citation-bearing topic-file content: title, summary, key insights, contextual highlights — every reference and quote validated against the normalized transcript.',
  inputSchema: enrichedTopicSchema,
  outputSchema: distilledTopicSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(distillTopicPrompt(), {
        topic: inputData.topic,
        enrichedSegments: JSON.stringify(inputData.enrichedSegments),
        transcriptContent: inputData.transcriptContent,
        modeGuidance: meetingModeGuidance(inputData.mode),
        contextBlock: renderMeetingContextCard({
          meetingContext: inputData.meetingContext ?? undefined,
        }),
      }),
      {
        structuredOutput: jsonOnly(
          citedTopicContentSchema,
          '{"title":"Topic title","summary":[{"statement":"What was discussed","lineReferences":[3,4],"quote":null}],"keyInsights":[{"statement":"The decision taken","lineReferences":[7],"quote":"exact words from line 7"}],"contextualHighlights":[{"statement":"Ties this discussion to the series background","lineReferences":[12],"quote":null}]}',
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
      // Threaded onward for the enriched-concept phases: the proposal call
      // reads the citation target to spot casually-mentioned concepts.
      transcriptContent: inputData.transcriptContent,
    };
  },
});
