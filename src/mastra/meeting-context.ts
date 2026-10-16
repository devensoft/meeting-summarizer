import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type { ClassifiedTopic, MeetingMetadata } from './workflows/ingestion-wf.schemas';
import { dedupeByTrimmedLowerCaseKey } from './dedupe';

export const meetingContextSchema = z.object({
  meetingType: z.string().optional(),
  meetingContext: z.string().optional(),
});

/**
 * Optional per-run background for one meeting series, carried in the run's
 * RequestContext. It is seeded from a Studio request-context preset (see
 * `presets.example.json`; `bun run dev` loads it via the
 * `--request-context-presets` flag). Every key is optional: an absent or
 * empty context leaves the workflow behaving exactly as it would without one.
 * What kind of meeting this is — format and mode (GLOSSARY.md) — is not
 * user input: the classifier infers both from the transcript (see
 * `workflows/meeting-mode.ts`).
 */
export type MeetingContext = {
  /** Free-form background on the series: purpose, standing agenda, known low-signal tangents. */
  meetingContext: string;
};

/** RequestContext as workflow steps receive it (untyped keys) and as agent calls accept it. */
type AnyRequestContext = RequestContext<any> | undefined;

/**
 * Reads the meeting-context key from a run's RequestContext. Tolerates an
 * absent context and absent or blank values; only non-empty strings survive.
 */
export function readMeetingContext(requestContext: AnyRequestContext): Partial<MeetingContext> {
  const value: unknown = requestContext?.get('meetingContext');
  return { meetingContext: typeof value === 'string' && value.trim().length > 0 ? value : undefined };
}

/**
 * Renders the context card injected into prompts when meeting context exists.
 * Returns an empty string when there is none, so prompt templates render
 * unchanged for runs without a preset.
 */
export function renderMeetingContextCard(context: Partial<MeetingContext>): string {
  const background = context.meetingContext;
  if (!background || background.trim().length === 0) {
    return '';
  }

  return `Meeting context (background on this meeting series — use it to judge what this meeting is and is not about):\n${background}\n`;
}

/**
 * Renders caller-supplied meeting metadata as a factual framing block for
 * prompts. Empty fields are omitted; returns an empty string when nothing
 * usable is supplied, so prompts render unchanged without metadata.
 */
export function renderMeetingMetadataBlock(metadata: MeetingMetadata | undefined): string {
  if (!metadata) {
    return '';
  }

  const attendees = (metadata.attendees ?? []).map((name) => name.trim()).filter((name) => name.length > 0);
  const lines = [
    metadata.title?.trim() && `- Title: ${metadata.title.trim()}`,
    metadata.date && `- Date: ${metadata.date}`,
    metadata.time && `- Time: ${metadata.time}`,
    attendees.length > 0 && `- Attendees: ${attendees.join(', ')}`,
    metadata.description?.trim() && `- Description: ${metadata.description.trim()}`,
  ].filter((line): line is string => typeof line === 'string');

  if (lines.length === 0) {
    return '';
  }

  return `Meeting metadata (supplied by the caller, not derived from the transcript):\n${lines.join('\n')}\nAttendee names may inform speaker attribution only where the transcript itself supports it. Never invent speakers, decisions, or facts from this metadata.\n`;
}

/** Appends the metadata block to a context block; the base is returned unchanged when there is no metadata. */
export function appendMeetingMetadata(contextBlock: string, metadata: MeetingMetadata | undefined): string {
  const metadataBlock = renderMeetingMetadataBlock(metadata);
  return metadataBlock === '' ? contextBlock : `${contextBlock}${contextBlock === '' || contextBlock.endsWith('\n') ? '' : '\n'}${metadataBlock}`;
}

/**
 * Applies the topic-omission rules to the classifier's two lists: omissions
 * never shadow a kept topic, and the tie-to-keep fallback keeps every
 * candidate when the classifier would omit all of them — an all-tangent
 * transcript must still produce notes, so a fully empty result is a
 * classifier failure, not a valid outcome. Labels are trimmed, blank labels
 * are dropped, and duplicates collapse to their first entry; each
 * classified topic keeps its line ranges untouched.
 */
export function reconcileTopics(
  topics: ClassifiedTopic[],
  omittedTopics: ClassifiedTopic[],
): { topics: ClassifiedTopic[]; omittedTopics: ClassifiedTopic[] } {
  // The shared dedupe rule (trim, lowercase-compare, first entry wins) does
  // the list work; the ranges ride on the surviving entry untouched.
  const normalize = (entries: ClassifiedTopic[]): ClassifiedTopic[] =>
    dedupeByTrimmedLowerCaseKey(entries, (entry) => entry.topic).map((entry) => ({ ...entry, topic: entry.topic.trim() }));

  const kept = normalize(topics);
  if (kept.length === 0) {
    return { topics: normalize(omittedTopics), omittedTopics: [] };
  }

  const omissions = normalize(omittedTopics).filter((topic) => !kept.some((keptTopic) => keptTopic.topic.toLowerCase() === topic.topic.toLowerCase()));

  return { topics: kept, omittedTopics: omissions };
}
