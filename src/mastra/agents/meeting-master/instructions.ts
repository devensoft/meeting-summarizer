import { agentInstructions } from '@mastra/core/agent';
import { loadPrompt } from '../../../common/prompts';
import { readMeetingContext, renderMeetingContextCard } from '../../meeting-context';

// The static persona lives in instructions.base.md — renamed from the
// file-based loader's `instructions.md` convention so this module stays the
// single instructions source (instructions.ts wins over instructions.md, but
// the coexistence warns on every boot). The base file is re-read from disk on
// every request via loadPrompt, so edits hot-reload under `mastra dev` exactly
// as instructions.md did.
const baseInstructions = loadPrompt(import.meta.url, 'instructions.base.md');

/**
 * Per-request system prompt: the persona plus, when the run carries meeting
 * context (seeded from a Studio request-context preset), a short framing
 * block. Without context the prompt is byte-identical to the base file.
 */
export default agentInstructions(({ requestContext }) => {
  const base = baseInstructions();
  const card = renderMeetingContextCard(readMeetingContext(requestContext));
  if (!card) {
    return base;
  }

  return `${base}

## Context for this run

${card}
Keep the five sections focused on what this meeting series is for; material the series is not about is not worth a reader's attention.`;
});
