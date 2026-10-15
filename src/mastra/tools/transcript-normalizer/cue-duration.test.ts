import { describe, expect, it } from 'bun:test';
import { durationFromCues } from './cue-duration';
import type { VttCue } from './vtt-parser';

function cue(startMs: number, endMs: number): VttCue {
  return { startMs, endMs, speaker: null, text: 'cue text', identifier: null };
}

describe('durationFromCues', () => {
  it('returns null when there are no cues', () => {
    expect(durationFromCues([])).toBe(null);
  });

  it('returns the last cue end in whole seconds', () => {
    expect(durationFromCues([cue(0, 1000), cue(1000, 65_000)])).toBe(65);
  });

  it('keeps sub-second precision from the final timestamp', () => {
    expect(durationFromCues([cue(0, 123_450)])).toBe(123.45);
  });

  it('uses the maximum end time even when cues are not sorted', () => {
    expect(durationFromCues([cue(50_000, 62_000), cue(0, 10_000)])).toBe(62);
  });
});
