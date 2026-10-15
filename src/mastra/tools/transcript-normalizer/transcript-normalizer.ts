import { randomUUID } from 'node:crypto';
import { durationFromCues } from './cue-duration';
import {
  DOCX_FILE_EXTENSION,
  DOC_FILE_EXTENSION,
  GUID_PATTERN,
  LINE_NUMBER_SEPARATOR,
  VTT_FILE_EXTENSION,
  WEBVTT_HEADER_PREFIX,
  ZIP_LOCAL_HEADER_MAGIC,
  OLE_FILE_MAGIC,
} from './constants';
import { extractDocumentText } from './doc-extract';
import { parseVtt, type VttCue } from './vtt-parser';

/**
 * Normalized transcript: the markdown rendering of an ingested transcript and
 * the citation target for every generated note (GLOSSARY.md).
 *
 * The document is YAML frontmatter (MeetingID, TranscriptID, title, start and
 * end timestamps, duration, participant count) over a numbered body — one
 * line per VTT cue with its relative timestamp kept (`12 | [00:04:31] Alice:
 * text`), verbatim numbered lines for text extractions. One line-numbering
 * scheme covers every input format, and every content line gets a stable
 * `NN |` prefix — the number a note cites as `(Lnn)`. Lines that are empty or
 * whitespace-only carry nothing citable and are dropped.
 *
 * Everything here is deterministic and pure: no filesystem, no network, no
 * model. The only non-deterministic value in a normalized document is the
 * TranscriptID, which is generated fresh per ingest by contract.
 */

export type TranscriptFormat = 'vtt' | 'text' | 'docx' | 'doc';

export interface NormalizedTranscript {
  /** The numbered body lines, joined with newlines — the citation target
   * every downstream prompt reads (rendered under the frontmatter). */
  content: string;
  /** Number of numbered (citable) lines in `content`. */
  lineCount: number;
  /** Meeting duration in seconds from VTT cue timestamps; null for every
   * other input format. */
  durationSeconds: number | null;
  /** Distinct speakers derivable from VTT cues; null when speakers cannot
   * be known (plain text, Word documents). */
  participantCount: number | null;
  /** The GUID every cue of the meeting carries as its identifier, when the
   * VTT input has one and it is consistent; null otherwise. */
  meetingId: string | null;
}

/** The frontmatter header of the normalized markdown transcript. */
export interface TranscriptFrontmatter {
  meetingId: string | null;
  transcriptId: string;
  title: string;
  /** ISO 8601. Start defaults to the source file's creation time, supplied
   * by the file layer; null when the layer has no usable timestamp. */
  startTimestamp: string | null;
  /** Start plus the parsed duration; null when either is unknown. */
  endTimestamp: string | null;
  /** Human duration in minutes or hours, e.g. `45m` or `1h 23m`. */
  duration: string | null;
  participantCount: number | null;
}

export interface NormalizedTranscriptFile {
  format: TranscriptFormat;
  /** The full markdown document: frontmatter + numbered body. */
  markdown: string;
  /** The numbered body lines only — what downstream prompts read. */
  content: string;
  lineCount: number;
  durationSeconds: number | null;
  metadata: TranscriptFrontmatter;
}

export interface NormalizeTranscriptOptions {
  /** The per-ingest transcript identifier. Defaults to a fresh random GUID —
   * the same file re-ingested gets a new one by design. */
  transcriptId?: string;
  /** The meeting start, defaulted by the file layer to the source file's
   * creation time. Null when no usable file timestamp exists. */
  startTimestamp?: Date | null;
}

/** Detects the input format: `.vtt` extension first, a `WEBVTT` header sniff
 * as backstop; then Word documents by extension or magic bytes; plain text
 * otherwise. */
export function detectTranscriptFormat(fileName: string, content: Buffer): TranscriptFormat {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(VTT_FILE_EXTENSION)) {
    return 'vtt';
  }
  const head = content.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith(WEBVTT_HEADER_PREFIX)) {
    return 'vtt';
  }
  const magic = content.subarray(0, 4).toString('latin1');
  if (lowerName.endsWith(DOCX_FILE_EXTENSION) || magic === ZIP_LOCAL_HEADER_MAGIC) {
    return 'docx';
  }
  if (lowerName.endsWith(DOC_FILE_EXTENSION) || magic === OLE_FILE_MAGIC) {
    return 'doc';
  }
  return 'text';
}

/** Normalizes raw transcript content into the markdown document: frontmatter
 * metadata over the numbered citation target. */
