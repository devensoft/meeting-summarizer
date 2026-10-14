import { describe, expect, it } from 'bun:test';
import { ENRICHED_CONCEPTS_MAX_CANDIDATES } from './constants';
import {
  resolveEnrichedConcepts,
  searchEnrichedConcepts,
  selectConceptCandidates,
} from './enriched-concepts';
import type { ConceptCandidate, ConceptProposal, ConceptSearchItem } from './ingestion-wf.schemas';
import { runWebSearchChain } from '../search/search-chain';
import { MockSearchProvider, okFor, resultsFor } from '../search/mock-provider';

function candidates(...mentions: string[]): ConceptCandidate[] {
  return mentions.map((informalMention) => ({ informalMention }));
}

describe('selectConceptCandidates', () => {
  it('caps the candidate list at the code constant, keeping input order', () => {
    const proposed = candidates(
      'five whys',
      'blameless postmortem',
      'service level objective',
      'circuit breaker',
      'event sourcing',
      'strangler fig',
      'domain-driven design',
      'test-driven development',
      'feature flag',
      'blue-green deployment',
      'chaos engineering',
      'capacity planning',
      'incident command',
      'runbook',
    );

    const selected = selectConceptCandidates(proposed);

    expect(selected).toHaveLength(ENRICHED_CONCEPTS_MAX_CANDIDATES);
    expect(selected[0]?.informalMention).toBe('five whys');
    expect(selected.at(-1)?.informalMention).toBe('blue-green deployment');
  });

  it('trims mentions and drops blank ones instead of searching empty queries', () => {
    const selected = selectConceptCandidates(candidates('  five whys  ', '   ', '', 'blameless postmortem'));

    expect(selected).toEqual([{ informalMention: 'five whys' }, { informalMention: 'blameless postmortem' }]);
  });

  it('dedupes case-insensitively, keeping the first occurrence', () => {
    const selected = selectConceptCandidates(
      candidates('Five Whys', 'blameless postmortem', 'FIVE WHYS', 'five whys'),
    );

    expect(selected).toEqual([{ informalMention: 'Five Whys' }, { informalMention: 'blameless postmortem' }]);
  });

  it('caps after deduplication so duplicates never crowd out distinct concepts', () => {
    const withDuplicates = [
      ...candidates('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'),
      ...candidates('a', 'a'),
      'k',
    ]
      .map((entry) => (typeof entry === 'string' ? { informalMention: entry } : entry))
      .slice(0, 12);

    const selected = selectConceptCandidates(withDuplicates);

    expect(selected).toHaveLength(ENRICHED_CONCEPTS_MAX_CANDIDATES);
    expect(selected.map((candidate) => candidate.informalMention)).toContain('j');
    expect(selected.map((candidate) => candidate.informalMention)).not.toContain('k');
  });
});

describe('searchEnrichedConcepts', () => {
  it('hands every candidate query to the provider chain in one call — the chain runs the waves', async () => {
    const provider = new MockSearchProvider('mock:wave', okFor);
    const runnerCalls: string[][] = [];
    const runner = async (queries: readonly string[]) => {
      runnerCalls.push([...queries]);
      return runWebSearchChain([provider], queries);
    };

    const items = await searchEnrichedConcepts(candidates('five whys', 'blameless postmortem'), runner);

    expect(runnerCalls).toEqual([['five whys', 'blameless postmortem']]);
    expect(provider.calls.map((call) => call.query)).toEqual(['five whys', 'blameless postmortem']);
    expect(items).toHaveLength(2);
  });

  it('skips the search chain entirely when a topic proposed no candidates', async () => {
    const runnerCalls: string[][] = [];
    const runner = async (queries: readonly string[]) => {
      runnerCalls.push([...queries]);
      return runWebSearchChain([new MockSearchProvider('mock:none', okFor)], queries);
    };

    const items = await searchEnrichedConcepts([], runner);

    expect(items).toEqual([]);
    expect(runnerCalls).toEqual([]);
  });

  it('aligns results to candidate order, keeping empty slots for unfound concepts', async () => {
    const provider = new MockSearchProvider('mock:partial', async (query) =>
      query.query === 'five whys' ? resultsFor(query.query) : [],
    );

    const items = await searchEnrichedConcepts(
      candidates('five whys', 'obscure internal shorthand'),
      (queries) => runWebSearchChain([provider], queries),
    );

    expect(items[0]?.informalMention).toBe('five whys');
    expect(items[0]?.results).toHaveLength(1);
    expect(items[0]?.results[0]?.url).toBe(resultsFor('five whys')[0]?.url);
    expect(items[1]?.informalMention).toBe('obscure internal shorthand');
    expect(items[1]?.results).toEqual([]);
  });
});

function searchItem(informalMention: string, results: ConceptSearchItem['results']): ConceptSearchItem {
  return { informalMention, results };
}

function proposal(
  informalMention: string,
  links: { title: string; url: string }[],
  overrides: Partial<ConceptProposal> = {},
): ConceptProposal {
  return {
    informalMention,
    formalFoundation: `formal foundation of ${informalMention}`,
    blurb: `blurb tying ${informalMention} to its formal foundation`,
    links,
    ...overrides,
  };
}

function result(title: string, url: string): { title: string; url: string; snippet: string } {
  return { title, url, snippet: 'snippet' };
}

