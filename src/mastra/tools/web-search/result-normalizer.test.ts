import { describe, expect, it } from 'bun:test';
import { extractSearchResults, toSearchResult } from './result-normalizer';

describe('toSearchResult', () => {
  it('normalizes a well-formed link to the common {title, url, snippet} shape', () => {
    expect(toSearchResult('  Some Title ', 'https://example.com/page', '  A snippet. ')).toEqual({
      title: 'Some Title',
      url: 'https://example.com/page',
      snippet: 'A snippet.',
    });
  });

  it('defaults missing title and snippet to empty strings', () => {
    expect(toSearchResult(undefined, 'https://example.com', undefined)).toEqual({
      title: '',
      url: 'https://example.com',
      snippet: '',
    });
  });

  it('drops links whose URL is not well-formed', () => {
    expect(toSearchResult('Title', 'not-a-url', 'snippet')).toBeUndefined();
    expect(toSearchResult('Title', 'https://', 'snippet')).toBeUndefined();
  });

  it('drops links whose URL is not http(s)', () => {
    expect(toSearchResult('Title', 'ftp://example.com/file', 'snippet')).toBeUndefined();
    expect(toSearchResult('Title', 'javascript:alert(1)', 'snippet')).toBeUndefined();
  });

  it('drops links without any URL', () => {
    expect(toSearchResult('Title', undefined, 'snippet')).toBeUndefined();
    expect(toSearchResult('Title', '   ', 'snippet')).toBeUndefined();
  });
});

describe('extractSearchResults', () => {
  it('reads Tavily results nested under response_data.results inside data', () => {
    const payload = {
      response_data: {
        results: [
          { title: 'Formal term', url: 'https://example.com/formal', content: 'The formal foundation.' },
          { title: 'Bad one', url: 'nope', content: 'dropped' },
        ],
      },
    };

    expect(extractSearchResults(payload)).toEqual([
      { title: 'Formal term', url: 'https://example.com/formal', snippet: 'The formal foundation.' },
    ]);
  });

  it('reads results directly under data.results', () => {
    const payload = {
      results: [{ title: 'Exa hit', url: 'https://example.com/exa', text: 'Body text.' }],
    };

    expect(extractSearchResults(payload)).toEqual([
      { title: 'Exa hit', url: 'https://example.com/exa', snippet: 'Body text.' },
    ]);
  });

  it('accepts snippet, summary, or first highlight as the snippet source', () => {
    const payload = {
      results: [
        { title: 'a', url: 'https://example.com/a', snippet: 'from snippet' },
        { title: 'b', url: 'https://example.com/b', summary: 'from summary' },
        { title: 'c', url: 'https://example.com/c', highlights: ['first highlight', 'second'] },
        { title: 'd', url: 'https://example.com/d' },
      ],
    };

    expect(extractSearchResults(payload)).toEqual([
      { title: 'a', url: 'https://example.com/a', snippet: 'from snippet' },
      { title: 'b', url: 'https://example.com/b', snippet: 'from summary' },
      { title: 'c', url: 'https://example.com/c', snippet: 'first highlight' },
      { title: 'd', url: 'https://example.com/d', snippet: '' },
    ]);
  });

  it('returns an empty array for anything that is not a recognizable payload', () => {
    expect(extractSearchResults(undefined)).toEqual([]);
    expect(extractSearchResults('garbage')).toEqual([]);
    expect(extractSearchResults({ data: null })).toEqual([]);
    expect(extractSearchResults({ results: 'not-an-array' })).toEqual([]);
  });

  it('unwraps a data record before searching for results', () => {
    const payload = { data: { results: [{ title: 'x', url: 'https://example.com/x', content: 'c' }] } };

    expect(extractSearchResults(payload)).toEqual([
      { title: 'x', url: 'https://example.com/x', snippet: 'c' },
    ]);
  });
});
