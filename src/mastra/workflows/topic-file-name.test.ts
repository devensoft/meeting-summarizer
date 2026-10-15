import { describe, expect, it } from 'bun:test';
import { resolveTopicFileName, slugifyTopicTitle } from './topic-file-name';

describe('slugifyTopicTitle', () => {
  it('kebab-cases a title', () => {
    expect(slugifyTopicTitle('Launch Plan Review')).toBe('launch-plan-review');
  });

  it('turns punctuation and runs of separators into single dashes', () => {
    expect(slugifyTopicTitle('Q3: Roadmap & Budget!!!')).toBe('q3-roadmap-budget');
  });

  it('falls back to "topic" when nothing alphanumeric remains', () => {
    expect(slugifyTopicTitle('???')).toBe('topic');
  });

  it('falls back to the caller-provided slug when nothing alphanumeric remains — the transcript index uses "index"', () => {
    expect(slugifyTopicTitle('???', 'index')).toBe('index');
  });

  it('keeps the caller-provided fallback only as a fallback, not for usable titles', () => {
    expect(slugifyTopicTitle('Q3 Meeting Overview', 'index')).toBe('q3-meeting-overview');
  });
});

describe('resolveTopicFileName', () => {
  it('uses the bare slug when no file name is taken', () => {
    expect(resolveTopicFileName('launch-plan', ['launch-plan-2.md'])).toBe('launch-plan.md');
  });

  it('suffixes -2 on a collision', () => {
    expect(resolveTopicFileName('launch-plan', ['launch-plan.md'])).toBe('launch-plan-2.md');
  });

  it('keeps suffixing until a free name is found', () => {
    expect(resolveTopicFileName('launch-plan', ['launch-plan.md', 'launch-plan-2.md'])).toBe('launch-plan-3.md');
  });

  it('treats taken names case-insensitively', () => {
    expect(resolveTopicFileName('launch-plan', ['LAUNCH-PLAN.MD'])).toBe('launch-plan-2.md');
  });
});
