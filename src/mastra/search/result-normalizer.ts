import type { SearchResult } from './search-provider';

const SNIPPET_KEYS = ['snippet', 'content', 'summary', 'text'] as const;

/**
 * Validates one provider link into the common normalized shape.
 *
 * Links are validated for well-formedness only (parseable absolute http(s)
 * URL) — never fetched or verified. Entries without a well-formed URL are
 * dropped; a missing title or snippet becomes an empty string.
 */
export function toSearchResult(
  title: unknown,
  url: unknown,
  snippet: unknown,
): SearchResult | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmedUrl = url.trim();
  if (trimmedUrl === '') return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;

  return {
    title: typeof title === 'string' ? title.trim() : '',
    url: trimmedUrl,
    snippet: typeof snippet === 'string' ? snippet.trim() : '',
  };
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

function snippetFromEntry(entry: Record<string, unknown>): string | undefined {
  const direct = firstString(entry, SNIPPET_KEYS);
  if (direct !== undefined) return direct;

  const highlights = entry['highlights'];
  if (Array.isArray(highlights) && typeof highlights[0] === 'string') return highlights[0];
  return undefined;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => {
    return typeof entry === 'object' && entry !== null && !Array.isArray(entry);
  });
}

/**
 * Extracts normalized results from a provider's returned payload.
 *
 * Composio toolkit tools return a `data` record whose search results sit
 * either under `results` or nested under `response_data.results` (Tavily).
 * Anything unrecognizable yields an empty array — extraction never throws.
 */
export function extractSearchResults(payload: unknown): SearchResult[] {
  const data =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const unwrapped =
    typeof data['data'] === 'object' && data['data'] !== null && !Array.isArray(data['data'])
      ? (data['data'] as Record<string, unknown>)
      : data;

  const results = recordArray(unwrapped['results']);
  if (results.length === 0) {
    const responseData = recordArray(
      typeof unwrapped['response_data'] === 'object' &&
        unwrapped['response_data'] !== null &&
        !Array.isArray(unwrapped['response_data'])
        ? (unwrapped['response_data'] as Record<string, unknown>)['results']
        : undefined,
    );
    return responseData
      .map((entry) => toSearchResult(entry['title'], entry['url'], snippetFromEntry(entry)))
      .filter((result): result is SearchResult => result !== undefined);
  }

  return results
    .map((entry) => toSearchResult(entry['title'], entry['url'], snippetFromEntry(entry)))
    .filter((result): result is SearchResult => result !== undefined);
}
