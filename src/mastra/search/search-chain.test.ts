import { describe, expect, it } from 'bun:test';
import { empty, MockSearchProvider, okFor, resultsFor } from './mock-provider';
import { RateLimitedSearchError, type SearchResult } from './search-provider';
import {
  RATE_LIMIT_BACKOFF_BASE_MS,
  RATE_LIMIT_BACKOFF_FACTOR,
  RATE_LIMIT_MAX_RETRIES,
  SEARCH_RESULTS_PER_QUERY,
} from './search-thresholds';
import { runWebSearchChain } from './search-chain';

function recordingSleep(delays: number[]) {
  return async (ms: number) => {
    delays.push(ms);
  };
}

describe('runWebSearchChain', () => {
  it('executes providers in chain order and stops at the first one with results', async () => {
    const first = new MockSearchProvider('composio:tavily', okFor);
    const second = new MockSearchProvider('composio:exa', okFor);

    const outcome = await runWebSearchChain([first, second], ['cursor EtL meetups']);

    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(0);
    expect(outcome.items[0]!.results).toEqual(resultsFor('cursor EtL meetups'));
    expect(outcome.items[0]!.providerId).toBe('composio:tavily');
    expect(outcome.providersUsed).toEqual(['composio:tavily']);
    expect(outcome.failures).toEqual([]);
    expect(outcome.isEmpty).toBe(false);
    expect(outcome.emptyReason).toBeUndefined();
  });

  it('fails over to the next provider when one fails, recording the failure', async () => {
    const failing = new MockSearchProvider('composio:tavily', async () => {
      throw new Error('tavily down');
    });
    const fallback = new MockSearchProvider('composio:exa', okFor);

    const outcome = await runWebSearchChain([failing, fallback], ['q1']);

    expect(fallback.calls).toHaveLength(1);
    expect(outcome.items[0]!.providerId).toBe('composio:exa');
    expect(outcome.failures).toEqual([
      { providerId: 'composio:tavily', query: 'q1', reason: 'tavily down' },
    ]);
    expect(outcome.isEmpty).toBe(false);
  });

  it('backs off exponentially on 429 and succeeds within the retry cap', async () => {
    const delays: number[] = [];
    let attempts = 0;
    const flaky = new MockSearchProvider('composio:tavily', async () => {
      attempts += 1;
      if (attempts === 1) throw new RateLimitedSearchError('429 slow down');
      return resultsFor('q1');
    });

    const outcome = await runWebSearchChain([flaky], ['q1'], {
      sleep: recordingSleep(delays),
    });

    expect(attempts).toBe(2);
    expect(delays).toEqual([RATE_LIMIT_BACKOFF_BASE_MS]);
    expect(outcome.items[0]!.providerId).toBe('composio:tavily');
    expect(outcome.failures).toEqual([]);
  });

  it('caps 429 retries, then fails over to the next provider', async () => {
    const delays: number[] = [];
    const rateLimited = new MockSearchProvider('composio:tavily', async () => {
      throw new RateLimitedSearchError('429');
    });
    const fallback = new MockSearchProvider('composio:exa', okFor);

    const outcome = await runWebSearchChain([rateLimited, fallback], ['q1'], {
      sleep: recordingSleep(delays),
    });

    expect(rateLimited.calls).toHaveLength(RATE_LIMIT_MAX_RETRIES + 1);
    expect(delays).toEqual([
      RATE_LIMIT_BACKOFF_BASE_MS,
      RATE_LIMIT_BACKOFF_BASE_MS * RATE_LIMIT_BACKOFF_FACTOR,
    ]);
    expect(outcome.items[0]!.providerId).toBe('composio:exa');
    expect(outcome.failures).toEqual([
      { providerId: 'composio:tavily', query: 'q1', reason: '429' },
    ]);
  });

  it('fails over immediately on non-429 errors without backing off', async () => {
    const delays: number[] = [];
    const failing = new MockSearchProvider('composio:tavily', async () => {
      throw new Error('boom');
    });

    const outcome = await runWebSearchChain([failing], ['q1'], {
      sleep: recordingSleep(delays),
    });

    expect(delays).toEqual([]);
    expect(failing.calls).toHaveLength(1);
    expect(outcome.items[0]!.results).toEqual([]);
  });

  it('enforces the per-search timeout and fails over when a provider hangs', async () => {
    const hanging = new MockSearchProvider('composio:tavily', () => new Promise<SearchResult[]>(() => {}));
    const fallback = new MockSearchProvider('composio:exa', okFor);

    const outcome = await runWebSearchChain([hanging, fallback], ['q1'], { timeoutMs: 20 });

    expect(outcome.items[0]!.providerId).toBe('composio:exa');
    expect(outcome.items[0]!.results).toEqual(resultsFor('q1'));
    expect(outcome.failures[0]!.providerId).toBe('composio:tavily');
    expect(outcome.failures[0]!.reason).toContain('timed out');
  });

  it('yields an explicit empty result when no providers are configured', async () => {
    const outcome = await runWebSearchChain([], ['q1', 'q2']);

    expect(outcome.items).toEqual([
      { query: 'q1', results: [] },
      { query: 'q2', results: [] },
    ]);
    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('no-providers-configured');
    expect(outcome.providersUsed).toEqual([]);
  });

  it('yields an explicit empty result with chain-exhausted when every provider fails', async () => {
    const failing = new MockSearchProvider('composio:tavily', async () => {
      throw new Error('down');
    });

    const outcome = await runWebSearchChain([failing], ['q1']);

    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('chain-exhausted');
  });

  it('falls through an empty-but-successful provider and reports no-results when the chain yields nothing', async () => {
    const first = new MockSearchProvider('composio:tavily', empty);
    const second = new MockSearchProvider('composio:exa', empty);

    const outcome = await runWebSearchChain([first, second], ['q1']);

    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('no-results');
    expect(outcome.failures).toEqual([
      { providerId: 'composio:tavily', query: 'q1', reason: 'no results' },
      { providerId: 'composio:exa', query: 'q1', reason: 'no results' },
    ]);
  });

  it('never throws, even when a provider throws synchronously', async () => {
    const explosive: MockSearchProvider = new MockSearchProvider('composio:tavily', okFor);
    explosive.search = () => {
      throw new Error('sync boom');
    };

    const outcome = await runWebSearchChain([explosive], ['q1']);

    expect(outcome.isEmpty).toBe(true);
    expect(outcome.failures[0]!.reason).toBe('sync boom');
  });

  it('processes many queries in waves while preserving item order', async () => {
    const queries = ['q1', 'q2', 'q3', 'q4', 'q5'];
    let inFlight = 0;
    let maxInFlight = 0;
    const provider = new MockSearchProvider('composio:tavily', async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return [];
    });

    const outcome = await runWebSearchChain([provider], queries, { concurrency: 2 });

    expect(outcome.items.map((item) => item.query)).toEqual(queries);
    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('no-results');
    expect(maxInFlight).toBe(2);
  });

  it('asks each provider for the configured number of results', async () => {
    const provider = new MockSearchProvider('composio:tavily', empty);

    await runWebSearchChain([provider], ['q1'], { maxResults: 5 });

    expect(provider.calls[0]).toEqual({ query: 'q1', maxResults: 5 });
  });

  it('defaults the per-provider result request to the named constant', async () => {
    const provider = new MockSearchProvider('composio:tavily', okFor);

    await runWebSearchChain([provider], ['q1']);

    expect(SEARCH_RESULTS_PER_QUERY).toBeGreaterThan(0);
    expect(provider.calls[0]!.maxResults).toBe(SEARCH_RESULTS_PER_QUERY);
  });
});
