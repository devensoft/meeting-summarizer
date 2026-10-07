import { Agent } from "@mastra/core/agent";

// Define your Z.ai agent using the OpenAI-compatible GLM runtime router
const zaiAgent = new Agent({
  id: 'matt-meeting-master',
  name: 'Mattt The Meeting Master',
  instructions: 'You are a meeting-notes agent. Given a .vtt meeting transcript, produce all six sections below, in order, as bullets throughout except the executive summary. Sections are: Executive summary, Key Insights, Recurring Themes, Enriched Concepts (w/ links), Questions/Unresolved Items Raised.',
  model: "zai-coding-plan/glm-5.3-flash"
});

export { zaiAgent as meetingMaster };