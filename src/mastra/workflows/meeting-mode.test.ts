import { describe, expect, it } from 'bun:test';
import {
  meetingFormatSchema,
  meetingModeGuidance,
  meetingModeSchema,
  meetingModeScoresSchema,
  resolveMeetingMode,
  type MeetingMode,
} from './meeting-mode';

describe('meetingFormatSchema', () => {
  it('accepts every listed format', () => {
    const formats = ['standup', 'planning', 'retrospective', 'one-on-one', 'brainstorm', 'workshop', 'other'] as const;
    for (const format of formats) {
      expect(meetingFormatSchema.parse(format)).toBe(format);
    }
  });

  it('rejects a free-text label — the closed list is the point', () => {
    expect(meetingFormatSchema.safeParse('greenfield product design and planning sync').success).toBe(false);
  });
});

describe('meetingModeScoresSchema', () => {
  it('rejects an out-of-range score instead of clamping it', () => {
    expect(meetingModeScoresSchema.safeParse({ status: 0.2, discussion: 1.5, learning: 0.3 }).success).toBe(false);
  });

  it('rejects a partial score card — all three modes are required', () => {
    expect(meetingModeScoresSchema.safeParse({ status: 0.5, discussion: 0.5 }).success).toBe(false);
  });
});

describe('resolveMeetingMode', () => {
  it('picks the highest-scoring mode', () => {
    expect(resolveMeetingMode({ status: 0.2, discussion: 0.7, learning: 0.1 })).toBe('discussion');
    expect(resolveMeetingMode({ status: 0.1, discussion: 0.2, learning: 0.9 })).toBe('learning');
    expect(resolveMeetingMode({ status: 0.8, discussion: 0.1, learning: 0.1 })).toBe('status');
  });

  it('breaks ties toward the earlier mode in the fixed order', () => {
    expect(resolveMeetingMode({ status: 0.5, discussion: 0.5, learning: 0.5 })).toBe('status');
    expect(resolveMeetingMode({ status: 0.2, discussion: 0.4, learning: 0.4 })).toBe('discussion');
  });

  it('keeps status as the default on an all-zero score card', () => {
    expect(resolveMeetingMode({ status: 0, discussion: 0, learning: 0 })).toBe('status');
  });
});

describe('meetingModeGuidance', () => {
  it('gives every mode its own non-empty emphasis guidance', () => {
    const modes: MeetingMode[] = ['status', 'discussion', 'learning'];
    const guidance = modes.map((mode) => meetingModeGuidance(mode));

    for (const text of guidance) {
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(guidance).size).toBe(modes.length);
  });

  it('answers with the mode asked for, not another mode', () => {
    expect(meetingModeGuidance(meetingModeSchema.parse('learning'))).toContain('teaching');
    expect(meetingModeGuidance(meetingModeSchema.parse('discussion'))).toContain('open-ended');
    expect(meetingModeGuidance(meetingModeSchema.parse('status'))).toContain('status');
  });
});
