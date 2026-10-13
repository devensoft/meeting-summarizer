import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { inputFileSchema, transcriptSchema } from './ingestion-wf.schemas';
import { resolveFromRoot, resolveProjectRoot } from '../../common/utils';
import { readMeetingContext } from '../meeting-context';

/** Kebab-cases a user-supplied series name for use as a directory segment;
 * returns an empty string when nothing usable remains. */
function slugifySeriesName(seriesName: string | undefined): string {
  return (seriesName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const readTranscriptStep = createStep({
  id: 'read-transcript',
  description: 'Read and validate the uploaded transcript.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ mastra, requestContext, inputData: { filePath, seriesName } }) => {
    const projectRoot = resolveProjectRoot(process.cwd());
    const inputFilePath = resolveFromRoot(projectRoot, filePath);
    const transcriptContent = await readFile(inputFilePath, 'utf8');

    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    const baseName = `${path.basename(inputFilePath, path.extname(inputFilePath))}-${Date.now()}`;
    const seriesSlug = slugifySeriesName(seriesName);
    // A series name nests the run under meetings/<series>/<transcript>, so the
    // series is visible from the workspace layout alone.
    const outputDirName = seriesSlug ? path.join(seriesSlug, baseName) : baseName;
    const meetingDirectory = path.join('meetings', outputDirName);
    await workspace.mkdir(meetingDirectory, { recursive: true });
    await workspace.writeFile(path.join(meetingDirectory, path.basename(inputFilePath)), transcriptContent);

    return {
      meetingDirectoryName: outputDirName,
      isValidTranscript: transcriptContent.trim().length > 0,
      transcriptContent,
      meetingType: readMeetingContext(requestContext).meetingType ?? 'general',
    };
  },
});
