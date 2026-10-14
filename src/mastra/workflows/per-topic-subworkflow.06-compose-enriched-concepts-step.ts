import { createStep } from '@mastra/core/workflows';
import {
  composedConceptsSchema,
  composedTopicFileSchema,
  proposedConceptsSchema,
} from './ingestion-wf.schemas';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';
import { resolveEnrichedConcepts } from './enriched-concepts';

const composeConceptsPrompt = loadPrompt(
  import.meta.url,
  'per-topic-subworkflow.06-compose-enriched-concepts-step.prompt.md',
);

export const composeEnrichedConceptsStep = createStep({
  id: 'compose-enriched-concepts',
  description:
    'Write each concept blurb tying the informal mention to its formal foundation and select its links; code then fixes provenance — searched links only when the chain found results, model-suggested (unverified) links only when it found nothing.',
  inputSchema: proposedConceptsSchema,
  outputSchema: composedTopicFileSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    // A topic with no candidates gets no section — and no second agent call.
    if (inputData.conceptSearches.length === 0) {
      return { ...inputData, enrichedConcepts: [] };
    }

    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(composeConceptsPrompt(), {
        topic: inputData.topic,
        conceptSearches: JSON.stringify(inputData.conceptSearches),
      }),
      {
        structuredOutput: jsonOnly(
          composedConceptsSchema,
          '{"concepts":[{"informalMention":"five whys","formalFoundation":"Root cause analysis","blurb":"Five whys is the root-cause-analysis practice of asking why repeatedly until the underlying cause surfaces.","links":[{"title":"Five whys — Wikipedia","url":"https://en.wikipedia.org/wiki/Five_whys"}]}]}',
        ),
        requestContext,
      },
    );

    // Provenance and link validation are code decisions, taken from the
    // chain results — never from what the model claims about its links.
    const enrichedConcepts = resolveEnrichedConcepts(inputData.conceptSearches, response.object.concepts);

    return { ...inputData, enrichedConcepts };
  },
});
