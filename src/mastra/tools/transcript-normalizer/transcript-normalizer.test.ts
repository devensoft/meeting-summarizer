import { describe, expect, it } from 'bun:test';
import {
  detectTranscriptFormat,
  formatDuration,
  meetingIdFromCues,
  normalizeTextTranscript,
  normalizeTranscriptSource,
  normalizeVttTranscript,
  renderTranscriptMarkdown,
} from './transcript-normalizer';
import type { VttCue } from './vtt-parser';

const MEETING_GUID = '6a2f0c1e-93d4-4b7a-9f21-8c5d3e7a1b40';

describe('detectTranscriptFormat', () => {
  it('detects VTT by file extension regardless of case', () => {
    expect(detectTranscriptFormat('recording.vtt', Buffer.from('anything'))).toBe('vtt');
    expect(detectTranscriptFormat('recording.VTT', Buffer.from('anything'))).toBe('vtt');
  });

  it('sniffs a WEBVTT header when the extension is not .vtt', () => {
    expect(detectTranscriptFormat('recording.txt', Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n'))).toBe('vtt');
    expect(detectTranscriptFormat('recording.txt', Buffer.from('﻿WEBVTT\n'))).toBe('vtt');
  });

  it('detects Word documents by extension and by magic bytes', () => {
    expect(detectTranscriptFormat('notes.docx', Buffer.from('irrelevant'))).toBe('docx');
    expect(detectTranscriptFormat('notes.bin', Buffer.from('PK\x03\x04-followed-by-zip-bytes'))).toBe('docx');
    expect(detectTranscriptFormat('notes.doc', Buffer.from('irrelevant'))).toBe('doc');
    expect(detectTranscriptFormat('notes.bin', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x01]))).toBe('doc');
  });

  it('treats everything else as plain text', () => {
    expect(detectTranscriptFormat('standup-notes.txt', Buffer.from('Just some notes.\n'))).toBe('text');
    expect(detectTranscriptFormat('standup-notes.md', Buffer.from('Just some notes mentioning WEBVTT casually.\n'))).toBe('text');
  });
});

describe('normalizeVttTranscript', () => {
  it('renders one numbered line per cue, keeping the cue relative timestamp', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:04.000',
      '<v Diego>First topic',
      '',
      '00:01:04.500 --> 00:01:06.500',
      'Ana: Second thought',
      '',
    ].join('\n');

    expect(normalizeVttTranscript(vtt)).toMatchObject({
      content: ['1 | [00:00:01] Diego: First topic', '2 | [00:01:04] Ana: Second thought'].join('\n'),
      lineCount: 2,
      durationSeconds: 66.5,
      participantCount: 2,
    });
  });

  it('renders cues without a derivable speaker with the bare timestamp', () => {
    const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Nobody tagged here', ''].join('\n');

    expect(normalizeVttTranscript(vtt).content).toBe('1 | [00:00:01] Nobody tagged here');
  });

  it('keeps zero-padded clock fields and hour rollover', () => {
    const vtt = ['WEBVTT', '', '01:02:03.000 --> 01:02:04.000', 'Deep into the meeting', ''].join('\n');

    expect(normalizeVttTranscript(vtt).content).toBe('1 | [01:02:03] Deep into the meeting');
  });

  it('reads the MeetingID from consistent GUID cue identifiers', () => {
    const vtt = [
      'WEBVTT',
      '',
      MEETING_GUID.toUpperCase(),
      '00:00:01.000 --> 00:00:02.000',
      '<v Diego>First',
      '',
      MEETING_GUID,
      '00:00:02.000 --> 00:00:03.000',
      '<v Ana>Second',
      '',
    ].join('\n');

    // Case differences between cues are cosmetic — GUIDs are case-insensitive,
    // and the MeetingID normalizes to lowercase.
    expect(normalizeVttTranscript(vtt).meetingId).toBe(MEETING_GUID);
  });

  it('reads the MeetingID from the GUID prefix of counter-suffixed identifiers', () => {
    // Real exporter form (Teams-style): the cue identifier is the meeting
    // GUID followed by a /segment-counter suffix, and the suffix differs per
    // cue while the GUID prefix stays constant.
    const vtt = [
      'WEBVTT',
      '',
      '3138bff6-406b-46c0-9bed-94c805d19eca/12-0',
      '00:00:03.988 --> 00:00:04.868',
      '<v Taras Nishchyk>I already started.</v>',
      '',
      '3138bff6-406b-46c0-9bed-94c805d19eca/46-1',
      '00:00:05.268 --> 00:00:08.907',
      '<v Diego Bustamante>Okay, let us use it</v>',
      '',
    ].join('\n');

    expect(normalizeVttTranscript(vtt).meetingId).toBe('3138bff6-406b-46c0-9bed-94c805d19eca');
  });

  it('is null when the cue identifiers are GUID-shaped but inconsistent', () => {
    const otherGuid = '11111111-2222-4333-8444-555555555555';
    const vtt = [
      'WEBVTT',
      '',
      MEETING_GUID,
      '00:00:01.000 --> 00:00:02.000',
      '<v Diego>First',
      '',
      otherGuid,
      '00:00:02.000 --> 00:00:03.000',
      '<v Ana>Second',
      '',
    ].join('\n');

    expect(normalizeVttTranscript(vtt).meetingId).toBeNull();
  });

  it('is null when no cue carries a GUID identifier', () => {
    const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Unidentified cue', ''].join('\n');

    expect(normalizeVttTranscript(vtt).meetingId).toBeNull();
  });

  it('counts distinct participants across many cues', () => {
    const cue = (start: number, line: string) => `00:00:0${start}.000 --> 00:00:0${start + 1}.000\n${line}`;
    const vtt = ['WEBVTT', '', cue(1, '<v Diego>one'), '', cue(2, '<v Ana>two'), '', cue(3, '<v Diego>three'), ''].join(
      '\n',
    );

    expect(normalizeVttTranscript(vtt).participantCount).toBe(2);
  });
});

