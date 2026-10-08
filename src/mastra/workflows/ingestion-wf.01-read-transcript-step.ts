import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { inputFileSchema, transcriptSchema } from './ingestion-wf.schemas';
import { resolveFromRoot, resolveProjectRoot, resolveWithinDirectory } from '../../common/utils';

export const readTranscriptStep = createStep({
  id: 'read-transcript',
  description: 'Read and validate the uploaded transcript.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ inputData: { filePath } }) => {
    const projectRoot = resolveProjectRoot(process.cwd());
    const inputFilePath = resolveFromRoot(projectRoot, filePath);
    const file = new File([await readFile(inputFilePath)], path.basename(inputFilePath), {
      type: 'text/plain',
    });

    if (file.type !== 'text/plain') {
      throw new Error('Invalid file type. Only plain text files are supported.');
    }

    const workspaceDirectory = path.resolve(projectRoot, '.workspace', 'meetings');
    const outputDirName = `${path.basename(inputFilePath, path.extname(inputFilePath))}-${Date.now()}`;
    const meetingDirectory = resolveWithinDirectory(workspaceDirectory, outputDirName);
    const meetingFilePath = path.resolve(meetingDirectory, path.basename(inputFilePath));
    await mkdir(meetingDirectory, { recursive: true });
    await writeFile(meetingFilePath, await file.text(), 'utf8');

    const transcriptContent = await file.text();

    return {
      meetingDirectoryName: outputDirName,
      isValidTranscript: transcriptContent.trim().length > 0,
      transcriptContent,
      meetingType: 'general',
    };
  },
});