describe('resolveEnrichedConcepts', () => {
  it('labels a searched concept "web-search" and keeps only links the chain actually found', () => {
    const searches = [
      searchItem('five whys', [
        result('Five whys — Wikipedia', 'https://en.wikipedia.org/wiki/Five_whys'),
        result('The Five Whys, explained', 'https://example.com/five-whys-explained'),
      ]),
    ];

    const concepts = resolveEnrichedConcepts(
      searches,
      [proposal('five whys', [
        { title: 'invented page', url: 'https://model-invented.example.com/five-whys' },
        { title: 'ignored title tweak', url: 'https://en.wikipedia.org/wiki/Five_whys' },
      ])],
    );

    expect(concepts).toHaveLength(1);
    expect(concepts[0]?.grounding).toBe('web-search');
    expect(concepts[0]?.links).toEqual([
      { title: 'Five whys — Wikipedia', url: 'https://en.wikipedia.org/wiki/Five_whys' },
    ]);
  });

  it('caps searched links at the link constant', () => {
    const searches = [
      searchItem('five whys', [
        result('r1', 'https://example.com/r1'),
        result('r2', 'https://example.com/r2'),
        result('r3', 'https://example.com/r3'),
        result('r4', 'https://example.com/r4'),
        result('r5', 'https://example.com/r5'),
      ]),
    ];

    const concepts = resolveEnrichedConcepts(
      searches,
      [proposal('five whys', [
        { title: 'r1', url: 'https://example.com/r1' },
        { title: 'r2', url: 'https://example.com/r2' },
        { title: 'r3', url: 'https://example.com/r3' },
        { title: 'r4', url: 'https://example.com/r4' },
        { title: 'r5', url: 'https://example.com/r5' },
      ])],
    );

    expect(concepts[0]?.links).toHaveLength(3);
    expect(concepts[0]?.links.map((link) => link.url)).toEqual([
      'https://example.com/r1',
      'https://example.com/r2',
      'https://example.com/r3',
    ]);
  });

  it('matches a searched link by normalized URL — scheme/host case, default port, and one trailing slash are cosmetic', () => {
    const searches = [
      searchItem('five whys', [result('Five whys — Wikipedia', 'https://en.wikipedia.org/wiki/Five_whys')]),
    ];

    const concepts = resolveEnrichedConcepts(
      searches,
      [proposal('five whys', [
        { title: 'scheme and host case', url: 'HTTPS://EN.Wikipedia.org/wiki/Five_whys' },
        { title: 'default port', url: 'https://en.wikipedia.org:443/wiki/Five_whys' },
        { title: 'trailing slash', url: 'https://en.wikipedia.org/wiki/Five_whys/' },
      ])],
    );

    expect(concepts[0]?.grounding).toBe('web-search');
    // Every variant matches the same returned page: the canonical result's own
    // title and URL are what render, and the same page never renders twice.
    expect(concepts[0]?.links).toEqual([
      { title: 'Five whys — Wikipedia', url: 'https://en.wikipedia.org/wiki/Five_whys' },
    ]);
  });

  it('still rejects a link the chain did not return, even when only the query string differs', () => {
    const searches = [
      searchItem('five whys', [result('Five whys — Wikipedia', 'https://en.wikipedia.org/wiki/Five_whys')]),
    ];

    const concepts = resolveEnrichedConcepts(
      searches,
      [proposal('five whys', [
        { title: 'tracking params', url: 'https://en.wikipedia.org/wiki/Five_whys?utm_source=model' },
      ])],
    );

    expect(concepts[0]?.grounding).toBe('web-search');
    expect(concepts[0]?.links).toEqual([]);
  });

  it('labels an unsearched concept "model-suggested" and keeps only well-formed model links', () => {
    const searches = [searchItem('blameless postmortem', [])];

    const concepts = resolveEnrichedConcepts(
      searches,
      [proposal('blameless postmortem', [
        { title: 'Postmortem culture', url: 'https://example.com/postmortem-culture' },
        { title: 'not a url', url: 'postmortem culture' },
        { title: 'wrong scheme', url: 'ftp://example.com/postmortem' },
      ])],
    );

    expect(concepts[0]?.grounding).toBe('model-suggested');
    expect(concepts[0]?.links).toEqual([
      { title: 'Postmortem culture', url: 'https://example.com/postmortem-culture' },
    ]);
  });

  it('decides provenance per concept in a mixed run', () => {
    const searches = [
      searchItem('five whys', [result('Five whys — Wikipedia', 'https://en.wikipedia.org/wiki/Five_whys')]),
      searchItem('blameless postmortem', []),
    ];

    const concepts = resolveEnrichedConcepts(
      searches,
      [
        proposal('five whys', [{ title: 'x', url: 'https://en.wikipedia.org/wiki/Five_whys' }]),
        proposal('blameless postmortem', [{ title: 'Postmortem culture', url: 'https://example.com/pm' }]),
      ],
    );

    expect(concepts.map((concept) => concept.grounding)).toEqual(['web-search', 'model-suggested']);
  });

  it('outputs concepts in candidate order and drops unmatched entries on either side', () => {
    const searches = [
      searchItem('five whys', []),
      searchItem('circuit breaker', []),
      searchItem('blameless postmortem', []),
    ];

    const concepts = resolveEnrichedConcepts(
      searches,
      [
        proposal('blameless postmortem', []),
        proposal('never proposed by the model', []), // no candidate: dropped
        proposal('CIRCUIT BREAKER', []), // matches case-insensitively
      ],
    );

    expect(concepts.map((concept) => concept.informalMention)).toEqual(['CIRCUIT BREAKER', 'blameless postmortem']);
  });
});
