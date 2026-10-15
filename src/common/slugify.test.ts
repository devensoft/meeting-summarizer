import { describe, expect, it } from 'bun:test';
import { slugify } from './slugify';

describe('slugify', () => {
  it('kebab-cases a value into a file-name slug', () => {
    expect(slugify('Launch Plan Review')).toBe('launch-plan-review');
    expect(slugify('  Mixed CASE value  ')).toBe('mixed-case-value');
    expect(slugify('Q3: Roadmap & Budget!!!')).toBe('q3-roadmap-budget');
  });

  it('collapses runs of non-alphanumeric characters to one dash', () => {
    expect(slugify('a -- b///c')).toBe('a-b-c');
  });

  it('returns an empty string when nothing usable remains and no fallback is given', () => {
    expect(slugify('???')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('substitutes the fallback when nothing usable remains', () => {
    expect(slugify('???', 'topic')).toBe('topic');
    expect(slugify('Q3 Meeting Overview', 'index')).toBe('q3-meeting-overview');
  });
});
