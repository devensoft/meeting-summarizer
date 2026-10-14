import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_COMPOSIO_USER_ID,
  DEFAULT_WEB_SEARCH_PROVIDERS,
  WEB_SEARCH_TOOL_ALLOWLIST,
  parseWebSearchProviderChain,
  readComposioApiKey,
  readComposioUserId,
  readWebSearchProviderChain,
} from './web-search-config';

describe('parseWebSearchProviderChain', () => {
  it('defaults to the composio Tavily then Exa chain', () => {
    expect(parseWebSearchProviderChain(undefined)).toEqual({
      specs: [
        { kind: 'composio', toolkit: 'tavily' },
        { kind: 'composio', toolkit: 'exa' },
      ],
      ignored: [],
    });
    expect(DEFAULT_WEB_SEARCH_PROVIDERS).toBe('composio:tavily,composio:exa');
  });

  it('parses a configured order', () => {
    expect(parseWebSearchProviderChain('composio:exa, composio:tavily')).toEqual({
      specs: [
        { kind: 'composio', toolkit: 'exa' },
        { kind: 'composio', toolkit: 'tavily' },
      ],
      ignored: [],
    });
  });

  it('treats a blank override as an explicit empty chain (disable switch)', () => {
    expect(parseWebSearchProviderChain('')).toEqual({ specs: [], ignored: [] });
    expect(parseWebSearchProviderChain('   ')).toEqual({ specs: [], ignored: [] });
  });

  it('ignores unrecognized entries and reports them', () => {
    expect(parseWebSearchProviderChain('composio:exa, duckduckgo, composio:brave, , composio:tavily')).toEqual({
      specs: [
        { kind: 'composio', toolkit: 'exa' },
        { kind: 'composio', toolkit: 'tavily' },
      ],
      ignored: ['duckduckgo', 'composio:brave'],
    });
  });

  it('dedupes repeated providers, keeping the first occurrence', () => {
    expect(parseWebSearchProviderChain('composio:tavily, composio:tavily, composio:exa')).toEqual({
      specs: [
        { kind: 'composio', toolkit: 'tavily' },
        { kind: 'composio', toolkit: 'exa' },
      ],
      ignored: [],
    });
  });

  it('pins the fixed tool allowlist to exactly TAVILY_SEARCH and EXA_SEARCH', () => {
    expect(WEB_SEARCH_TOOL_ALLOWLIST).toEqual({ tavily: 'TAVILY_SEARCH', exa: 'EXA_SEARCH' });
  });

  it('pins the default session user id (deployment-visible in Composio)', () => {
    expect(DEFAULT_COMPOSIO_USER_ID).toBe('meeting-summarizer-search');
  });
});

describe('readWebSearchProviderChain', () => {
  it('uses the default chain when the env var is unset', () => {
    expect(readWebSearchProviderChain({}).specs.map((spec) => spec.toolkit)).toEqual(['tavily', 'exa']);
  });

  it('honors a configured chain and drops unknown entries', () => {
    expect(readWebSearchProviderChain({ WEB_SEARCH_PROVIDERS: 'composio:exa' }).specs).toEqual([
      { kind: 'composio', toolkit: 'exa' },
    ]);
  });
});

describe('readComposioApiKey', () => {
  it('reads and trims the key from the environment', () => {
    expect(readComposioApiKey({ COMPOSIO_API_KEY: '  ak_123  ' })).toBe('ak_123');
  });

  it('returns undefined when no key is configured', () => {
    expect(readComposioApiKey({})).toBeUndefined();
    expect(readComposioApiKey({ COMPOSIO_API_KEY: '   ' })).toBeUndefined();
  });
});

describe('readComposioUserId', () => {
  it('reads and trims the session user id from the environment', () => {
    expect(readComposioUserId({ COMPOSIO_USER_ID: '  pg-test-abc  ' })).toBe('pg-test-abc');
  });

  it('returns undefined when no user id is configured', () => {
    expect(readComposioUserId({})).toBeUndefined();
    expect(readComposioUserId({ COMPOSIO_USER_ID: '   ' })).toBeUndefined();
  });
});
