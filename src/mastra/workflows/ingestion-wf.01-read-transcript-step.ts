import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStep } from '@mastra/core/workflows';
import { inputFileSchema, transcriptSchema } from './ingestion-wf.schemas';
import { normalizeTranscriptFile } from '../tools/transcript-normalizer/transcript-normalizer-tool';
import { resolveFromRoot, resolveProjectRoot, resolveWithinDirectory } from '../paths';
import { slugify } from '../slugify';
import { readMeetingContext } from '../meeting-context';

export const readTranscriptStep = createStep({
  id: 'read-transcript',
  description: 'Read the uploaded transcript, normalize it into markdown through the transcript-normalizer tool, and keep the original beside it.',
  inputSchema: inputFileSchema,
  outputSchema: transcriptSchema,
  execute: async ({ mastra, requestContext, inputData: { filePath, seriesName } }) => {
    const projectRoot = resolveProjectRoot(process.cwd());
    const inputFilePath = resolveFromRoot(projectRoot, filePath);
    // Read as bytes, so the original lands beside the normalized copy
    // byte-identical — Word inputs are binary and must not round-trip
    // through a text decode.
    const transcriptContent = await readFile(inputFilePath);

    const workspace = mastra.getWorkspace()?.filesystem;
    if (!workspace) {
      throw new Error('Mastra workspace is not configured.');
    }

    // Filesystem rule: paths built from user/workflow input resolve through
    // the shared helpers before any workspace call — resolveWithinDirectory,
    // anchored at the workspace root, rejects anything that would escape it
    // before anything is written.
    const workspaceRoot = resolveFromRoot(projectRoot, '.workspace');
    const withinWorkspace = (workspacePath: string) =>
      path.relative(workspaceRoot, resolveWithinDirectory(workspaceRoot, workspacePath));

    const inputBaseName = path.basename(inputFilePath);
    const stem = path.basename(inputFilePath, path.extname(inputFilePath));
    const baseName = `${stem}-${Date.now()}`;
    const seriesSlug = slugify(seriesName ?? '');
    // A series name nests the run under meetings/<series>/<transcript>, so the
    // series is visible from the workspace layout alone.
    const outputDirName = seriesSlug ? path.join(seriesSlug, baseName) : baseName;
    const meetingDirectory = withinWorkspace(path.join('meetings', outputDirName));
    await workspace.mkdir(meetingDirectory, { recursive: true });
    // The original stays untouched; the normalized markdown transcript beside
    // it is the citation target every generated note refers to — the tool
    // writes it.
    await workspace.writeFile(withinWorkspace(path.join(meetingDirectory, inputBaseName)), transcriptContent);
    const normalized = await normalizeTranscriptFile({
      filePath: inputFilePath,
      outputDirectory: path.join(workspaceRoot, meetingDirectory),
    });

    const meetingContext = readMeetingContext(requestContext);

    return {
      meetingDirectoryName: outputDirName,
      isValidTranscript: normalized.isValidTranscript,
      transcriptContent: normalized.content,
      durationSeconds: normalized.durationSeconds,
      lineCount: normalized.lineCount,
      meetingId: normalized.meetingId,
      transcriptId: normalized.transcriptId,
      title: normalized.title,
      startTimestamp: normalized.startTimestamp,
      endTimestamp: normalized.endTimestamp,
      participantCount: normalized.participantCount,
      normalizedFilePath: normalized.normalizedFilePath,
      meetingContext: meetingContext.meetingContext ?? null,
    };
  },
});
