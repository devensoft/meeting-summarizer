import { runInWaves } from './wave-scheduler';
import {
  RateLimitedSearchError,
  type SearchProvider,
  type SearchResult,
} from './search-provider';
import {
  RATE_LIMIT_BACKOFF_BASE_MS,
  RATE_LIMIT_BACKOFF_FACTOR,
  RATE_LIMIT_MAX_RETRIES,
  SEARCH_RESULTS_PER_QUERY,
  SEARCH_TIMEOUT_MS,
  SEARCH_WAVE_CONCURRENCY,
} from './search-thresholds';

/**
 * Why a chain run produced nothing; surfaced so callers can log or label
 * provenance. The literals live here once — the `WebSearchEmptyReason` type
 * and the web-search tool's `emptyReasonSchema` are both derived from it.
 */
export const WEB_SEARCH_EMPTY_REASONS = [
  /** The configured provider list was empty (unset, blank, or unrecognizable). */
  'no-providers-configured',
  /**
   * The COMPOSIO_API_KEY is absent; set by the env-aware entry point
   * (`executeWebSearch`), which disables the chain before any provider runs.
   */
  'composio-api-key-missing',
  /** Providers were configured but every attempt failed or was rate-limited past its cap. */
  'chain-exhausted',
  /** Attempts succeeded but every provider returned zero results. */
  'no-results',
] as const;

/** Why a chain run produced nothing; surfaced so callers can log or label provenance. */
export type WebSearchEmptyReason = (typeof WEB_SEARCH_EMPTY_REASONS)[number];

export interface SearchChainItem {
  query: string;
  results: SearchResult[];
  /** Provider that supplied the results; absent when the whole chain found nothing. */
  providerId?: string;
}

export interface SearchChainFailure {
  providerId: string;
  query: string;
  reason: string;
}

export interface WebSearchChainResult {
  /** One item per query, in input order; `results` may be empty but items are never dropped. */
  items: SearchChainItem[];
  /** Distinct providers that supplied results, in first-use order. */
  providersUsed: string[];
  /** Every failed or empty provider attempt, for observability. */
  failures: SearchChainFailure[];
  /** Explicit emptiness: true when no query got any result. The chain never throws instead. */
  isEmpty: boolean;
  emptyReason?: WebSearchEmptyReason;
}

/**
 * The chain's tunables that exist as injection seams, not production knobs:
 * production callers pass nothing and every threshold comes from
 * `search-thresholds.ts` (wave concurrency, result count, retry/backoff caps).
 * `timeoutMs` keeps the timeout test off the real clock; `sleep` keeps the
 * backoff tests off it.
 */
export interface SearchChainOptions {
  /** Per-provider-attempt wall-clock budget in ms. Default: SEARCH_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Backoff clock, injectable so tests never wait. Default: a real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const NO_RESULTS_REASON = 'no results';

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Rejects with a descriptive error when `promise` outlives `timeoutMs`.
 *
 * Subscribes to `promise` exactly once, so a late rejection after the timeout
 * has already surfaced is still handled (no unhandled rejections).
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, providerId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`search timed out after ${timeoutMs}ms (${providerId})`));
    }, timeoutMs);
    (timer as unknown as { unref?: () => void }).unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        clearTimeout(timer);
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
    );
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface FailoverOutcome {
  item: SearchChainItem;
  failures: SearchChainFailure[];
}

/**
 * Runs one query down the provider chain, never throwing.
 *
 * Each provider attempt gets the per-search timeout. A 429 backs off
 * exponentially up to the retry cap and only then fails over; any other
 * failure fails over immediately. An empty-but-successful attempt also hands
 * off to the next provider so the chain is used fully before giving up.
 * Thresholds come from `search-thresholds.ts`; only the timeout and the
 * backoff clock arrive as injectable seams.
 */
async function searchWithFailover(
  providers: readonly SearchProvider[],
  query: string,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<FailoverOutcome> {
  const failures: SearchChainFailure[] = [];

  for (const provider of providers) {
    let retries = 0;
    while (true) {
      const attempt: Promise<SearchResult[]> = Promise.resolve().then(() =>
        provider.search({ query, maxResults: SEARCH_RESULTS_PER_QUERY }),
      );
      try {
        const results = await withTimeout(attempt, timeoutMs, provider.id);
        if (results.length > 0) {
          return { item: { query, results, providerId: provider.id }, failures };
        }
        failures.push({ providerId: provider.id, query, reason: NO_RESULTS_REASON });
        break;
      } catch (error) {
        if (error instanceof RateLimitedSearchError && retries < RATE_LIMIT_MAX_RETRIES) {
          await sleep(RATE_LIMIT_BACKOFF_BASE_MS * RATE_LIMIT_BACKOFF_FACTOR ** retries);
          retries += 1;
          continue;
        }
        failures.push({ providerId: provider.id, query, reason: describeError(error) });
        break;
      }
    }
  }

  return { item: { query, results: [] }, failures };
}

/** Builds the explicit empty result for the given queries (never throws). */
export function emptyChainResult(
  queries: readonly string[],
  emptyReason: WebSearchEmptyReason,
): WebSearchChainResult {
  return {
    items: queries.map((query) => ({ query, results: [] })),
    providersUsed: [],
    failures: [],
    isEmpty: true,
    emptyReason,
  };
}

/**
 * Fans queries out in bounded waves down the configured provider chain.
 *
 * This is the web-search entry point's core: it never throws. Any query that
 * survives the whole chain without results simply comes back with an empty
 * `results` array, and the run-level outcome carries `isEmpty` plus an
 * `emptyReason` naming why nothing was found.
 */
export async function runWebSearchChain(
  providers: readonly SearchProvider[],
  queries: readonly string[],
  options: SearchChainOptions = {},
): Promise<WebSearchChainResult> {
  if (providers.length === 0) {
    return emptyChainResult(queries, 'no-providers-configured');
  }

  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const outcomes = await runInWaves(
    queries,
    (query) => searchWithFailover(providers, query, timeoutMs, sleep),
    SEARCH_WAVE_CONCURRENCY,
  );

  const items = outcomes.map((outcome) => outcome.item);
  const failures = outcomes.flatMap((outcome) => outcome.failures);

  const providersUsed: string[] = [];
  for (const item of items) {
    if (item.providerId && !providersUsed.includes(item.providerId)) {
      providersUsed.push(item.providerId);
    }
  }

  const isEmpty = items.every((item) => item.results.length === 0);
  let emptyReason: WebSearchEmptyReason | undefined;
  if (isEmpty) {
    emptyReason = failures.some((failure) => failure.reason !== NO_RESULTS_REASON)
      ? 'chain-exhausted'
      : 'no-results';
  }

  return { items, providersUsed, failures, isEmpty, emptyReason };
}
