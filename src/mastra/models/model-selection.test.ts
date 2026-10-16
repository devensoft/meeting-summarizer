import { describe, expect, test } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';
import { meetingContextSchema } from '../meeting-context';
import { glmProfile, openAiCompatibleProfile } from './provider-profile';
import { DEFAULT_MEETING_MODEL, profileForModel, resolveModelSelection } from './model-selection';

const ctx = (values: Record<string, any>) => new RequestContext(Object.entries(values));

describe('resolveModelSelection', () => {
  test('defaults to the existing GLM model with the GLM profile', () => {
    expect(resolveModelSelection(undefined, {})).toEqual({ model: 'zai-coding-plan/glm-5.3-flash', profile: glmProfile });
    expect(DEFAULT_MEETING_MODEL).toBe('zai-coding-plan/glm-5.3-flash');
  });

  test('env overrides the default', () => {
    expect(resolveModelSelection(ctx({}), { MEETING_MODEL: 'openai/gpt-5-mini' }).model).toBe('openai/gpt-5-mini');
  });

  test('run request context overrides env', () => {
    const result = resolveModelSelection(ctx({ model: 'anthropic/claude-sonnet-4' }), { MEETING_MODEL: 'openai/gpt-5-mini' });
    expect(result.model).toBe('anthropic/claude-sonnet-4');
  });

  test('blank values fall through and surrounding whitespace is trimmed', () => {
    expect(resolveModelSelection(ctx({ model: '   ' }), { MEETING_MODEL: '  openai/gpt-5-mini  ' }).model).toBe('openai/gpt-5-mini');
    expect(resolveModelSelection(ctx({ model: ' ' }), { MEETING_MODEL: '' }).model).toBe(DEFAULT_MEETING_MODEL);
  });

  test('malformed values throw naming their source', () => {
    expect(() => resolveModelSelection(ctx({ model: 'gpt-5' }), {})).toThrow(/request context "model"/);
    expect(() => resolveModelSelection(undefined, { MEETING_MODEL: 'bad model/x' })).toThrow(/MEETING_MODEL/);
    expect(() => resolveModelSelection(ctx({ model: 42 }), {})).toThrow(/string/);
  });

  test('profile follows the resolved model', () => {
    expect(resolveModelSelection(ctx({ model: 'openai/gpt-5-mini' }), {}).profile).toBe(openAiCompatibleProfile);
    expect(resolveModelSelection(ctx({ model: 'zai/glm-4.6' }), {}).profile).toBe(glmProfile);
    expect(resolveModelSelection(undefined, { MEETING_MODEL: 'openrouter/z-ai/glm-4.6' }).profile).toBe(glmProfile);
    expect(profileForModel('openrouter/openai/gpt-5')).toBe(openAiCompatibleProfile);
  });
});

describe('meetingContextSchema model key', () => {
  test('accepts absent, blank, and router-string values', () => {
    expect(meetingContextSchema.parse({})).toEqual({});
    expect(meetingContextSchema.parse({ model: '  ' }).model).toBe('  ');
    expect(meetingContextSchema.parse({ model: 'openai/gpt-5-mini' }).model).toBe('openai/gpt-5-mini');
  });

  test('rejects malformed values', () => {
    expect(() => meetingContextSchema.parse({ model: 'gpt-5' })).toThrow(/router model string/);
  });
});

describe('agent and workflow wiring', () => {
  test('both validate request context with the shared schema', async () => {
    const config = (await import('../agents/meeting-master/config')).default as any;
    const { ingestionWorkflow } = await import('../workflows/ingestion-wf');
    expect(config.requestContextSchema).toBe(meetingContextSchema);
    expect(typeof config.model).toBe('function');
    expect(config.model({ requestContext: ctx({ model: 'openai/gpt-5-mini' }) })).toBe('openai/gpt-5-mini');
    expect((ingestionWorkflow as any).requestContextSchema).toBe(meetingContextSchema);
  });
});
