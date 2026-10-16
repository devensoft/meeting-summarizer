import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import { resolveProjectRoot } from '../paths';
import { classifyTopicsStep } from './ingestion-wf.02-classify-topics-step';
import { writeIndexStep } from './ingestion-wf.09-write-index-step';
import { consolidateTopicStep } from './per-topic-subworkflow.01-consolidate-topic-step';
import { extractSegmentsStep } from './per-topic-subworkflow.02-extract-segments-step';
import { enrichSegmentsStep } from './per-topic-subworkflow.03-enrich-segments-step';
import { distillTopicStep } from './per-topic-subworkflow.04-distill-topic-step';
import { proposeEnrichedConceptsStep } from './per-topic-subworkflow.05-propose-enriched-concepts-step';
import { composeEnrichedConceptsStep } from './per-topic-subworkflow.06-compose-enriched-concepts-step';

const STOP = new Error('captured');
const GLM = 'zai-coding-plan/glm-5.3-flash';
const GENERIC = 'openai/gpt-5-mini';

const projectRoot = resolveProjectRoot(process.cwd());
const workspaceDir = path.join(projectRoot, '.workspace');
mkdirSync(workspaceDir, { recursive: true });
// Unique per run: never touches pre-existing directories and cannot race parallel runs.
const scratchDir = mkdtempSync(path.join(workspaceDir, '__structured-call-intents-'));
const scratchRelative = path.relative(projectRoot, scratchDir);
const topicFileRelative = path.join(scratchRelative, 'topic-a.md');

const transcript = '1 | Hello\n2 | World';
const topicContext = {
  transcriptContent: transcript,
  topic: 'Topic A',
  isSegment: true,
  durationSeconds: null,
  lineCount: 2,
  meetingDirectoryName: 'm',
  format: 'planning',
  mode: 'status',
  meetingContext: null,
};

type Row = { id: string; step: { execute: (args: never) => Promise<unknown> }; input: object; intent: 'low' | 'high' };

/** The per-step intent table: classify and write-index are quality-critical (high); the six per-topic calls are low. */
const table: Row[] = [
  {
    id: 'classify-topics',
    step: classifyTopicsStep as never,
    input: { transcriptContent: transcript, isValidTranscript: true, meetingContext: null, durationSeconds: null, lineCount: 2 },
    intent: 'high',
  },
  { id: 'consolidate-topic', step: consolidateTopicStep as never, input: topicContext, intent: 'low' },
  { id: 'extract-segments', step: extractSegmentsStep as never, input: { ...topicContext, consolidatedContent: 'c' }, intent: 'low' },
  {
    id: 'enrich-segments',
    step: enrichSegmentsStep as never,
    input: { ...topicContext, consolidatedContent: 'c', segments: [] },
    intent: 'low',
  },
  {
    id: 'distill-topic',
    step: distillTopicStep as never,
    input: { ...topicContext, consolidatedContent: 'c', segments: [], enrichedSegments: [] },
    intent: 'low',
  },
  { id: 'propose-enriched-concepts', step: proposeEnrichedConceptsStep as never, input: { topic: 'Topic A', transcriptContent: transcript }, intent: 'low' },
  {
    id: 'compose-enriched-concepts',
    step: composeEnrichedConceptsStep as never,
    input: { topic: 'Topic A', conceptSearches: [{ informalMention: 'five whys', results: [] }] },
    intent: 'low',
  },
  {
    id: 'write-index',
    step: writeIndexStep as never,
    input: {
      files: [{ kind: 'topic', topic: 'Topic A', filePath: topicFileRelative, fileSize: 1, isSegment: true }],
      transcriptContent: transcript,
      omittedTopics: [],
      singleTopic: null,
      meetingDirectoryName: 'm',
      lineCount: 2,
      format: 'planning',
      mode: 'status',
    },
    intent: 'high',
  },
];

async function capture(row: Row, model: string) {
  const calls: Array<{ prompt: string; options: Record<string, any> }> = [];
  const agent = {
    generate: async (prompt: string, options: Record<string, any>) => {
      calls.push({ prompt, options });
      throw STOP;
    },
  };
  const mastra = { getAgent: () => agent, getWorkspace: () => ({ filesystem: {} }) };
  const requestContext = new RequestContext();
  requestContext.set('model', model);

  await expect(
    row.step.execute({
      inputData: row.input,
      mastra,
      requestContext,
      getStepResult: () => ({ meetingDirectoryName: 'm' }),
    } as never),
  ).rejects.toBe(STOP);

  expect(calls).toHaveLength(1);
  return calls[0]!.options;
}

beforeAll(async () => {
  await writeFile(path.join(projectRoot, topicFileRelative), '# Topic A');
});

afterAll(async () => {
  const resolved = path.resolve(scratchDir);
  const rel = path.relative(workspaceDir, resolved);
  const safe =
    rel !== '' &&
    !rel.startsWith('..') &&
    !path.isAbsolute(rel) &&
    !rel.includes(path.sep) &&
    rel.startsWith('__structured-call-intents-');
  if (!safe) throw new Error(`Refusing to remove unexpected scratch path: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
});

describe('structured call sites', () => {
  it('covers all eight steps that call the agent with structured output', () => {
    expect(table.map((row) => row.id).sort()).toEqual(
      [
        'classify-topics',
        'consolidate-topic',
        'distill-topic',
        'enrich-segments',
        'extract-segments',
        'propose-enriched-concepts',
        'compose-enriched-concepts',
        'write-index',
      ].sort(),
    );
  });

  it.each(table)('$id uses the GLM profile with intent $intent', async (row) => {
    const options = await capture(row, GLM);
    const expectedEffort = row.intent === 'high' ? 'max' : 'low';

    expect(options.structuredOutput.jsonPromptInjection).toBe('system');
    expect(options.structuredOutput.instructions).toContain('exactly one raw JSON object');
    expect(options.providerOptions).toEqual({ openaiCompatible: { reasoningEffort: expectedEffort } });
    expect(options.requestContext).toBeDefined();
  });

  it.each(table)('$id uses native structured output on a generic provider', async (row) => {
    const options = await capture(row, GENERIC);

    expect(Object.keys(options.structuredOutput)).toEqual(['schema']);
    expect(options.providerOptions).toEqual({ openaiCompatible: { reasoningEffort: row.intent } });
  });
});
