/**
 * Environment-driven configuration for the web-search chain.
 *
 * Pure module: no SDK import, no I/O — env values are always passed in so
 * tests stay deterministic and the network stays out of unit tests.
 */

export const COMPOSIO_API_KEY_ENV_VAR = 'COMPOSIO_API_KEY';
export const WEB_SEARCH_PROVIDERS_ENV_VAR = 'WEB_SEARCH_PROVIDERS';
export const COMPOSIO_USER_ID_ENV_VAR = 'COMPOSIO_USER_ID';

/** Default chain: Composio Tavily first, then Composio Exa (spec decision). */
export const DEFAULT_WEB_SEARCH_PROVIDERS = 'composio:tavily,composio:exa';

/**
 * The one stable service identity every search session runs under when
 * neither the caller nor `COMPOSIO_USER_ID` names one — a single service
 * principal, since this application has no end-user identity model of its
 * own. A fallback value, not a separate concept: the session user id is
 * ordinary call data (see `readComposioUserId`).
 */
export const DEFAULT_COMPOSIO_USER_ID = 'meeting-summarizer-search';

/**
 * The fixed toolkit-tool allowlist. Exactly two tools exist for search; no
 * model-facing meta tools are exposed (sessions run with the direct-tools
 * preset and the sandbox disabled).
 */
export const WEB_SEARCH_TOOL_ALLOWLIST = {
  tavily: 'TAVILY_SEARCH',
  exa: 'EXA_SEARCH',
} as const;

export type WebSearchToolkit = keyof typeof WEB_SEARCH_TOOL_ALLOWLIST;

export interface WebSearchProviderSpec {
  kind: 'composio';
  toolkit: WebSearchToolkit;
}

export interface ParsedWebSearchProviderChain {
  /** Recognized providers in configured order, deduped. */
  specs: WebSearchProviderSpec[];
  /** Entries that were dropped because they were blank or unrecognizable. */
  ignored: string[];
}

/**
 * Parses a `WEB_SEARCH_PROVIDERS` value: a comma-separated list of
 * `composio:<toolkit>` entries. A blank value means "explicitly no chain"
 * (a disable switch); an unset value falls back to
 * `DEFAULT_WEB_SEARCH_PROVIDERS`. Unrecognized entries are ignored and
 * reported rather than failing the run — a search outage or misconfiguration
 * must never fail a meeting run.
 */
export function parseWebSearchProviderChain(raw: string | undefined): ParsedWebSearchProviderChain {
  const source = raw === undefined ? DEFAULT_WEB_SEARCH_PROVIDERS : raw;
  const specs: WebSearchProviderSpec[] = [];
  const ignored: string[] = [];

  for (const token of source.split(',')) {
    const entry = token.trim();
    if (entry === '') continue;

    const separator = entry.indexOf(':');
    const kind = separator === -1 ? '' : entry.slice(0, separator).trim().toLowerCase();
    const toolkit = separator === -1 ? '' : entry.slice(separator + 1).trim().toLowerCase();

    if (kind === 'composio' && toolkit in WEB_SEARCH_TOOL_ALLOWLIST) {
      const spec: WebSearchProviderSpec = { kind: 'composio', toolkit: toolkit as WebSearchToolkit };
      if (!specs.some((existing) => existing.toolkit === spec.toolkit)) {
        specs.push(spec);
      }
    } else {
      ignored.push(entry);
    }
  }

  return { specs, ignored };
}

/** Reads the provider chain from an environment, applying the default when unset. */
export function readWebSearchProviderChain(
  env: Record<string, string | undefined>,
): ParsedWebSearchProviderChain {
  return parseWebSearchProviderChain(env[WEB_SEARCH_PROVIDERS_ENV_VAR]);
}

/** Reads the Composio project API key; absent or blank means search is disabled. */
export function readComposioApiKey(env: Record<string, string | undefined>): string | undefined {
  const key = env[COMPOSIO_API_KEY_ENV_VAR]?.trim();
  return key === '' ? undefined : key;
}

/**
 * Reads the Composio user id search sessions run under; absent or blank means
 * no id is configured and the caller applies its fallback
 * (`DEFAULT_COMPOSIO_USER_ID`). The session user id must be able to resolve
 * the project's Tavily/Exa connected accounts — when those were connected
 * from the dashboard, that is the dashboard's user id, which only an explicit
 * `COMPOSIO_USER_ID` (or an explicit call-time id) can select.
 */
export function readComposioUserId(env: Record<string, string | undefined>): string | undefined {
  const userId = env[COMPOSIO_USER_ID_ENV_VAR]?.trim();
  return userId === '' ? undefined : userId;
}
