import { describe, expect, it } from 'bun:test';
import { MockSearchProvider, resultsFor } from './mock-provider';
import type { SearchProvider, SearchQuery, SearchResult } from './search-provider';
import { MAX_WEB_SEARCH_QUERIES } from './search-thresholds';
import {
  executeWebSearch,
  webSearchInputSchema,
  webSearchOutputSchema,
  webSearchTool,
} from './web-search-tool';

function failingProvider(id: string): SearchProvider {
  return {
    id,
    search: async () => {
      throw new Error('provider exploded');
    },
  };
}

function staticProvider(id: string, result: (query: SearchQuery) => SearchResult[]): SearchProvider {
  return { id, search: async (query) => result(query) };
}

describe('executeWebSearch', () => {
  it('returns an explicit empty result when no Composio key is configured, never creating providers', async () => {
    let providersCreated = false;

    const outcome = await executeWebSearch(['q1'], {
      env: {},
      createProviders: () => {
        providersCreated = true;
        return [];
      },
    });

    expect(providersCreated).toBe(false);
    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('composio-api-key-missing');
    expect(outcome.items.map((item) => item.query)).toEqual(['q1']);
  });

  it('returns an explicit empty result when the configured chain is empty', async () => {
    const outcome = await executeWebSearch(['q1'], {
      env: { COMPOSIO_API_KEY: 'ak_test', WEB_SEARCH_PROVIDERS: '' },
      createProviders: () => [],
    });

    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('no-providers-configured');
  });

  it('runs the chain over injected providers and returns normalized results', async () => {
    const provider = new MockSearchProvider('mock:tavily', async (query) => resultsFor(query.query));

    const outcome = await executeWebSearch(['q1', 'q2'], {
      env: { COMPOSIO_API_KEY: 'ak_test' },
      createProviders: () => [provider],
    });

    expect(outcome.isEmpty).toBe(false);
    expect(outcome.providersUsed).toEqual(['mock:tavily']);
    expect(outcome.items[0]!.results).toEqual(resultsFor('q1'));
    expect(outcome.items[1]!.results).toEqual(resultsFor('q2'));
  });

  it('reports chain-exhausted instead of throwing when every provider fails', async () => {
    const outcome = await executeWebSearch(['q1'], {
      env: { COMPOSIO_API_KEY: 'ak_test' },
      createProviders: () => [failingProvider('mock:tavily'), failingProvider('mock:exa')],
    });

    expect(outcome.isEmpty).toBe(true);
    expect(outcome.emptyReason).toBe('chain-exhausted');
    expect(outcome.failures).toHaveLength(2);
  });
});

describe('webSearchTool', () => {
  it('is the stable web-search tool with the normalized output shape', () => {
    expect(webSearchTool.id).toBe('web-search');
  });

  it('validates its input as a bounded list of queries', () => {
    const parsed = webSearchInputSchema.parse({ queries: ['formal term for X'] });
    expect(parsed.queries).toEqual(['formal term for X']);
    expect(MAX_WEB_SEARCH_QUERIES).toBeGreaterThan(0);

    expect(() => webSearchInputSchema.parse({ queries: [] })).toThrow();
    expect(() => webSearchInputSchema.parse({ queries: [''] })).toThrow();
    expect(() =>
      webSearchInputSchema.parse({ queries: Array.from({ length: MAX_WEB_SEARCH_QUERIES + 1 }, (_, i) => `q${i}`) }),
    ).toThrow();
  });

  it('accepts a full chain result in its output schema and rejects malformed output', () => {
    const chainResult = {
      items: [{ query: 'q1', results: [{ title: 't', url: 'https://example.com', snippet: 's' }] }],
      providersUsed: ['composio:tavily'],
      failures: [{ providerId: 'composio:tavily', query: 'q1', reason: 'no results' }],
      isEmpty: false,
    };
    expect(webSearchOutputSchema.parse(chainResult)).toBeDefined();

    expect(() =>
      webSearchOutputSchema.parse({
        items: [{ query: 'q1', results: [{ title: 't', url: 'not-a-url', snippet: 's' }] }],
        providersUsed: [],
        failures: [],
        isEmpty: true,
      }),
    ).toThrow();
  });

  it('executes through executeWebSearch and degrades to an explicit empty result', async () => {
    const execute = webSearchTool.execute;
    expect(execute).toBeTypeOf('function');

    const outcome = await executeWebSearch(['q1'], {
      env: { COMPOSIO_API_KEY: 'ak_test' },
      createProviders: () => [staticProvider('mock:exa', (query) => resultsFor(query.query))],
    });

    expect(outcome.items[0]!.providerId).toBe('mock:exa');
  });
});
