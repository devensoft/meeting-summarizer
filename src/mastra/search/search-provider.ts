/**
 * The one internal search-provider seam (spec: "the search-provider interface,
 * which is also the highest point at which network can be isolated").
 *
 * The provider chain, wave scheduler, and callers all depend on this interface
 * only; the single concrete implementation wraps the Composio Platform SDK.
 * Tests inject mock providers and never touch the network.
 */

export interface SearchResult {
  /** Page title as reported by the provider; empty string when absent. */
  title: string;
  /** Well-formed absolute http(s) URL; malformed links are dropped before this shape exists. */
  url: string;
  /** Short excerpt of the page content; empty string when the provider supplied none. */
  snippet: string;
}

export interface SearchQuery {
  query: string;
  /** Provider hint for how many results to return; providers may return fewer. */
  maxResults?: number;
}

export interface SearchProvider {
  /** Stable identifier used for failover reporting and provenance, e.g. `composio:tavily`. */
  readonly id: string;
  /**
   * Runs one search. Throws `RateLimitedSearchError` when the provider is
   * rate-limited (429) so the chain can back off and retry; any other throw
   * fails the attempt over to the next provider.
   */
  search(query: SearchQuery): Promise<SearchResult[]>;
}

/** Thrown by providers on an HTTP 429; the chain backs off exponentially, bounded by a retry cap. */
export class RateLimitedSearchError extends Error {
  constructor(message = 'Search provider rate-limited (429)', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RateLimitedSearchError';
  }
}
