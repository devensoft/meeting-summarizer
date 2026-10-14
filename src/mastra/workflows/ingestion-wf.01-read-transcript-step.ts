import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { inputFileSchema, transcriptSchema } from './ingestion-wf.schemas';
import { NORMALIZED_TRANSCRIPT_SUFFIX } from './constants';
import { detectTranscriptFormat, normalizeTranscript } from './transcript-normalizer';
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
  description: 'Read the uploaded transcript, normalize it, and keep the original beside the normalized copy.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ mastra, requestContext, inputData: { filePath, seriesName } }) => {
    const projectRoot = resolveProjectRoot(process.cwd());
    const inputFilePath = resolveFromRoot(projectRoot, filePath);
    const transcriptContent = await readFile(inputFilePath, 'utf8');

    const format = detectTranscriptFormat(path.basename(inputFilePath), transcriptContent);
    const normalized = normalizeTranscript(transcriptContent, format);

    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    const inputBaseName = path.basename(inputFilePath);
    const stem = path.basename(inputFilePath, path.extname(inputFilePath));
    const baseName = `${stem}-${Date.now()}`;
    const seriesSlug = slugifySeriesName(seriesName);
    // A series name nests the run under meetings/<series>/<transcript>, so the
    // series is visible from the workspace layout alone.
    const outputDirName = seriesSlug ? path.join(seriesSlug, baseName) : baseName;
    const meetingDirectory = path.join('meetings', outputDirName);
    await workspace.mkdir(meetingDirectory, { recursive: true });
    // The original stays untouched; the normalized transcript beside it is the
    // citation target every generated note refers to.
    await workspace.writeFile(path.join(meetingDirectory, inputBaseName), transcriptContent);
    await workspace.writeFile(path.join(meetingDirectory, `${stem}${NORMALIZED_TRANSCRIPT_SUFFIX}`), normalized.content);

    return {
      meetingDirectoryName: outputDirName,
      isValidTranscript: normalized.lineCount > 0,
      transcriptContent: normalized.content,
      durationSeconds: normalized.durationSeconds,
      lineCount: normalized.lineCount,
      meetingType: readMeetingContext(requestContext).meetingType ?? 'general',
    };
  },
});
