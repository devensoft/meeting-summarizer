import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { glmStructuredOutput } from './glm';
import { glmProfile, openAiCompatibleProfile } from './provider-profile';

const schema = z.object({ title: z.string() });
const shapeExample = '{"title":"Topic title"}';

describe('glmProfile', () => {
  it('uses prompt-injection structured output with the shape example', () => {
    const { structuredOutput } = glmProfile.callOptions({ schema, shapeExample });

    expect(structuredOutput.schema).toBe(schema);
    expect(structuredOutput.jsonPromptInjection).toBe('system');
    expect(structuredOutput.instructions).toContain(shapeExample);
  });

  it('matches the legacy helper byte for byte', () => {
    expect(glmProfile.callOptions({ schema, shapeExample }).structuredOutput).toEqual(
      glmStructuredOutput(schema, shapeExample),
    );
  });

  it.each([
    ['low', 'low'],
    ['medium', 'high'],
    ['high', 'max'],
  ] as const)('maps intent %s to reasoning effort %s', (intent, effort) => {
    const options = glmProfile.callOptions({ schema, shapeExample, intent });

    expect(options.providerOptions).toEqual({ openaiCompatible: { reasoningEffort: effort } });
  });

  it('sends no provider options when intent is unspecified, keeping the provider default (max)', () => {
    expect(glmProfile.callOptions({ schema, shapeExample }).providerOptions).toBeUndefined();
  });

  it('cannot disable reasoning and never sends a disabled value', () => {
    expect(glmProfile.canDisable).toBe(false);
    for (const intent of ['low', 'medium', 'high'] as const) {
      const effort = glmProfile.callOptions({ schema, shapeExample, intent }).providerOptions?.openaiCompatible.reasoningEffort;
      expect(['none', 'disabled', 'off']).not.toContain(effort);
    }
  });
});

describe('openAiCompatibleProfile', () => {
  it('uses native structured output without prompt injection', () => {
    const { structuredOutput } = openAiCompatibleProfile.callOptions({ schema, shapeExample });

    expect(structuredOutput).toEqual({ schema });
    expect('jsonPromptInjection' in structuredOutput).toBe(false);
    expect('instructions' in structuredOutput).toBe(false);
  });

  it.each([
    ['low', 'low'],
    ['medium', 'medium'],
    ['high', 'high'],
  ] as const)('maps intent %s to reasoning effort %s', (intent, effort) => {
    const options = openAiCompatibleProfile.callOptions({ schema, shapeExample, intent });

    expect(options.providerOptions).toEqual({ openaiCompatible: { reasoningEffort: effort } });
  });

  it('sends no provider options when intent is unspecified', () => {
    expect(openAiCompatibleProfile.callOptions({ schema, shapeExample }).providerOptions).toBeUndefined();
  });
});
