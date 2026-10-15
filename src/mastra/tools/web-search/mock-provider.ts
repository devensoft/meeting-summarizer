import type { SearchProvider, SearchQuery, SearchResult } from './search-provider';

export type MockScriptStep = (query: SearchQuery) => Promise<SearchResult[]>;

/**
 * A mock search provider that replays scripted behavior and records calls.
 *
 * Steps are consumed in call order; when the script runs out, the last step is
 * reused. Tests keep the real `SearchProvider` seam and stay off the network.
 */
export class MockSearchProvider implements SearchProvider {
  readonly calls: SearchQuery[] = [];
  readonly id: string;
  private readonly script: MockScriptStep[];

  constructor(id: string, ...script: MockScriptStep[]) {
    this.id = id;
    this.script = script;
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    this.calls.push(query);
    const step = this.script.at(-1);
    if (!step) throw new Error(`MockSearchProvider "${this.id}" has no script`);
    return step(query);
  }
}

export function resultsFor(query: string): SearchResult[] {
  return [
    {
      title: `hit for ${query}`,
      url: `https://example.com/${encodeURIComponent(query)}`,
      snippet: 'snippet',
    },
  ];
}

export async function okFor(query: SearchQuery): Promise<SearchResult[]> {
  return resultsFor(query.query);
}

export async function empty(): Promise<SearchResult[]> {
  return [];
}
