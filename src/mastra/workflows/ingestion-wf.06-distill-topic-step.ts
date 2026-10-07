import path from 'node:path';
import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { enrichedTopicSchema, segmentFileSchema } from './ingestion-wf.schemas';

export const distillTopicStep = createStep({
  id: 'distill-topic',
  description: 'Distill enriched segments into the file content for this topic.',
  inputSchema: enrichedTopicSchema,
  outputSchema: segmentFileSchema,
  execute: async ({ inputData, mastra }) => {
    const response = await mastra.getAgent('zaiAgent').generate(
      `Distill these enriched meeting segments into a clear Markdown document. Return a filesystem-safe short filename without an extension and the final Markdown content.\n\nTopic: ${inputData.topic}\n\nSegments:\n${JSON.stringify(inputData.enrichedSegments)}`,
      {
        structuredOutput: {
          schema: z.object({ fileName: z.string(), content: z.string() }),
        },
      },
    );
    const fileName = response.object.fileName.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'segment';

    return {
      topic: inputData.topic,
      filePath: path.join('src', 'mastra', 'public', 'segments', `${fileName}.md`),
      content: response.object.content,
    };
  },
});
