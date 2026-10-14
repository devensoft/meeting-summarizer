import { Composio, SessionPreset } from '@composio/core';
import { extractSearchResults } from './result-normalizer';
import { RateLimitedSearchError, type SearchProvider, type SearchQuery, type SearchResult } from './search-provider';
import {
  readComposioApiKey,
  WEB_SEARCH_TOOL_ALLOWLIST,
  type WebSearchToolkit,
} from './web-search-config';

/**
 * The one concrete `SearchProvider` implementation: it calls the Composio
 * Platform SDK in-process (no MCP client) using the project API key from the
 * environment and a session user id supplied by the caller — whose connected
 * accounts resolve for tool execution (shared id today; per-user ids via
 * ConnectLink later).
 *
 * This module is the network boundary — unit tests never execute it; they
 * inject mock providers at the `SearchProvider` seam instead.
 */

/** The narrow slice of a Composio session this provider depends on. */
interface ComposioToolExecutor {
  execute(
    toolSlug: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: Record<string, unknown>;
    error: string | null;
    resultType: 'completed' | 'failed';
  }>;
}

const RATE_LIMIT_MESSAGE_PATTERN = /\b429\b|rate[ -]?limit/i;

function isRateLimitError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { statusCode?: unknown; message?: unknown };
  if (candidate.statusCode === 429) return true;
  return typeof candidate.message === 'string' && RATE_LIMIT_MESSAGE_PATTERN.test(candidate.message);
}

function buildToolArguments(
  toolkit: WebSearchToolkit,
  query: string,
  maxResults: number | undefined,
): Record<string, unknown> {
  const args: Record<string, unknown> = { query };
  if (maxResults !== undefined) {
    if (toolkit === 'exa') {
      args['numResults'] = maxResults;
    } else {
      args['max_results'] = maxResults;
    }
  }
  if (toolkit === 'exa') {
    // Highlights ride along with the search so results carry a usable snippet.
    args['contents'] = { highlights: true };
  }
  return args;
}

/**
 * One shared session per user id for the whole process: the fixed allowlist
 * covers both search tools, exposed with the direct-tools preset (no
 * model-facing meta tools) and no sandbox. Sessions are cached under the
 * resolved session user id, so distinct ids (a shared id today, per-user
 * ConnectLink ids later) get their own session without cross-talk. A failed
 * creation is not cached — the next call retries, so a transient Composio
 * outage does not poison the process.
 */
const sessionPromises = new Map<string, Promise<ComposioToolExecutor>>();

function getComposioSession(apiKey: string, userId: string): Promise<ComposioToolExecutor> {
  let sessionPromise = sessionPromises.get(userId);
  sessionPromise ??= createComposioSession(apiKey, userId).catch((error: unknown) => {
    sessionPromises.delete(userId);
    throw error;
  });
  sessionPromises.set(userId, sessionPromise);
  return sessionPromise;
}

async function createComposioSession(apiKey: string, userId: string): Promise<ComposioToolExecutor> {
  const composio = new Composio({ apiKey });
  const session = await composio.sessions.create(userId, {
    toolkits: Object.keys(WEB_SEARCH_TOOL_ALLOWLIST),
    tools: {
      tavily: { enable: [WEB_SEARCH_TOOL_ALLOWLIST.tavily] },
      exa: { enable: [WEB_SEARCH_TOOL_ALLOWLIST.exa] },
    },
    sessionPreset: SessionPreset.DIRECT_TOOLS,
    sandbox: { enable: false },
  });
  return session;
}

export interface ComposioSearchProviderOptions {
  /** Overrides the COMPOSIO_API_KEY environment variable (used by setups that pass the key programmatically). */
  apiKey?: string;
  /**
   * The Composio user id the search session runs under — the id whose
   * connected accounts resolve at execution time (a shared id today, per-user
   * ConnectLink ids later). Required: callers resolve it (explicit input,
   * environment, or `DEFAULT_COMPOSIO_USER_ID`), so this network boundary
   * never guesses.
   */
  userId: string;
}

/**
 * Builds the search provider for one allowlisted Composio toolkit
 * (`composio:tavily` → `TAVILY_SEARCH`, `composio:exa` → `EXA_SEARCH`).
 *
 * Rate limits (429) surface as `RateLimitedSearchError` so the chain backs
 * off exponentially before failing over; every other error fails over
 * immediately.
 */
export function createComposioSearchProvider(
  toolkit: WebSearchToolkit,
  options: ComposioSearchProviderOptions,
): SearchProvider {
  const tool = WEB_SEARCH_TOOL_ALLOWLIST[toolkit];

  const resolveApiKey = (): string => {
    const apiKey = options.apiKey ?? readComposioApiKey(process.env);
    if (!apiKey) {
      throw new Error(
        `COMPOSIO_API_KEY is not configured; the ${toolkit} search provider cannot run.`,
      );
    }
    return apiKey;
  };

  const runTool = async (args: Record<string, unknown>) => {
    const session = await getComposioSession(resolveApiKey(), options.userId);
    try {
      const response = await session.execute(tool, args);
      if (response.resultType === 'failed') {
        const message = response.error ?? `${tool} execution failed`;
        if (RATE_LIMIT_MESSAGE_PATTERN.test(message)) {
          throw new RateLimitedSearchError(message, { cause: response });
        }
        throw new Error(message);
      }
      return response;
    } catch (error) {
      if (error instanceof RateLimitedSearchError) throw error;
      if (isRateLimitError(error)) {
        throw new RateLimitedSearchError(`${tool} rate-limited (429)`, { cause: error });
      }
      throw error;
    }
  };

  return {
    id: `composio:${toolkit}`,
    async search({ query, maxResults }: SearchQuery): Promise<SearchResult[]> {
      const response = await runTool(buildToolArguments(toolkit, query, maxResults));
      return extractSearchResults(response.data);
    },
  };
}
