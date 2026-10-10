import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { segmentCreatedSchema, segmentFileSchema } from './ingestion-wf.schemas';
import { resolveProjectRoot, resolveWithinDirectory } from '../../common/utils';
import { readTranscriptStep } from './ingestion-wf.01-read-transcript-step';

export const writeSegmentFileStep = createStep({
  id: 'write-segment-file',
  description: "Write the distilled topic document to the current meeting's workspace directory.",
  inputSchema: segmentFileSchema,
  outputSchema: segmentCreatedSchema,
  execute: async ({ inputData, getStepResult }) => {
    const meetingDirectoryName = getStepResult(readTranscriptStep).meetingDirectoryName;
    const projectRoot = resolveProjectRoot(process.cwd());
    const meetingsDirectory = path.resolve(projectRoot, '.workspace', 'meetings');
    const outputDirectory = resolveWithinDirectory(meetingsDirectory, meetingDirectoryName);
    const outputFilePath = resolveWithinDirectory(outputDirectory, path.basename(inputData.filePath));
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputFilePath, inputData.content, 'utf8');
    const { size } = await stat(outputFilePath);
    return {
      topic: inputData.topic,
      filePath: path.relative(projectRoot, outputFilePath),
      fileSize: size,
      isSegment: inputData.isSegment,
    };
  },
});