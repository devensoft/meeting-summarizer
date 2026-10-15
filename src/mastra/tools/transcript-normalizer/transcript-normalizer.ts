import { durationFromCues } from './cue-duration';
import { LINE_NUMBER_SEPARATOR, VTT_FILE_EXTENSION, WEBVTT_HEADER_PREFIX } from './constants';
import { parseVtt } from './vtt-parser';

/**
 * Normalized transcript: the line-numbered plain-text rendering of an ingested
 * transcript and the citation target for every generated note (GLOSSARY.md).
 *
 * One line-numbering scheme covers both input formats: VTT renders one line
 * per cue (`Speaker: text` when a speaker is derivable); plain text passes
 * through verbatim, line for line. Every content line gets a stable `NN |`
 * prefix — the number a note cites as `(Lnn)`. Lines that are empty or
 * whitespace-only carry nothing citable and are dropped, for both formats.
 * The meeting's duration comes from VTT cue timestamps and is null for plain
 * text.
 */

export type TranscriptFormat = 'vtt' | 'text';

export interface NormalizedTranscript {
  /** The numbered lines, joined with newlines — written to the meeting
   * directory and rendered into every downstream prompt. */
  content: string;
  /** Number of numbered (citable) lines in `content`. */
  lineCount: number;
  /** Meeting duration in seconds from cue timestamps; null for plain text. */
  durationSeconds: number | null;
}

/** Detects the input format: `.vtt` extension first, a `WEBVTT` header sniff
 * as backstop, plain text otherwise. */
export function detectTranscriptFormat(fileName: string, content: string): TranscriptFormat {
  if (fileName.toLowerCase().endsWith(VTT_FILE_EXTENSION)) {
    return 'vtt';
  }
  if (content.replace(/^\uFEFF/, '').trimStart().startsWith(WEBVTT_HEADER_PREFIX)) {
    return 'vtt';
  }
  return 'text';
}

/** Normalizes raw transcript content into the numbered citation target. */
export function normalizeTranscript(raw: string, format: TranscriptFormat): NormalizedTranscript {
  if (format === 'vtt') {
    const cues = parseVtt(raw);
    const lines = cues.map(cue => (cue.speaker === null ? cue.text : `${cue.speaker}: ${cue.text}`));
    return { content: numberLines(lines), lineCount: lines.length, durationSeconds: durationFromCues(cues) };
  }

  const lines = raw.split(/\r?\n/).filter(line => line.trim() !== '');
  return { content: numberLines(lines), lineCount: lines.length, durationSeconds: null };
}

/** Applies the stable `NN |` prefixes — the one line-numbering scheme shared
 * by both input formats. */
function numberLines(lines: string[]): string {
  return lines.map((line, index) => `${index + 1}${LINE_NUMBER_SEPARATOR}${line}`).join('\n');
}
