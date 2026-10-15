import { describe, expect, it } from 'bun:test';
import { dedupeByTrimmedLowerCaseKey } from './dedupe';

describe('dedupeByTrimmedLowerCaseKey', () => {
  it('keeps the first entry per case-insensitive key, in input order', () => {
    const entries = [{ id: 1, label: 'Rollout' }, { id: 2, label: 'rollout' }, { id: 3, label: '  ROLLOUT  ' }, { id: 4, label: 'Budget' }];

    expect(dedupeByTrimmedLowerCaseKey(entries, (entry) => entry.label)).toEqual([
      { id: 1, label: 'Rollout' },
      { id: 4, label: 'Budget' },
    ]);
  });

  it('drops entries whose key trims to nothing', () => {
    const entries = [{ id: 1, label: '   ' }, { id: 2, label: 'Budget' }, { id: 3, label: '' }];

    expect(dedupeByTrimmedLowerCaseKey(entries, (entry) => entry.label)).toEqual([{ id: 2, label: 'Budget' }]);
  });

  it('compares the keyOf output, not the entry itself', () => {
    const entries = [{ id: 1, label: 'Rollout plan' }, { id: 2, label: 'Rollout  plan ' }];

    expect(dedupeByTrimmedLowerCaseKey(entries, (entry) => entry.label.replace(/\s+/g, ' '))).toEqual([
      { id: 1, label: 'Rollout plan' },
    ]);
  });

  it('returns an empty list for an empty input', () => {
    expect(dedupeByTrimmedLowerCaseKey([], (entry: { label: string }) => entry.label)).toEqual([]);
  });
});
