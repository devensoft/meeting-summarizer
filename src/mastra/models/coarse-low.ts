import { glmReasoningEffort } from './glm';

export const COARSE_LOW_ENV_FLAG = 'EXPERIMENT_COARSE_LOW';

export type PerTopicCall = 'consolidate' | 'extract' | 'enrich' | 'distill' | 'propose' | 'compose';

/** Experiment gate (issue #30): default OFF; only "1" or "true" enables it. */
export function isCoarseLowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = env[COARSE_LOW_ENV_FLAG]?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

/**
 * Spreadable call options for a per-topic structured call. Compose is always
 * low; the other five are low only when the experiment is on. When no effort
 * applies it returns `{}`, so no `providerOptions` key is sent at all.
 */
export function perTopicReasoning(call: PerTopicCall, coarseLow: boolean = isCoarseLowEnabled()) {
  return call === 'compose' || coarseLow ? { providerOptions: glmReasoningEffort('low') } : {};
}
