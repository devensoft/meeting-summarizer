import { SEARCH_WAVE_CONCURRENCY } from './search-thresholds';

/**
 * Runs `worker` over every item in bounded waves: at most `concurrency` workers
 * run at once, and each wave settles fully before the next starts.
 *
 * Results are returned in input order regardless of completion order. The
 * low-level scheduler propagates worker rejections; callers that need a
 * never-throwing boundary (the search chain) catch errors inside their worker.
 */
export async function runInWaves<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number = SEARCH_WAVE_CONCURRENCY,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const results = new Array<R>(items.length);
  for (let waveStart = 0; waveStart < items.length; waveStart += concurrency) {
    const wave = items.slice(waveStart, waveStart + concurrency);
    const waveResults = await Promise.all(
      wave.map((item, offset) => worker(item, waveStart + offset)),
    );
    for (let offset = 0; offset < waveResults.length; offset += 1) {
      results[waveStart + offset] = waveResults[offset]!;
    }
  }
  return results;
}
