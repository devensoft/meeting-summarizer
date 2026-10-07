import { z } from 'zod';
import { createStep, createWorkflow } from '@mastra/core/workflows';

const inputFileSchema =  z.object({ file: z.file() });
const topicResultSchema = z.object({ topics: z.array(z.string()), singleTheme: z.string().optional() });
const transcriptSchema = z.object({ isValidTranscript: z.boolean(), transcriptContent: z.string(), meetingType: z.string() });

const step1 = createStep({
  id: 'step1',
  description: 'This is the initial step of the ingestion workflow.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ inputData: { file }, mastra }) => {

    if(file.type !== 'text/plain') {
      throw new Error('Invalid file type. Only plain text files are supported.');
    }

    const transcriptContent = await file.text();

    return {
      isValidTranscript: transcriptContent.trim().length > 0,
      transcriptContent,
      meetingType: 'general',
    };
  },
});

const step2 = createStep({
  id: 'step2',
  description: 'Identify the unique topics discussed in the meeting transcript.',
  inputSchema: transcriptSchema,
  outputSchema: topicResultSchema,
  execute: async ({ inputData: { transcriptContent, isValidTranscript, meetingType }, mastra }) => {
    if (!isValidTranscript) {
      throw new Error('Invalid transcript');
    }    

    const response = await mastra.getAgent('zaiAgent').generate(
      `The provided text is a transcript of a meeting recording. The meeting is a ${meetingType} meeting. Identify each individual topic. Return each unique topic once as a concise label. Do not split topics based only on paragraph boundaries.\n\nTranscript:\n${transcriptContent}`,
      { structuredOutput: { schema: topicResultSchema } },
    );

    if (!response.object || !Array.isArray(response.object.topics)) {
      throw new Error('Failed to extract topics from the transcript.');
    }

    // Ensure that each topic is unique
    let topics = Array.from(new Set(response.object.topics));
    let singleTheme = topics.length === 1 ? topics[0] : undefined;

    return { topics, singleTheme };
  },
});

const step3 = createStep({
  id: 'step3',
  description: 'This step could be used for further processing of the identified topics.',
  inputSchema: topicResultSchema,
  outputSchema: z.array(z.object({segments: z.array(z.object({ topic: z.string(), content: z.string() }))})),
  execute: async ({ inputData: { topics }, mastra }) => {
    const perTopicPrompt = "Extract and correlate all content related to this topic from the transcript. It may be temporally scattered throughout the transcript or it may be in a single contiguous section."
    let segmenObjects = await Promise.all(topics.map(async topic => {
      // Placeholder for processing each topic. For example, you could create segments based on the topic.
      const response = await mastra.getAgent("zaiAgent").generate(
        perTopicPrompt,
        { structuredOutput: { schema: z.object({ segments: z.array(z.object({ topic: z.string(), content: z.string() })) }) } },
      );
      return response.object;
    }));
    return segmenObjects;
  },
});

const ingestionWorkflow = createWorkflow({
  id: 'ingestionWorkflow',
  inputSchema: inputFileSchema,
  outputSchema: topicResultSchema,
})
  .then(step1)
  .then(step2)
  .then(step3)
  .commit();

export { ingestionWorkflow };
