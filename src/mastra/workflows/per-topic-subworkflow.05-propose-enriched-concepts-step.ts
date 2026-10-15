import { createStep } from '@mastra/core/workflows';
import {
  proposedConceptCandidatesSchema,
  proposedConceptsSchema,
  distilledTopicSchema,
} from './ingestion-wf.schemas';
import { loadPrompt, renderTemplate } from '../prompts';
import { glmStructuredOutput } from '../models/glm';
import { searchEnrichedConcepts, selectConceptCandidates } from './enriched-concepts';
import { executeWebSearch } from '../tools/web-search/web-search-tool';

const proposeConceptsPrompt = loadPrompt(
  import.meta.url,
  'per-topic-subworkflow.05-propose-enriched-concepts-step.prompt.md',
);

export const proposeEnrichedConceptsStep = createStep({
  id: 'propose-enriched-concepts',
  description:
    'Propose the concepts this topic mentioned casually or informally, cap the list in code, and fan one search per candidate out in bounded waves through the configured provider chain.',
  inputSchema: distilledTopicSchema,
  outputSchema: proposedConceptsSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(proposeConceptsPrompt(), {
        topic: inputData.topic,
        transcriptContent: inputData.transcriptContent,
      }),
      {
        structuredOutput: glmStructuredOutput(
          proposedConceptCandidatesSchema,
          '{"concepts":[{"informalMention":"five whys"}]}',
        ),
        requestContext,
      },
    );

    // The cap lives in code (ENRICHED_CONCEPTS_MAX_CANDIDATES), never in the
    // prompt; the searches then ride the #7 provider chain, which runs the
    // bounded waves — this step never schedules them itself.
    const conceptCandidates = selectConceptCandidates(response.object.concepts);
    const conceptSearches = await searchEnrichedConcepts(conceptCandidates, executeWebSearch);

    return { ...inputData, conceptCandidates, conceptSearches };
  },
});
