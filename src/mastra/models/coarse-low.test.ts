import { describe, expect, it } from 'bun:test';
import { isCoarseLowEnabled, perTopicReasoning, type PerTopicCall } from './coarse-low';

const low = { providerOptions: { openaiCompatible: { reasoningEffort: 'low' as const } } };
const others: PerTopicCall[] = ['consolidate', 'extract', 'enrich', 'distill', 'propose'];

describe('isCoarseLowEnabled', () => {
  it('is off by default and for other values', () => {
    expect(isCoarseLowEnabled({})).toBe(false);
    expect(isCoarseLowEnabled({ EXPERIMENT_COARSE_LOW: '0' })).toBe(false);
    expect(isCoarseLowEnabled({ EXPERIMENT_COARSE_LOW: '' })).toBe(false);
  });

  it('is on for 1 or true', () => {
    expect(isCoarseLowEnabled({ EXPERIMENT_COARSE_LOW: '1' })).toBe(true);
    expect(isCoarseLowEnabled({ EXPERIMENT_COARSE_LOW: ' TRUE ' })).toBe(true);
  });
});

describe('perTopicReasoning', () => {
  it('flag off: only compose is low, the rest add no providerOptions key', () => {
    expect(perTopicReasoning('compose', false)).toEqual(low);
    for (const call of others) {
      const options = perTopicReasoning(call, false);
      expect(options).toEqual({});
      expect('providerOptions' in options).toBe(false);
    }
  });

  it('flag on: all six calls are low', () => {
    for (const call of [...others, 'compose' as const]) {
      expect(perTopicReasoning(call, true)).toEqual(low);
    }
  });
});
