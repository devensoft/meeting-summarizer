import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createComposioSearchProvider } from './composio-search-provider';
import {
  emptyChainResult,
  runWebSearchChain,
  type WebSearchChainResult,
  type WebSearchEmptyReason,
} from './search-chain';
import type { SearchProvider } from './search-provider';
import { MAX_WEB_SEARCH_QUERIES } from './search-thresholds';
import {
  parseWebSearchProviderChain,
  readComposioApiKey,
  WEB_SEARCH_PROVIDERS_ENV_VAR,
  type WebSearchProviderSpec,
} from './web-search-config';

/**
 * The Mastra tool wrapper for the web-search chain: models (and Studio) call
 * this tool; its execution goes in-process through the provider chain to the
 * Composio Platform SDK — no MCP client anywhere.
 *
 * Like every layer beneath it, the tool never throws: an unconfigured or
 * exhausted chain yields an explicit empty result.
 */

const emptyReasonSchema = z.enum([
  'no-providers-configured',
  'composio-api-key-missing',
  'chain-exhausted',
  'no-results',
]);

export const webSearchResultSchema = z.object({
  title: z.string().describe('Result page title; empty string when the provider supplied none.'),
  url: z.url({ protocol: /^https?$/ }).describe('Well-formed absolute http(s) link.'),
  snippet: z.string().describe('Short excerpt of the page content; empty string when unavailable.'),
});

export const webSearchInputSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_WEB_SEARCH_QUERIES)
    .describe(
      `Search queries to run (at most ${MAX_WEB_SEARCH_QUERIES}). One query per concept works best.`,
    ),
});

export const webSearchOutputSchema = z.object({
  items: z.array(
    z.object({
      query: z.string(),
      results: z.array(webSearchResultSchema),
      providerId: z
        .string()
        .optional()
        .describe('Chain provider that supplied these results, e.g. "composio:tavily".'),
    }),
  ),
  providersUsed: z.array(z.string()),
  failures: z.array(
    z.object({
      providerId: z.string(),
      query: z.string(),
      reason: z.string(),
    }),
  ),
  isEmpty: z.boolean().describe('True when no query got any result; search issues never throw.'),
  emptyReason: emptyReasonSchema.optional(),
});

const defaultCreateProviders = (specs: readonly WebSearchProviderSpec[]): SearchProvider[] =>
  specs.map((spec) => createComposioSearchProvider(spec.toolkit));

export interface ExecuteWebSearchOptions {
  /** Environment to read configuration from; defaults to process.env. */
  env?: Record<string, string | undefined>;
  /**
   * Provider factory, injectable so tests run mock providers instead of the
   * Composio SDK. Defaults to building the configured composio providers.
   */
  createProviders?: (specs: readonly WebSearchProviderSpec[]) => SearchProvider[];
}

/**
 * Runs the configured web-search chain for the given queries.
 *
 * Reads `COMPOSIO_API_KEY` and `WEB_SEARCH_PROVIDERS` (default
 * `composio:tavily,composio:exa`) from the environment. Never throws: with no
 * key, no usable chain, or an exhausted chain the caller receives an explicit
 * empty result.
 */
export async function executeWebSearch(
  queries: readonly string[],
  options: ExecuteWebSearchOptions = {},
): Promise<WebSearchChainResult> {
  const env = options.env ?? process.env;
  const createProviders = options.createProviders ?? defaultCreateProviders;

  if (!readComposioApiKey(env)) {
    return emptyChainResult(queries, 'composio-api-key-missing');
  }

  const { specs } = parseWebSearchProviderChain(env[WEB_SEARCH_PROVIDERS_ENV_VAR]);
  const providers = createProviders(specs);
  return runWebSearchChain(providers, queries);
}

export const webSearchTool = createTool({
  id: 'web-search',
  title: 'Web search',
  description:
    'Searches the web through the configured provider chain (Composio Tavily, then Exa by default) and returns normalized links as {title, url, snippet}. Returns an explicit empty result when search is unconfigured or the whole chain fails; it never throws.',
  inputSchema: webSearchInputSchema,
  outputSchema: webSearchOutputSchema,
  execute: async ({ queries }) => executeWebSearch(queries),
});

export type { WebSearchChainResult, WebSearchEmptyReason };
