/**
 * Manual live smoke search for the web-search provider chain.
 *
 * This is NOT part of the test suite — it performs a real network call
 * against Composio and needs a real project connection. Run it by hand to
 * verify the chain end-to-end once `COMPOSIO_API_KEY` is set and the
 * project's Tavily and Exa connections are active:
 *
 *   COMPOSIO_API_KEY=ak_... bun scripts/web-search-smoke.ts "formal term"
 *
 * Optional overrides:
 *   WEB_SEARCH_PROVIDERS=composio:exa bun scripts/web-search-smoke.ts "query"
 *
 * Expected output: one JSON block per query with normalized {title, url,
 * snippet} results, the provider that supplied them, and any failures. With
 * no key configured the script prints an explicit empty result (it must
 * never throw) — that path is already covered by unit tests.
 */
import { executeWebSearch } from '../src/mastra/search/web-search-tool';

const query = process.argv[2]?.trim();

if (!query) {
  console.error('Usage: bun scripts/web-search-smoke.ts "<search query>"');
  process.exit(2);
}

const outcome = await executeWebSearch([query]);

console.log(JSON.stringify(outcome, null, 2));

if (outcome.isEmpty) {
  console.error(`\nNo results (emptyReason: ${outcome.emptyReason ?? 'unknown'}).`);
  if (outcome.emptyReason === 'composio-api-key-missing') {
    console.error('Set COMPOSIO_API_KEY (and connect Tavily/Exa in the Composio dashboard) to search live.');
  }
  process.exit(1);
}
