import { agentConfig } from '@mastra/core/agent';
import { ingestionWorkflow } from '../../workflows/ingestion-wf';

// File-based agent: instructions.ts composes the static persona in
// ./instructions.base.md (hot-reloaded by `mastra dev` — edits apply on the
// next request) with optional per-run meeting context from the run's
// RequestContext. The directory name is the registry key.
export default agentConfig({
  id: 'matt-meeting-master',
  name: 'Matt The Meeting Master',
  model: 'zai-coding-plan/glm-5.3-flash',
  workflows: { ingestionWorkflow },
});
