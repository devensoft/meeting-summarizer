import { z } from 'zod';

/**
 * Meeting format and meeting mode (GLOSSARY.md) as deterministic code.
 *
 * The classifier describes a meeting with a format label and scores the
 * three modes in its one structured call; code — never prompt compliance —
 * resolves the scores to one primary mode with a fixed tie-break and
 * selects the emphasis guidance the downstream prompts render. The mode
 * drives emphasis only: schemas, citation validation, and the index
 * renderer's fixed sections are identical across modes, so a misjudged mode
 * reorders what the prompts hunt for first and changes nothing structural.
 */

/** The ritual a meeting follows, judged from the transcript (GLOSSARY.md:
 * meeting format — it describes, it never drives). */
export const meetingFormatSchema = z.enum([
  'standup',
  'planning',
  'retrospective',
  'one-on-one',
  'brainstorm',
  'workshop',
  'other',
]);
export type MeetingFormat = z.infer<typeof meetingFormatSchema>;

export const meetingModeSchema = z.enum(['status', 'discussion', 'learning']);
export type MeetingMode = z.infer<typeof meetingModeSchema>;

export const meetingModeScoresSchema = z.object({
  status: z
    .number()
    .min(0)
    .max(1)
    .describe('How strongly the meeting reads as status-taking: updates, decisions, and task assignments.'),
  discussion: z
    .number()
    .min(0)
    .max(1)
    .describe('How strongly the meeting reads as open-ended discussion: threads, trade-offs, and open questions.'),
  learning: z
    .number()
    .min(0)
    .max(1)
    .describe('How strongly the meeting reads as teaching: concepts explained to an audience.'),
});
export type MeetingModeScores = z.infer<typeof meetingModeScoresSchema>;

/** Fixed tie-break order for equal scores — the earliest mode wins, so
 * `status` (today's prompt behavior) stays the default on a blanket tie. */
const MODE_TIE_BREAK: readonly MeetingMode[] = ['status', 'discussion', 'learning'];

/** Resolves the primary meeting mode: the highest score wins; ties go to
 * the earliest mode in the fixed tie-break order. Total — every key of
 * `MeetingModeScores` is required, so there is nothing left to default. */
export function resolveMeetingMode(scores: MeetingModeScores): MeetingMode {
  return MODE_TIE_BREAK.reduce((best, mode) => (scores[mode] > scores[best] ? mode : best), MODE_TIE_BREAK[0]!);
}

/** Emphasis guidance per mode — what the notes hunt for first. Rendered
 * into the distill and transcript-index prompts via their `{{modeGuidance}}`
 * placeholder; deliberately soft: emphasis, never structure. */
const MODE_GUIDANCE: Record<MeetingMode, string> = {
  status:
    'Treat this as a status meeting: updates, decisions, and task assignments are the point. Hunt for concrete decisions and assigned tasks first — who owns what, due dates, deliverables. Explanations matter only as support.',
  discussion:
    'Treat this as an open-ended discussion: the threads, trade-offs, and open questions are the point. Capture the arguments, the recurring concerns, and the matters left unsettled first. Record decisions and tasks when they genuinely occur, but never force closure the meeting did not reach.',
  learning:
    'Treat this as a teaching session: the concepts being explained are the point. Capture what was taught, how the ideas connect, and the questions raised along the way first. Decisions and assigned tasks are rare here — record one only when the meeting genuinely produced it.',
};

export function meetingModeGuidance(mode: MeetingMode): string {
  return MODE_GUIDANCE[mode];
}
