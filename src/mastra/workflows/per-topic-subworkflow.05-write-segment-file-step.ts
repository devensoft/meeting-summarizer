import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { segmentCreatedSchema, segmentFileSchema } from './ingestion-wf.schemas';

export const writeSegmentFileStep = createStep({
  id: 'write-segment-file',
  description: "Write the distilled topic document to the current meeting's workspace directory.",
  inputSchema: segmentFileSchema,
  outputSchema: segmentCreatedSchema,
  execute: async ({ mastra, inputData }) => {
    const { meetingDirectoryName } = inputData;
    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    const meetingDirectory = path.join('meetings', meetingDirectoryName);
    const outputFilePath = path.join(meetingDirectory, path.basename(inputData.filePath));
    await workspace.mkdir(meetingDirectory, { recursive: true });
    await workspace.writeFile(outputFilePath, inputData.content);
    const { size } = await workspace.stat(outputFilePath);
    return {
      topic: inputData.topic,
      filePath: path.join('.workspace', outputFilePath),
      fileSize: size,
      isSegment: inputData.isSegment,
    };
  },
});
