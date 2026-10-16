import type { z } from 'zod';

/** Provider-neutral statement of how much reasoning a call deserves. */
export type ReasoningIntent = 'low' | 'medium' | 'high';

export interface ProviderCallRequest<TSchema extends z.ZodType> {
  schema: TSchema;
  shapeExample: string;
  /** Omitted means "leave the provider's own default (max for GLM) untouched". */
  intent?: ReasoningIntent;
}

export interface ProviderCallOptions<TSchema extends z.ZodType> {
  structuredOutput: { schema: TSchema; jsonPromptInjection?: 'system'; instructions?: string };
  providerOptions?: { openaiCompatible: { reasoningEffort: string } };
}

export interface ProviderProfile {
  readonly id: string;
  /** Whether the provider accepts a "reasoning off" setting. Disabled is never sent when false. */
  readonly canDisable: boolean;
  callOptions<TSchema extends z.ZodType>(request: ProviderCallRequest<TSchema>): ProviderCallOptions<TSchema>;
}

const GLM_EFFORT: Record<ReasoningIntent, string> = { low: 'low', medium: 'high', high: 'max' };
const GENERIC_EFFORT: Record<ReasoningIntent, string> = { low: 'low', medium: 'medium', high: 'high' };

function effortOptions(effort: string | undefined) {
  return effort === undefined ? {} : { providerOptions: { openaiCompatible: { reasoningEffort: effort } } };
}

/**
 * GLM structured output on the z.ai router: native provider JSON mode
 * (`response_format`) is unreliable through this OpenAI-compatible endpoint,
 * so we use prompt injection. The `instructions` replace the generated schema
 * dump and must spell out the exact JSON shape: the models otherwise answer
 * with reasoning prose, or drift into whatever structure their persona
 * suggests (e.g. the meeting-notes sections).
 */
function glmStructuredOutputOptions<TSchema extends z.ZodType>(schema: TSchema, shapeExample: string) {
  return {
    schema,
    jsonPromptInjection: 'system' as const,
    instructions: `Your entire reply must be exactly one raw JSON object of this shape: ${shapeExample} Use exactly these keys (case-sensitive) and nothing else. No prose, no markdown, no code fences, no reasoning. Escape newlines inside string values as \\n.`,
  };
}

export const glmProfile: ProviderProfile = {
  id: 'glm',
  canDisable: false,
  callOptions: ({ schema, shapeExample, intent }) => ({
    structuredOutput: glmStructuredOutputOptions(schema, shapeExample),
    ...effortOptions(intent && GLM_EFFORT[intent]),
  }),
};

export const openAiCompatibleProfile: ProviderProfile = {
  id: 'openai-compatible',
  canDisable: true,
  callOptions: ({ schema, intent }) => ({
    structuredOutput: { schema },
    ...effortOptions(intent && GENERIC_EFFORT[intent]),
  }),
};
