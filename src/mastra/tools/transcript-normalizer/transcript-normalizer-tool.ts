import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveFromRoot, resolveProjectRoot, resolveWithinDirectory } from '../../../common/utils';
import { NORMALIZED_TRANSCRIPT_SUFFIX } from './constants';
import { normalizeTranscriptSource, type TranscriptFormat } from './transcript-normalizer';

/**
 * The Mastra tool for transcript normalization: a raw upload (.vtt, .txt,
 * .doc, .docx) goes in, the normalized markdown transcript comes out —
 * frontmatter (MeetingID, TranscriptID, title, timestamps, duration,
 * participant count) over the numbered citation target.
 *
 * Everything is deterministic — parsing, extraction, rendering are pure code;
 * the only value generated per run is the TranscriptID, which is a fresh
 * random GUID by contract. The workflow's first step calls
 * `normalizeTranscriptFile` directly (the web-search pattern: the workflow
 * uses the internal function, the tool wraps it for models and Studio).
 */

export const transcriptNormalizationInputSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Path to the raw transcript file (.vtt, .txt, .doc, or .docx). Relative paths resolve against the project root; absolute paths are used as-is.',
    ),
  outputDirectory: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Directory the normalized markdown transcript is written to. Defaults to the directory of the source file.',
    ),
});

export const transcriptNormalizationOutputSchema = z.object({
  normalizedFilePath: z.string().describe('Absolute path of the written markdown transcript.'),
  markdown: z.string().describe('The full markdown document: frontmatter + numbered body.'),
  content: z.string().describe('The numbered body lines only — the citation target downstream prompts read.'),
  format: z.custom<TranscriptFormat>().describe('Detected input format: "vtt", "text", "docx", or "doc".'),
  isValidTranscript: z.boolean().describe('Whether the normalized transcript kept at least one citable line.'),
  meetingId: z.string().nullable().describe('The meeting GUID the VTT input carries; null when it does not.'),
  transcriptId: z.string().describe('Fresh random GUID generated for this ingest.'),
  title: z.string().describe('Frontmatter title: the source file name without extension.'),
  startTimestamp: z.string().nullable().describe('ISO 8601 meeting start; defaults to the source file creation time.'),
  endTimestamp: z.string().nullable().describe('ISO 8601 meeting end; start plus the parsed duration.'),
  duration: z.string().nullable().describe('Human duration in minutes or hours, e.g. "45m" or "1h 23m".'),
  durationSeconds: z.number().nullable().describe('Meeting duration in seconds from VTT cue timestamps.'),
  participantCount: z.number().int().nonnegative().nullable().describe('Distinct VTT speakers; null when unknowable.'),
  lineCount: z.number().int().nonnegative().describe('Number of numbered (citable) lines.'),
});

export type TranscriptNormalizationInput = z.infer<typeof transcriptNormalizationInputSchema>;
export type TranscriptNormalizationResult = z.infer<typeof transcriptNormalizationOutputSchema>;

/** Normalizes one transcript file and writes its markdown rendering. Reads
 * the source, detects the format, extracts and numbers the lines, renders
 * the frontmatter, and writes `<stem>.normalized.md` into the output
 * directory (default: the source file's own directory). Every path goes
 * through the shared traversal-guarded helpers. */
export async function normalizeTranscriptFile(
  input: TranscriptNormalizationInput & { transcriptId?: string },
): Promise<TranscriptNormalizationResult> {
  const projectRoot = resolveProjectRoot(process.cwd());
  const inputFilePath = resolveFromRoot(projectRoot, input.filePath);
  const outputDirectory = input.outputDirectory
    ? resolveWithinDirectory(projectRoot, resolveFromRoot(projectRoot, input.outputDirectory))
    : path.dirname(inputFilePath);

  const [content, stats] = await Promise.all([readFile(inputFilePath), stat(inputFilePath)]);
  // The meeting start defaults to the source file's creation time, falling
  // back to its modification time — some filesystems never report a birth
  // time and report the epoch instead.
  const startTimestamp = pickFileTimestamp(stats.birthtime) ?? pickFileTimestamp(stats.mtime);

  const normalized = normalizeTranscriptSource(path.basename(inputFilePath), content, {
    transcriptId: input.transcriptId,
    startTimestamp,
  });

  const stem = path.basename(inputFilePath, path.extname(inputFilePath));
  const normalizedFilePath = resolveWithinDirectory(
    projectRoot,
    path.join(outputDirectory, `${stem}${NORMALIZED_TRANSCRIPT_SUFFIX}`),
  );
  await writeFile(normalizedFilePath, normalized.markdown, 'utf8');

  return {
    normalizedFilePath,
    markdown: normalized.markdown,
    content: normalized.content,
    format: normalized.format,
    isValidTranscript: normalized.lineCount > 0,
    meetingId: normalized.metadata.meetingId,
    transcriptId: normalized.metadata.transcriptId,
    title: normalized.metadata.title,
    startTimestamp: normalized.metadata.startTimestamp,
    endTimestamp: normalized.metadata.endTimestamp,
    duration: normalized.metadata.duration,
    durationSeconds: normalized.durationSeconds,
    participantCount: normalized.metadata.participantCount,
    lineCount: normalized.lineCount,
  };
}

/** A file timestamp is usable when it exists and is not the epoch. */
function pickFileTimestamp(value: Date | undefined): Date | null {
  return value && value.getTime() > 0 ? value : null;
}

export const transcriptNormalizerTool = createTool({
  id: 'transcript-normalizer',
  title: 'Transcript normalizer',
  description:
    'Normalizes a raw meeting transcript (.vtt, .txt, .doc, or .docx) into a markdown file: YAML frontmatter (MeetingID from the VTT cue GUID, fresh TranscriptID, title, start/end timestamps, duration, participant count) over the numbered, timestamped citation target. Fully deterministic; writes <stem>.normalized.md beside the source unless given an output directory.',
  inputSchema: transcriptNormalizationInputSchema,
  outputSchema: transcriptNormalizationOutputSchema,
  execute: async ({ filePath, outputDirectory }) => normalizeTranscriptFile({ filePath, outputDirectory }),
});
