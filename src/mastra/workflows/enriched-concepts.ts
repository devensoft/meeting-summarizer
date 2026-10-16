import { ENRICHED_CONCEPTS_MAX_CANDIDATES, ENRICHED_CONCEPTS_MAX_LINKS } from './constants';
import type { ConceptCandidate, ConceptProposal, ConceptSearchItem, EnrichedConcept } from './ingestion-wf.schemas';
import type { WebSearchChainResult } from '../tools/web-search/search-chain';
import { dedupeByTrimmedLowerCaseKey } from '../dedupe';

/**
 * Enriched-concepts determinism (spec: "Enriched Concepts grounding").
 *
 * The two agent calls (proposal, composition) never decide the parts that
 * must be trustworthy: code caps the candidate list, code fans the searches
 * out through the provider chain, and code decides each concept's provenance
 * and which links survive. Everything here is pure or provider-injected, so
 * colocated tests run with mock providers and no network.
 */

/** Selects the concepts worth searching from the proposal call's raw output:
 * mentions are trimmed, blanks are dropped, duplicates collapse
 * case-insensitively to their first occurrence, and the list is capped at
 * `ENRICHED_CONCEPTS_MAX_CANDIDATES` — the cap is enforced here, by code,
 * never by prompt compliance. */
export function selectConceptCandidates(candidates: readonly ConceptCandidate[]): ConceptCandidate[] {
  return dedupeByTrimmedLowerCaseKey(candidates, (candidate) => candidate.informalMention)
    .slice(0, ENRICHED_CONCEPTS_MAX_CANDIDATES)
    .map((candidate) => ({ informalMention: candidate.informalMention.trim() }));
}

/** Runs the concept searches through one injected boundary. Production passes
 * `executeWebSearch` (the env-configured provider chain); tests pass a runner
 * over `runWebSearchChain` with mock providers. The runner receives every
 * query in one call and fans them out in bounded waves itself — this module
 * never schedules waves of its own. */
export type ConceptSearchRunner = (queries: readonly string[]) => Promise<WebSearchChainResult>;

/** Searches for every candidate, one query per informal mention, and returns
 * the per-candidate chain items in candidate order. An empty candidate list
 * skips the runner entirely — a topic with no candidates must not touch the
 * search chain at all. A candidate whose query comes back empty keeps its
 * slot with empty results; provenance is decided later, from these results. */
export async function searchEnrichedConcepts(
  candidates: readonly ConceptCandidate[],
  runSearch: ConceptSearchRunner,
): Promise<ConceptSearchItem[]> {
  if (candidates.length === 0) {
    return [];
  }

  const queries = candidates.map((candidate) => candidate.informalMention);
  const chainResult = await runSearch(queries);

  return candidates.map((candidate, index) => ({
    informalMention: candidate.informalMention,
    results: chainResult.items[index]?.results ?? [],
  }));
}

/** Decides each concept's provenance and validates its links.
 *
 * Provenance is a code decision, taken per concept from the search chain:
 * results found → `web-search`, and only links whose URL matches a searched
 * result survive — matched by normalized URL (case of scheme/host, default
 * ports, trailing slash, and fragments are cosmetic; query strings are not)
 * and emitted with the canonical result's title and URL, so the label stays
 * honest; no results → `model-suggested`, where the model's own
 * links are allowed but must be well-formed http(s) URLs. Either way the
 * link list is capped at `ENRICHED_CONCEPTS_MAX_LINKS`. Concepts are output
 * in candidate (search) order; a proposal with no matching candidate, or a
 * candidate the model never wrote a blurb for, is dropped — never thrown. */
export function resolveEnrichedConcepts(
  searches: readonly ConceptSearchItem[],
  proposals: readonly ConceptProposal[],
): EnrichedConcept[] {
  // The shared dedupe rule indexes the proposals: first mention wins, so a
  // repeated informal mention can never swap which proposal a search binds to.
  const proposalsByMention = new Map(
    dedupeByTrimmedLowerCaseKey(proposals, (proposal) => proposal.informalMention).map(
      (proposal): [string, ConceptProposal] => [proposal.informalMention.trim().toLowerCase(), proposal],
    ),
  );

  const resolved: EnrichedConcept[] = [];
  for (const search of searches) {
    const proposal = proposalsByMention.get(search.informalMention.trim().toLowerCase());
    if (!proposal) {
      continue;
    }

    const grounding = search.results.length > 0 ? 'web-search' : 'model-suggested';
    const links =
      grounding === 'web-search' ? selectSearchedLinks(proposal.links, search.results) : selectModelLinks(proposal.links);

    resolved.push({
      informalMention: proposal.informalMention.trim(),
      formalFoundation: proposal.formalFoundation.trim(),
      blurb: proposal.blurb.trim(),
      links,
      grounding,
    });
  }
  return resolved;
}

/** Collects proposed links up to `ENRICHED_CONCEPTS_MAX_LINKS` through one
 * resolver: a proposed link maps to the link that is emitted, or to
 * `undefined` when it is rejected. Both provenance paths share this loop;
 * only the resolver differs. */
function collectCappedLinks(
  proposedLinks: readonly { title: string; url: string }[],
  resolveLink: (link: { title: string; url: string }) => { title: string; url: string } | undefined,
): EnrichedConcept['links'] {
  const links: EnrichedConcept['links'] = [];
  for (const link of proposedLinks) {
    const resolved = resolveLink(link);
    if (resolved === undefined) {
      continue;
    }
    links.push(resolved);
    if (links.length === ENRICHED_CONCEPTS_MAX_LINKS) {
      break;
    }
  }
  return links;
}

function selectSearchedLinks(
  proposedLinks: readonly { title: string; url: string }[],
  results: readonly { title: string; url: string }[],
): EnrichedConcept['links'] {
  const resultsByUrl = new Map<string, { title: string; url: string }>();
  for (const result of results) {
    const key = normalizeUrlForMatch(result.url);
    if (key !== undefined && !resultsByUrl.has(key)) {
      resultsByUrl.set(key, result);
    }
  }

  const matched = new Set<string>();
  return collectCappedLinks(proposedLinks, (link) => {
    const key = normalizeUrlForMatch(link.url);
    if (key === undefined) {
      return undefined;
    }
    const result = resultsByUrl.get(key);
    if (result === undefined || matched.has(key)) {
      return undefined;
    }
    matched.add(key);
    // The canonical result's own title and URL render, so the label stays
    // honest even when the proposal's spelling differed cosmetically.
    return { title: result.title, url: result.url };
  });
}

/** Canonical form for deciding whether a proposed link is one the chain
 * actually returned: scheme and host lowercased, fragment dropped, default
 * ports (80/443) dropped, and a single trailing slash on the path dropped.
 * The query string is preserved — a link must not smuggle itself in through
 * a tracking parameter the returned URL never had. */
function normalizeUrlForMatch(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return undefined;
  }

  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return undefined;
  }

  const host = parsed.hostname.toLowerCase();
  const isDefaultPort = (scheme === 'http' && parsed.port === '80') || (scheme === 'https' && parsed.port === '443');
  const port = isDefaultPort ? '' : parsed.port;
  const pathWithSlashStripped = parsed.pathname.replace(/\/$/, '');

  return `${scheme}://${host}${port === '' ? '' : `:${port}`}${pathWithSlashStripped}${parsed.search}`;
}

function selectModelLinks(proposedLinks: readonly { title: string; url: string }[]): EnrichedConcept['links'] {
  return collectCappedLinks(proposedLinks, (link) =>
    isWellFormedHttpUrl(link.url) ? { title: link.title, url: link.url } : undefined,
  );
}

function isWellFormedHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
