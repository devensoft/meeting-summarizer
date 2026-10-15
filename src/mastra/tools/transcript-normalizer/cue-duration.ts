import type { VttCue } from './vtt-parser';

/**
 * Meeting duration computed from parsed VTT cues. Duration is derived once,
 * here, and then recorded on the run as data — downstream steps never
 * recompute it from transcript text.
 */

/** Returns the meeting's duration in seconds — the latest cue end — or null
 * when the transcript carries no timed cues (plain-text input). */
export function durationFromCues(cues: VttCue[]): number | null {
  if (cues.length === 0) {
    return null;
  }
  return Math.max(...cues.map(cue => cue.endMs)) / 1000;
}
