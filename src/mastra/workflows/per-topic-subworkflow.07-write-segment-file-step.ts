import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { composedTopicFileSchema, segmentCreatedSchema } from './ingestion-wf.schemas';
import { renderTopicFile } from './topic-file-renderer';
import { resolveTopicFileName, slugifyTopicTitle } from './topic-file-name';
import { resolveFromRoot, resolveProjectRoot, resolveWithinDirectory } from '../../common/utils';

export const writeSegmentFileStep = createStep({
  id: 'write-segment-file',
  description:
    "Render the topic file's markdown in code — fixed sections through Enriched Concepts — and write it into the meeting's workspace directory under a slugified, collision-safe file name.",
  inputSchema: composedTopicFileSchema,
  outputSchema: segmentCreatedSchema,
  execute: async ({ mastra, inputData }) => {
    const { meetingDirectoryName } = inputData;
    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    // Filesystem rule: paths built from workflow input resolve through the
    // shared helpers before any workspace call — resolveWithinDirectory,
    // anchored at the workspace root, rejects anything that would escape it
    // before anything is written.
    const workspaceRoot = resolveFromRoot(resolveProjectRoot(process.cwd()), '.workspace');
    const withinWorkspace = (workspacePath: string) =>
      path.relative(workspaceRoot, resolveWithinDirectory(workspaceRoot, workspacePath));

    const meetingDirectory = withinWorkspace(path.join('meetings', meetingDirectoryName));
    await workspace.mkdir(meetingDirectory, { recursive: true });
    // The file name comes from code, never the model: the slug of the
    // validated title, suffixed when a same-run file already holds it.
    const takenFileNames = (await workspace.readdir(meetingDirectory)).map((entry) => entry.name);
    const fileName = resolveTopicFileName(slugifyTopicTitle(inputData.title), takenFileNames);
    const outputFilePath = withinWorkspace(path.join(meetingDirectory, fileName));

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
