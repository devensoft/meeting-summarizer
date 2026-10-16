import { agentConfig } from '@mastra/core/agent';
import { ingestionWorkflow } from '../../workflows/ingestion-wf';
import { meetingContextSchema } from '../../meeting-context';
import { resolveModelSelection } from '../../models/model-selection';

// File-based agent: instructions.ts composes the static persona in
// ./instructions.base.md (hot-reloaded by `mastra dev` — edits apply on the
// next request) with optional per-run meeting context from the run's
// RequestContext. The directory name is the registry key.
export default agentConfig({
  id: 'meeting-master',
  name: 'Matt The Meeting Master',
  model: ({ requestContext }) => resolveModelSelection(requestContext).model,
  workflows: { ingestionWorkflow },
  requestContextSchema: meetingContextSchema,
});
