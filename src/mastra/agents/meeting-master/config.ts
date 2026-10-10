import { agentConfig } from '@mastra/core/agent';
import { ingestionWorkflow } from '../../workflows/ingestion-wf';

// File-based agent: the system prompt lives in ./instructions.md (watched by
// `mastra dev` — edits hot-reload). The directory name is the registry key.
export default agentConfig({
  id: 'matt-meeting-master',
  name: 'Matt The Meeting Master',
  model: 'zai-coding-plan/glm-5.3-flash',
  workflows: { ingestionWorkflow },
});
