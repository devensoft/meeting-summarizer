import { describe, expect, it } from 'bun:test';
import { SEARCH_WAVE_CONCURRENCY } from './search-thresholds';
import { runInWaves } from './wave-scheduler';

describe('runInWaves', () => {
  it('returns one result per item in input order', async () => {
    const outcome = await runInWaves(
      ['a', 'b', 'c'],
      async (item) => `done:${item}`,
    );

    expect(outcome).toEqual(['done:a', 'done:b', 'done:c']);
  });

  it('keeps input order even when later items settle first', async () => {
    const outcome = await runInWaves(
      ['slow', 'fast'],
      async (item) => {
        await new Promise((resolve) => setTimeout(resolve, item === 'slow' ? 30 : 1));
        return item;
      },
    );

    expect(outcome).toEqual(['slow', 'fast']);
  });

  it('never runs more than the requested concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 7 }, (_, index) => index);

    await runInWaves(
      items,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return item;
      },
      3,
    );

    expect(maxInFlight).toBe(3);
  });

  it('defaults its concurrency to the named SEARCH_WAVE_CONCURRENCY constant', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: SEARCH_WAVE_CONCURRENCY + 2 }, (_, index) => index);

    await runInWaves(
      items,
      async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return item;
      },
    );

    expect(SEARCH_WAVE_CONCURRENCY).toBe(3);
    expect(maxInFlight).toBe(SEARCH_WAVE_CONCURRENCY);
  });

  it('passes the original index to the worker', async () => {
    const outcome = await runInWaves(['x', 'y'], async (item, index) => `${item}@${index}`);

    expect(outcome).toEqual(['x@0', 'y@1']);
  });

  it('resolves immediately for empty input', async () => {
    const outcome = await runInWaves([], async () => 'never');

    expect(outcome).toEqual([]);
  });

  it('rejects when the worker rejects', async () => {
    await expect(
      runInWaves([1], async () => {
        throw new Error('worker failed');
      }),
    ).rejects.toThrow('worker failed');
  });

  it('refuses a non-positive concurrency', async () => {
    await expect(runInWaves([1], async (item) => item, 0)).rejects.toThrow('concurrency');
  });
});