export function normalizeTranscriptSource(
  fileName: string,
  content: Buffer,
  options: NormalizeTranscriptOptions = {},
): NormalizedTranscriptFile {
  const format = detectTranscriptFormat(fileName, content);
  const normalized =
    format === 'vtt'
      ? normalizeVttTranscript(content.toString('utf8'))
      : format === 'text'
        ? normalizeTextTranscript(content.toString('utf8'))
        : normalizeTextTranscript(extractDocumentText(fileName, content));

  const start = options.startTimestamp ?? null;
  const metadata: TranscriptFrontmatter = {
    meetingId: normalized.meetingId,
    transcriptId: options.transcriptId ?? randomUUID(),
    title: titleFromFileName(fileName),
    startTimestamp: start === null ? null : start.toISOString(),
    endTimestamp:
      start === null || normalized.durationSeconds === null
        ? null
        : new Date(start.getTime() + normalized.durationSeconds * 1000).toISOString(),
    duration: formatDuration(normalized.durationSeconds),
    participantCount: normalized.participantCount,
  };

  return {
    format,
    markdown: renderTranscriptMarkdown(normalized, metadata),
    content: normalized.content,
    lineCount: normalized.lineCount,
    durationSeconds: normalized.durationSeconds,
    metadata,
  };
}

/** Normalizes WebVTT content: one numbered line per cue, the cue's relative
 * timestamp kept as a `[HH:MM:SS]` prefix, duration and participants from
 * the cues, MeetingID from the cue identifiers. */
export function normalizeVttTranscript(raw: string): NormalizedTranscript {
  const cues = parseVtt(raw);
  const lines = cues.map(cue => `[${formatClock(cue.startMs)}] ${renderCueLine(cue)}`);
  return {
    content: numberLines(lines),
    lineCount: lines.length,
    durationSeconds: durationFromCues(cues),
    participantCount: participantCountFromCues(cues),
    meetingId: meetingIdFromCues(cues),
  };
}

/** Normalizes plain text (or a Word document's extracted text): verbatim
 * numbered lines, no timestamps, duration, participants, or MeetingID — the
 * input carries none of them. */
export function normalizeTextTranscript(raw: string): NormalizedTranscript {
  const lines = raw.split(/\r?\n/).filter(line => line.trim() !== '');
  return { content: numberLines(lines), lineCount: lines.length, durationSeconds: null, participantCount: null, meetingId: null };
}

/** Applies the stable `NN |` prefixes — the one line-numbering scheme shared
 * by every input format. */
function numberLines(lines: string[]): string {
  return lines.map((line, index) => `${index + 1}${LINE_NUMBER_SEPARATOR}${line}`).join('\n');
}

/** `Speaker: text` when a speaker is derivable, plain text otherwise — the
 * part of a cue line that follows its timestamp prefix. */
function renderCueLine(cue: VttCue): string {
  return cue.speaker === null ? cue.text : `${cue.speaker}: ${cue.text}`;
}

/** Formats milliseconds from the meeting start as a bare `HH:MM:SS` clock. */
function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/** Distinct non-null speakers across the cues. */
function participantCountFromCues(cues: VttCue[]): number {
  return new Set(cues.map(cue => cue.speaker).filter(speaker => speaker !== null)).size;
}

/** The MeetingID a VTT file carries: some exporters stamp every cue with the
 * meeting's GUID as (the prefix of) the cue identifier — commonly suffixed
 * with a `/counter`. The rule is deterministic — the GUID-shaped segment
 * before the first `/` must be the same on every identifier that has one,
 * and that value (lowercased) is the MeetingID; any mix, or no GUIDs at all,
 * is null. */
export function meetingIdFromCues(cues: VttCue[]): string | null {
  const guids = cues
    .map(cue => cue.identifier?.trim().split('/', 1)[0]?.toLowerCase() ?? null)
    .filter((identifier): identifier is string => identifier !== null && GUID_PATTERN.test(identifier));
  if (guids.length === 0) {
    return null;
  }
  const [first] = guids;
  return guids.every(guid => guid === first) ? first : null;
}

/** Duration in minutes, or hours and minutes once an hour is reached:
 * `45m`, `1h 0m`, `2h 5m`. Null when the input carries no duration. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** The frontmatter title: the source file's name without extension, so an
 * untitled upload stays traceable to its original file. */
function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').trim();
  return stem === '' ? 'Transcript' : stem;
}

/** Renders the markdown document: YAML frontmatter, then the `#` title, then
 * the numbered body. Scalars are JSON-encoded — valid YAML double-quoted
 * style for strings, bare for numbers, `null` for nulls.
 *
 * Layout contract: exactly one blank line after the frontmatter, and one
 * blank line around every body entry — markdown folds consecutive lines into
 * a single paragraph, so the blank lines are what keep each entry its own. */
export function renderTranscriptMarkdown(normalized: NormalizedTranscript, metadata: TranscriptFrontmatter): string {
  const field = (name: string, value: string | number | null) => `${name}: ${value === null ? 'null' : JSON.stringify(value)}`;
  // Frontmatter property order is part of the contract: TranscriptID first —
  // it is the one identifier every document carries; MeetingID may be null.
  const lines = [
    '---',
    field('transcriptId', metadata.transcriptId),
    field('meetingId', metadata.meetingId),
    field('title', metadata.title),
    field('startTimestamp', metadata.startTimestamp),
    field('endTimestamp', metadata.endTimestamp),
    field('duration', metadata.duration),
    field('participantCount', metadata.participantCount),
    '---',
    '',
    `# ${metadata.title}`,
  ];
  if (normalized.content !== '') {
    lines.push('', normalized.content.split('\n').join('\n\n'));
  }
  return `${lines.join('\n')}\n`;
}
