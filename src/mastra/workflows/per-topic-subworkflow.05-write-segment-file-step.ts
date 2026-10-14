import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { segmentCreatedSchema, validatedTopicFileSchema } from './ingestion-wf.schemas';
import { renderTopicFile } from './topic-file-renderer';
import { resolveTopicFileName, slugifyTopicTitle } from './topic-file-name';

export const writeSegmentFileStep = createStep({
  id: 'write-segment-file',
  description:
    "Render the topic file's markdown in code and write it into the meeting's workspace directory under a slugified, collision-safe file name.",
  inputSchema: validatedTopicFileSchema,
  outputSchema: segmentCreatedSchema,
  execute: async ({ mastra, inputData }) => {
    const { meetingDirectoryName } = inputData;
    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    const meetingDirectory = path.join('meetings', meetingDirectoryName);
    await workspace.mkdir(meetingDirectory, { recursive: true });
    // The file name comes from code, never the model: the slug of the
    // validated title, suffixed when a same-run file already holds it.
    const takenFileNames = (await workspace.readdir(meetingDirectory)).map((entry) => entry.name);
    const fileName = resolveTopicFileName(slugifyTopicTitle(inputData.title), takenFileNames);
    const outputFilePath = path.join(meetingDirectory, fileName);

    await workspace.writeFile(outputFilePath, renderTopicFile(inputData));
    const { size } = await workspace.stat(outputFilePath);
    return {
      topic: inputData.topic,
      filePath: path.join('.workspace', outputFilePath),
      fileSize: size,
      isSegment: inputData.isSegment,
    };
  },
});
