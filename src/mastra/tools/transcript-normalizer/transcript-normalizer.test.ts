import { describe, expect, it } from 'bun:test';
import { detectTranscriptFormat, normalizeTranscript } from './transcript-normalizer';

describe('detectTranscriptFormat', () => {
  it('detects VTT by file extension regardless of case', () => {
    expect(detectTranscriptFormat('recording.vtt', 'anything')).toBe('vtt');
    expect(detectTranscriptFormat('recording.VTT', 'anything')).toBe('vtt');
  });

  it('sniffs a WEBVTT header when the extension is not .vtt', () => {
    expect(detectTranscriptFormat('recording.txt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello\n')).toBe('vtt');
    expect(detectTranscriptFormat('recording.txt', '﻿WEBVTT\n')).toBe('vtt');
  });

  it('treats everything else as plain text', () => {
    expect(detectTranscriptFormat('standup-notes.txt', 'Just some notes.\n')).toBe('text');
    expect(detectTranscriptFormat('standup-notes.md', 'Just some notes mentioning WEBVTT casually.\n')).toBe('text');
  });
});

describe('normalizeTranscript', () => {
  it('renders one numbered line per VTT cue with speakers and duration', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:04.000',
      '<v Diego>First topic',
      '',
      '00:00:04.000 --> 00:00:06.500',
      'Ana: Second thought',
      '',
    ].join('\n');

    expect(normalizeTranscript(vtt, 'vtt')).toEqual({
      content: ['1 | Diego: First topic', '2 | Ana: Second thought'].join('\n'),
      lineCount: 2,
      durationSeconds: 6.5,
    });
  });

  it('passes plain text through verbatim, numbering only content lines', () => {
    const text = ['Standup notes', '', '  indented detail line', ''].join('\n');

    expect(normalizeTranscript(text, 'text')).toEqual({
      content: ['1 | Standup notes', '2 |   indented detail line'].join('\n'),
      lineCount: 2,
      durationSeconds: null,
    });
  });

  it('normalizes an empty transcript to zero lines and no duration', () => {
    expect(normalizeTranscript('', 'text')).toEqual({ content: '', lineCount: 0, durationSeconds: null });
    expect(normalizeTranscript('WEBVTT\n', 'vtt')).toEqual({ content: '', lineCount: 0, durationSeconds: null });
  });
});
