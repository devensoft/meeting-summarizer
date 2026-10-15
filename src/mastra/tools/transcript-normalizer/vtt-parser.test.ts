import { describe, expect, it } from 'bun:test';
import { parseVtt, parseVttTimestamp } from './vtt-parser';

describe('parseVtt', () => {
  it('parses a minimal cue after the WEBVTT header', () => {
    const vtt = ['WEBVTT', '', '00:00:01.000 --> 00:00:04.000', 'Hello world', ''].join('\n');

    expect(parseVtt(vtt)).toEqual([{ startMs: 1000, endMs: 4000, speaker: null, text: 'Hello world', identifier: null }]);
  });

  it('takes the speaker from a voice tag and strips inline tags', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:04.000',
      '<v Diego>Hello <i>world</i>, this is <b>important</b></v>',
      '',
    ].join('\n');

    expect(parseVtt(vtt)).toEqual([
      { startMs: 1000, endMs: 4000, speaker: 'Diego', text: 'Hello world, this is important', identifier: null },
    ]);
  });

  it('takes the speaker from a leading name marker when there is no voice tag', () => {
    const vtt = ['WEBVTT', '', '00:00:10.000 --> 00:00:12.000', 'Diego: I will take that action item.', ''].join(
      '\n',
    );

    expect(parseVtt(vtt)).toEqual([
      { startMs: 10000, endMs: 12000, speaker: 'Diego', text: 'I will take that action item.', identifier: null },
    ]);
  });

  it('keeps a timestamp-like text line from being mistaken for a name marker', () => {
    const vtt = ['WEBVTT', '', '00:01:00.000 --> 00:01:02.000', '00:30 is the deadline.', ''].join('\n');

    expect(parseVtt(vtt)).toEqual([
      { startMs: 60000, endMs: 62000, speaker: null, text: '00:30 is the deadline.', identifier: null },
    ]);
  });

  it('skips NOTE and STYLE blocks', () => {
    const vtt = [
      'WEBVTT',
      '',
      'NOTE this meeting was recorded on a laptop microphone',
      'and the note spans several lines',
      '',
      'STYLE',
      '::cue {',
      '  color: red;',
      '}',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'Only real cues remain.',
      '',
    ].join('\n');

    expect(parseVtt(vtt)).toEqual([
      { startMs: 1000, endMs: 2000, speaker: null, text: 'Only real cues remain.', identifier: null },
    ]);
  });

  it('keeps the cue identifier and joins multi-line cue text onto one line', () => {
    const vtt = [
      'WEBVTT',
      '',
      'intro-cue-1',
      '00:00:01.000 --> 00:00:04.000',
      'First line of the cue',
      'second line of the same cue',
      '',
    ].join('\n');

    expect(parseVtt(vtt)).toEqual([
      {
        startMs: 1000,
        endMs: 4000,
        speaker: null,
        text: 'First line of the cue second line of the same cue',
        identifier: 'intro-cue-1',
      },
    ]);
  });

  it('keeps a GUID-shaped cue identifier as some exporters stamp it', () => {
    const vtt = [
      'WEBVTT',
      '',
      '6a2f0c1e-93d4-4b7a-9f21-8c5d3e7a1b40',
      '00:00:01.000 --> 00:00:04.000',
      '<v Diego>Identified cue',
      '',
    ].join('\n');

    expect(parseVtt(vtt)).toEqual([
      {
        startMs: 1000,
        endMs: 4000,
        speaker: 'Diego',
        text: 'Identified cue',
        identifier: '6a2f0c1e-93d4-4b7a-9f21-8c5d3e7a1b40',
      },
    ]);
  });

  it('drops consecutive duplicate cues but keeps repeats after an intervening cue', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      '<v Diego>Rolling caption text',
      '',
      '00:00:02.000 --> 00:00:03.000',
      '<v Diego>Rolling caption text',
      '',
      '00:00:03.000 --> 00:00:04.000',
      '<v Ana>Interrupting with a different line',
      '',
      '00:00:04.000 --> 00:00:05.000',
      '<v Diego>Rolling caption text',
      '',
    ].join('\n');

    expect(parseVtt(vtt)).toEqual([
      { startMs: 1000, endMs: 2000, speaker: 'Diego', text: 'Rolling caption text', identifier: null },
      { startMs: 3000, endMs: 4000, speaker: 'Ana', text: 'Interrupting with a different line', identifier: null },
      { startMs: 4000, endMs: 5000, speaker: 'Diego', text: 'Rolling caption text', identifier: null },
    ]);
  });

  it('skips malformed blocks without a timing line and cues with no text', () => {
    const vtt = [
      'WEBVTT',
      '',
      'just some stray text',
      '',
      '00:00:01.000 --> 00:00:02.000',
      '<v Ana></v>',
      '',
      '00:00:02.000 --> 00:00:03.000',
      'Real content survives.',
      '',
    ].join('\n');

    expect(parseVtt(vtt)).toEqual([
      { startMs: 2000, endMs: 3000, speaker: null, text: 'Real content survives.', identifier: null },
    ]);
  });

  it('accepts minute-based timestamps without an hour component', () => {
    const vtt = ['WEBVTT', '', '02:03.500 --> 02:05.000', 'Short form timestamps.', ''].join('\n');

    expect(parseVtt(vtt)).toEqual([
      { startMs: 123500, endMs: 125000, speaker: null, text: 'Short form timestamps.', identifier: null },
    ]);
  });

  it('returns no cues for an empty or header-only file', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT\n')).toEqual([]);
  });
});

describe('parseVttTimestamp', () => {
  it('parses hour, minute, and millisecond forms', () => {
    expect(parseVttTimestamp('00:00:01.000')).toBe(1000);
    expect(parseVttTimestamp('01:02:03.456')).toBe(3_723_456);
    expect(parseVttTimestamp('02:03.5')).toBe(123_500);
    expect(parseVttTimestamp('00:00:04,250')).toBe(4250);
  });

  it('rejects non-timestamps', () => {
    expect(parseVttTimestamp('hello')).toBe(null);
    expect(parseVttTimestamp('')).toBe(null);
    expect(parseVttTimestamp('1:2:3:4')).toBe(null);
  });
});
