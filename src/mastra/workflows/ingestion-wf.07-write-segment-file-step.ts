import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { segmentCreatedSchema, segmentFileSchema } from './ingestion-wf.schemas';
import { resolveWithinDirectory } from '../../common/utils';

export const writeSegmentFileStep = createStep({
  id: 'write-segment-file',
  description: 'Write the distilled topic document to the public segments directory.',
  inputSchema: segmentFileSchema,
  outputSchema: segmentCreatedSchema,
  execute: async ({ inputData }) => {
    const outputDirectory = path.resolve(process.cwd(), 'src', 'mastra', 'public', 'segments');
    const outputFilePath = resolveWithinDirectory(outputDirectory, path.basename(inputData.filePath));
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputFilePath, inputData.content, 'utf8');
    const { size } = await stat(outputFilePath);
    return {
      topic: inputData.topic,
      filePath: path.relative(process.cwd(), outputFilePath),
      fileSize: size,
      isSegment: inputData.isSegment,
    };
  },
});
