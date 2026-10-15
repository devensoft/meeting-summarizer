import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { glmStructuredOutput } from './glm';

describe('glmStructuredOutput', () => {
  it('passes the schema through and explicitly injects the compact raw-JSON instructions', () => {
    const schema = z.object({ title: z.string() });
    const shapeExample = '{"title":"Topic title"}';

    const options = glmStructuredOutput(schema, shapeExample);

    expect(options.schema).toBe(schema);
    expect(options.jsonPromptInjection).toBe('system');
    expect(options.instructions).toContain(shapeExample);
    expect(options.instructions).toContain('exactly one raw JSON object');
    expect(options.instructions).toContain('No prose, no markdown, no code fences, no reasoning.');
  });
});
