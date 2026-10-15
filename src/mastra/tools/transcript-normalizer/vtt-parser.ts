/**
 * Hand-rolled WebVTT parser: turns raw `.vtt` content into a flat list of
 * cues — one entry per cue, no new dependency.
 *
 * The parser is deterministic and pure: no filesystem, no network, no model.
 * Block structure (WEBVTT header, NOTE/STYLE/REGION blocks, cues) is walked
 * with a simple state machine over the file's lines; see `vtt-parser.test.ts`
 * for the pinned behaviors.
 */

/** One WebVTT cue, normalized: inline tags stripped, multi-line cue text
 * joined onto one line, speaker taken from a voice tag or a leading name
 * marker when present. Timestamps are milliseconds from the start of the
 * meeting. The optional cue identifier (the free-form line some exporters
 * place above the timing line — often a GUID) is kept verbatim so the
 * MeetingID can be read from it. */
export interface VttCue {
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
  identifier: string | null;
}

/** Parses raw WebVTT content into cues. Blocks without a timing line and
 * non-cue blocks (NOTE/STYLE/REGION) are skipped, inline tags are stripped,
 * and a cue whose text equals its immediate predecessor's (rolling captions)
 * is dropped. */
export function parseVtt(raw: string): VttCue[] {
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

  const cues: VttCue[] = [];
  let index = 0;

  // The WEBVTT header block runs from the first line to the first blank line.
  while (index < lines.length && lines[index].trim() !== '') {
    index += 1;
  }

  while (index < lines.length) {
    // Collect one block: consecutive non-blank lines.
    const blockLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== '') {
      blockLines.push(lines[index]);
      index += 1;
    }
    // Consume the blank separator.
    while (index < lines.length && lines[index].trim() === '') {
      index += 1;
    }

    const cue = parseCueBlock(blockLines);
    if (cue) {
      cues.push(cue);
    }
  }

  return cues.filter(
    (cue, position) =>
      position === 0 || cue.speaker !== cues[position - 1].speaker || cue.text !== cues[position - 1].text,
  );
}

const TIMESTAMP_PATTERN = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

/** Parses a WebVTT timestamp (`MM:SS.mmm` or `HH:MM:SS.mmm`) to milliseconds,
 * or null when the text is not a timestamp. */
export function parseVttTimestamp(text: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
}

function parseCueBlock(blockLines: string[]): VttCue | null {
  const timingIndex = blockLines.findIndex(line => line.includes('-->'));
  if (timingIndex === -1) {
    return null;
  }

  const [startText, endText] = blockLines[timingIndex].split('-->');
  const startMs = parseVttTimestamp(startText);
  const endMs = parseVttTimestamp((endText ?? '').trim().split(/\s+/)[0] ?? '');
  if (startMs === null || endMs === null) {
    return null;
  }

  // Lines before the timing line are cue identifiers; lines after it are the
  // cue text. Voice tags, inline markup, and name markers are resolved here so
  // every cue leaves the parser as one plain line with an optional speaker.
  const identifierLines = blockLines.slice(0, timingIndex).map(line => line.trim()).filter(line => line !== '');
  const identifier = identifierLines.length > 0 ? identifierLines.join(' ') : null;
  const { speaker, text } = renderCueText(blockLines.slice(timingIndex + 1));
  if (text === '') {
    return null;
  }

  return { startMs, endMs, speaker, text, identifier };
}

const VOICE_TAG_PATTERN = /<v(?:\.[^>\s]*)?\s+([^>]+?)\s*>/;
const NAME_MARKER_PATTERN = /^([A-Za-z][A-Za-z0-9 .,'’&/-]{0,38}):\s+/;
const TAG_PATTERN = /<[^>]+>/g;

/** Strips inline tags from a cue's text lines, resolves the speaker from the
 * first voice tag (falling back to a leading `Name:` marker), and joins the
 * lines onto one plain line. */
function renderCueText(textLines: string[]): { speaker: string | null; text: string } {
  let speaker: string | null = null;
  const strippedLines = textLines.map(line => {
    if (speaker === null) {
      const voiceMatch = VOICE_TAG_PATTERN.exec(line);
      if (voiceMatch) {
        speaker = voiceMatch[1].trim();
      }
    }
    return line.replace(TAG_PATTERN, '');
  });

  let text = strippedLines.join(' ').replace(/\s+/g, ' ').trim();
  if (speaker === null) {
    const markerMatch = NAME_MARKER_PATTERN.exec(text);
    if (markerMatch) {
      speaker = markerMatch[1].trim();
      text = text.slice(markerMatch[0].length).trim();
    }
  }

  return { speaker, text };
}
