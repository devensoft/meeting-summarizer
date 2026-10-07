import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { inputFileSchema, transcriptSchema } from './ingestion-wf.schemas';
import { resolveFromRoot } from '../../common/utils';

export const readTranscriptStep = createStep({
  id: 'read-transcript',
  description: 'Read and validate the uploaded transcript.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ inputData: { filePath } }) => {
    const resolvedFilePath = resolveFromRoot(process.cwd(), filePath);
    const file = new File([await readFile(resolvedFilePath)], path.basename(resolvedFilePath), {
      type: 'text/plain',
    });

    if (file.type !== 'text/plain') {
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