describe('normalizeTextTranscript', () => {
  it('passes plain text through verbatim, numbering only content lines', () => {
    const text = ['Standup notes', '', '  indented detail line', ''].join('\n');

    expect(normalizeTextTranscript(text)).toEqual({
      content: ['1 | Standup notes', '2 |   indented detail line'].join('\n'),
      lineCount: 2,
      durationSeconds: null,
      participantCount: null,
      meetingId: null,
    });
  });

  it('normalizes an empty transcript to zero lines and nothing derived', () => {
    expect(normalizeTextTranscript('')).toEqual({
      content: '',
      lineCount: 0,
      durationSeconds: null,
      participantCount: null,
      meetingId: null,
    });
    expect(normalizeVttTranscript('WEBVTT\n').content).toBe('');
  });
});

describe('normalizeTranscriptSource', () => {
  const VTT = [
    'WEBVTT',
    '',
    MEETING_GUID,
    '00:00:01.000 --> 00:01:04.000',
    '<v Diego>The whole meeting, briefly',
    '',
  ].join('\n');
  const START = new Date('2026-10-15T09:30:00.000Z');

  it('renders frontmatter over the titled body with start defaulted and end derived', () => {
    const result = normalizeTranscriptSource('design-sync.vtt', Buffer.from(VTT), {
      transcriptId: '33333333-3333-4333-8333-333333333333',
      startTimestamp: START,
    });

    expect(result.format).toBe('vtt');
    expect(result.content).toBe('1 | [00:00:01] Diego: The whole meeting, briefly');
    // TranscriptID leads the frontmatter; one blank line after the frontmatter;
    // the body sits under a `#` heading built from the title.
    expect(result.markdown).toBe(
      [
        '---',
        'transcriptId: "33333333-3333-4333-8333-333333333333"',
        `meetingId: "${MEETING_GUID}"`,
        'title: "design-sync"',
        'startTimestamp: "2026-10-15T09:30:00.000Z"',
        'endTimestamp: "2026-10-15T09:31:04.000Z"',
        'duration: "1m"',
        'participantCount: 1',
        '---',
        '',
        '# design-sync',
        '',
        '1 | [00:00:01] Diego: The whole meeting, briefly',
      ].join('\n') + '\n',
    );
  });

  it('separates every body entry with a blank line so markdown renders one entry per paragraph', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      '<v Diego>First entry',
      '',
      '00:00:02.000 --> 00:00:03.000',
      '<v Ana>Second entry',
      '',
      '00:00:03.000 --> 00:00:04.000',
      '<v Roman>Third entry',
      '',
    ].join('\n');
    const result = normalizeTranscriptSource('design-sync.vtt', Buffer.from(vtt), {
      transcriptId: '33333333-3333-4333-8333-333333333333',
      startTimestamp: START,
    });

    expect(result.markdown).toBe(
      [
        '---',
        'transcriptId: "33333333-3333-4333-8333-333333333333"',
        'meetingId: null',
        'title: "design-sync"',
        'startTimestamp: "2026-10-15T09:30:00.000Z"',
        'endTimestamp: "2026-10-15T09:30:04.000Z"',
        'duration: "0m"',
        'participantCount: 3',
        '---',
        '',
        '# design-sync',
        '',
        '1 | [00:00:01] Diego: First entry',
        '',
        '2 | [00:00:02] Ana: Second entry',
        '',
        '3 | [00:00:03] Roman: Third entry',
      ].join('\n') + '\n',
    );
  });

  it('leaves end and duration null when the start is unknown but keeps the body', () => {
    const result = normalizeTranscriptSource('design-sync.vtt', Buffer.from(VTT), {
      transcriptId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result.metadata.startTimestamp).toBeNull();
    expect(result.metadata.endTimestamp).toBeNull();
    expect(result.metadata.duration).toBe('1m');
    expect(result.markdown).toContain('startTimestamp: null');
  });

  it('generates a fresh random TranscriptID when none is injected', () => {
    const [first, second] = [
      normalizeTranscriptSource('a.txt', Buffer.from('hello')),
      normalizeTranscriptSource('a.txt', Buffer.from('hello')),
    ];

    expect(first.metadata.transcriptId).not.toBe(second.metadata.transcriptId);
    expect(first.metadata.transcriptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('renders text input with nulls for everything the format cannot know', () => {
    const result = normalizeTranscriptSource('standup-notes.txt', Buffer.from('One line.\n'), {
      transcriptId: '33333333-3333-4333-8333-333333333333',
      startTimestamp: START,
    });

    expect(result.metadata).toEqual({
      meetingId: null,
      transcriptId: '33333333-3333-4333-8333-333333333333',
      title: 'standup-notes',
      startTimestamp: '2026-10-15T09:30:00.000Z',
      endTimestamp: null,
      duration: null,
      participantCount: null,
    });
    expect(result.markdown).toContain('1 | One line.');
  });

  it('renders an empty transcript as frontmatter and title over nothing', () => {
    const result = normalizeTranscriptSource('empty.txt', Buffer.from(''), {
      transcriptId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result.lineCount).toBe(0);
    expect(result.markdown).toBe(
      [
        '---',
        'transcriptId: "33333333-3333-4333-8333-333333333333"',
        'meetingId: null',
        'title: "empty"',
        'startTimestamp: null',
        'endTimestamp: null',
        'duration: null',
        'participantCount: null',
        '---',
        '',
        '# empty',
      ].join('\n') + '\n',
    );
  });
});

describe('meetingIdFromCues', () => {
  it('requires at least one GUID identifier', () => {
    expect(meetingIdFromCues([])).toBeNull();
  });

  it('takes the GUID segment before the first slash of an identifier', () => {
    const cues: VttCue[] = [
      { startMs: 0, endMs: 1, speaker: null, text: 'a', identifier: '3138bff6-406b-46c0-9bed-94c805d19eca/12-0' },
      { startMs: 1, endMs: 2, speaker: null, text: 'b', identifier: '3138bff6-406b-46c0-9bed-94c805d19eca/46-1' },
    ];

    expect(meetingIdFromCues(cues)).toBe('3138bff6-406b-46c0-9bed-94c805d19eca');
  });
});

describe('formatDuration', () => {
  it('renders minutes below an hour and hours plus minutes above it', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(59 * 60)).toBe('59m');
    expect(formatDuration(60 * 60)).toBe('1h 0m');
    expect(formatDuration(83 * 60 + 30)).toBe('1h 24m');
  });
});

describe('renderTranscriptMarkdown', () => {
  it('JSON-escapes titles so quotes and backslashes stay valid YAML', () => {
    const result = renderTranscriptMarkdown(
      { content: '1 | line', lineCount: 1, durationSeconds: null, participantCount: null, meetingId: null },
      {
        meetingId: null,
        transcriptId: '33333333-3333-4333-8333-333333333333',
        title: 'the "quoted" \\ meeting',
        startTimestamp: null,
        endTimestamp: null,
        duration: null,
        participantCount: null,
      },
    );

    expect(result).toContain('title: "the \\"quoted\\" \\\\ meeting"');
  });
});
