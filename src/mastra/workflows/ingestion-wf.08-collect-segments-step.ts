import { z } from 'zod';
import { createStep } from '@mastra/core/workflows';
import { branchRunSchema, type BranchRun } from './ingestion-wf.schemas';

// Branch output is keyed by the id of whichever path ran; both paths now emit
// the same run envelope (created files plus run-level data).
export const collectSegmentsStep = createStep({
  id: 'collect-segments',
  description:
    "Flatten whichever branch ran into the run result: the created files plus the run-level data — normalized transcript, recorded omissions, single-topic gate — the transcript-index step needs.",
  inputSchema: z.object({
    'single-topic-path': branchRunSchema.optional(),
    'multiple-topics-path': branchRunSchema.optional(),
  }),
  outputSchema: branchRunSchema,
  execute: async ({ inputData }) => flattenBranchRun(inputData),
});

/** Flattens the keyed branch results into one run envelope. Exactly one
 * branch runs per ingestion; anything else is a wiring failure. */
export function flattenBranchRun(input: {
  'single-topic-path'?: BranchRun;
  'multiple-topics-path'?: BranchRun;
}): BranchRun {
  const run = input['single-topic-path'] ?? input['multiple-topics-path'];
  if (!run) {
    throw new Error('No branch produced a run result.');
  }
  return run;
}
