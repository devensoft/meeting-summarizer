import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { inputFileSchema, transcriptSchema } from './ingestion-wf.schemas';
import { resolveFromRoot, resolveProjectRoot } from '../../common/utils';

export const readTranscriptStep = createStep({
  id: 'read-transcript',
  description: 'Read and validate the uploaded transcript.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ mastra, inputData: { filePath } }) => {
    const projectRoot = resolveProjectRoot(process.cwd());
    const inputFilePath = resolveFromRoot(projectRoot, filePath);
    const transcriptContent = await readFile(inputFilePath, 'utf8');

    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    const outputDirName = `${path.basename(inputFilePath, path.extname(inputFilePath))}-${Date.now()}`;
    const meetingDirectory = path.join('meetings', outputDirName);
    await workspace.mkdir(meetingDirectory, { recursive: true });
    await workspace.writeFile(path.join(meetingDirectory, path.basename(inputFilePath)), transcriptContent);

    return {
      meetingDirectoryName: outputDirName,
      isValidTranscript: transcriptContent.trim().length > 0,
      transcriptContent,
      meetingType: 'general',
    };
  },
});
