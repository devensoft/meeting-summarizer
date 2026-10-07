import { meetingMaster } from './agents/meeting-master-agent';
import { ingestionWorkflow } from './workflows/ingestion-wf';
import { Mastra } from '@mastra/core';


// Export the initialized Mastra application bundle
export const mastra = new Mastra({
  agents: { zaiAgent: meetingMaster },
  workflows: { ingestionWorkflow },
});

