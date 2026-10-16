import type { z } from 'zod';

/**
 * Per-call `providerOptions` that make the router's OpenAI-compatible chat
 * model send `reasoning_effort` to the z.ai endpoint. The router builds the
 * model with `@ai-sdk/openai-compatible`, which maps the `reasoningEffort`
 * option under the `openaiCompatible` key to the `reasoning_effort` body
 * field. (`modelSettings.reasoning` is a no-op for these V2/V3 models.)
 */
export function glmReasoningEffort(effort: 'low' | 'medium' | 'high') {
  return { openaiCompatible: { reasoningEffort: effort } };
}

/**
 * Structured-output options tuned for GLM reasoning models on the z.ai router.
 *
 * Native provider JSON mode (`response_format`) is unreliable through this
 * OpenAI-compatible endpoint, so we use prompt injection. The `instructions`
 * replace the generated schema dump and must spell out the exact JSON shape:
 * the models otherwise answer with reasoning prose, or drift into whatever
 * structure their persona suggests (e.g. the meeting-notes sections).
 */
export function glmStructuredOutput<TSchema extends z.ZodType>(schema: TSchema, shapeExample: string) {
  return {
    schema,
    jsonPromptInjection: 'system' as const,
    instructions: `Your entire reply must be exactly one raw JSON object of this shape: ${shapeExample} Use exactly these keys (case-sensitive) and nothing else. No prose, no markdown, no code fences, no reasoning. Escape newlines inside string values as \\n.`,
  };
}
