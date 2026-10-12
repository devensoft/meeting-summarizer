import path from 'node:path';
import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { enrichedTopicSchema, segmentFileSchema } from './ingestion-wf.schemas';
import { loadPrompt, renderTemplate } from '../../common/prompts';
import { jsonOnly } from './structured-output';

const distillTopicPrompt = loadPrompt(import.meta.url, 'per-topic-subworkflow.04-distill-topic-step.prompt.md');

export const distillTopicStep = createStep({
  id: 'distill-topic',
  description: 'Distill enriched segments into the file content for this topic.',
  inputSchema: enrichedTopicSchema,
  outputSchema: segmentFileSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('meeting-master').generate(
      renderTemplate(distillTopicPrompt, {
        topic: inputData.topic,
        enrichedSegments: JSON.stringify(inputData.enrichedSegments),
      }),
      {
        structuredOutput: jsonOnly(
          z.object({ fileName: z.string(), content: z.string() }),
          '{"fileName":"short-kebab-name","content":"full markdown document"}',
        ),
      },
    );
    const fileName = response.object.fileName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'segment';

    return {
      topic: inputData.topic,
      filePath: path.join('src', 'mastra', 'public', 'segments', `${fileName}.md`),
      content: response.object.content,
      isSegment: inputData.isSegment,
      meetingDirectoryName: inputData.meetingDirectoryName,
    };
  },
});