import type { RequestContext } from '@mastra/core/request-context';
import { glmProfile, openAiCompatibleProfile, type ProviderProfile } from './provider-profile';

export const DEFAULT_MEETING_MODEL = 'zai-coding-plan/glm-5.3-flash';
export const MEETING_MODEL_ENV_VAR = 'MEETING_MODEL';
export const MODEL_REQUEST_CONTEXT_KEY = 'model';

// Full router string: `<provider>/<model>`; the model part may itself contain slashes.
const ROUTER_MODEL_PATTERN = /^[^\s/]+\/\S+$/;
const GLM_PROVIDERS = new Set(['zai', 'zai-coding-plan', 'zhipuai', 'zhipuai-coding-plan']);

/** Returns a problem description for a non-blank invalid value, else undefined. */
export function modelStringProblem(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || ROUTER_MODEL_PATTERN.test(trimmed)) {
    return undefined;
  }
  return `"${trimmed}" is not a router model string of the form "<provider>/<model>"`;
}

export function profileForModel(model: string): ProviderProfile {
  const [provider = '', ...rest] = model.trim().split('/');
  const modelName = (rest[rest.length - 1] ?? '').toLowerCase();
  return GLM_PROVIDERS.has(provider.toLowerCase()) || modelName.startsWith('glm') ? glmProfile : openAiCompatibleProfile;
}

export type ModelSelection = { model: string; profile: ProviderProfile };

function candidate(value: unknown, source: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${source} must be a string model id, got ${typeof value}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const problem = modelStringProblem(trimmed);
  if (problem) {
    throw new Error(`${source}: ${problem}`);
  }
  return trimmed;
}

/**
 * Resolves the model for a run — request-context `model` > `MEETING_MODEL`
 * env var > default — together with the provider profile that matches it.
 * Blank values fall through to the next source; malformed values throw.
 */
export function resolveModelSelection(
  requestContext?: RequestContext<any>,
  env: Record<string, string | undefined> = process.env,
): ModelSelection {
  const model =
    candidate(requestContext?.get(MODEL_REQUEST_CONTEXT_KEY), `request context "${MODEL_REQUEST_CONTEXT_KEY}"`) ??
    candidate(env[MEETING_MODEL_ENV_VAR], `env ${MEETING_MODEL_ENV_VAR}`) ??
    DEFAULT_MEETING_MODEL;
  return { model, profile: profileForModel(model) };
}
