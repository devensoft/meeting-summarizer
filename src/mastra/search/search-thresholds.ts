/**
 * Every web-search threshold and cap, in one place (spec: "thresholds and caps
 * as named constants in one place, so that tuning is a one-line review").
 *
 * These values bound the chain's runtime behavior; tests inject faster values
 * rather than waiting on them.
 */

/** Maximum number of searches executing concurrently (bounded waves). */
export const SEARCH_WAVE_CONCURRENCY = 3;

/** Per-search wall-clock budget for a single provider attempt, in milliseconds. */
export const SEARCH_TIMEOUT_MS = 15_000;

/**
 * Retries a rate-limited (429) provider attempt with exponential backoff
 * before the chain fails over to the next provider. This is the retry cap —
 * the initial attempt plus this many backoff retries per provider.
 */
export const RATE_LIMIT_MAX_RETRIES = 2;

/** Base delay for exponential 429 backoff, in milliseconds (first retry waits exactly this). */
export const RATE_LIMIT_BACKOFF_BASE_MS = 1_000;

/** Multiplier applied to the backoff delay on every subsequent 429 retry. */
export const RATE_LIMIT_BACKOFF_FACTOR = 2;

/** Maximum number of results requested from a provider for one query. */
export const SEARCH_RESULTS_PER_QUERY = 3;

/**
 * Maximum number of queries accepted in a single web-search call — the input
 * bound of the registered `web-search` tool. An internal guardrail, not a
 * pipeline budget: the enriched-concepts pipeline sends at most one query per
 * candidate (candidates are capped at `ENRICHED_CONCEPTS_MAX_CANDIDATES`),
 * but the tool is directly callable with an arbitrary query list.
 */
export const MAX_WEB_SEARCH_QUERIES = 25;
