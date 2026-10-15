import { z } from 'zod';
import { meetingFormatSchema, meetingModeSchema, meetingModeScoresSchema } from './meeting-mode';

export const inputFileSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Path to a WebVTT (.vtt), plain-text (.txt), or Word (.doc, .docx) transcript on the Mastra server. Relative paths resolve against the project root (or the directory named by PROJECT_ROOT, when set); absolute paths are used as-is.',
    ),
  seriesName: z
    .string()
    .optional()
    .describe(
      'Meeting series the transcript belongs to (e.g. "greenfield-design-sync"). Optional: when present it names the run output directory; matching context is seeded separately via a request-context preset.',
    ),
});
export const transcriptSchema = z.object({
  meetingDirectoryName: z.string().min(1),
  isValidTranscript: z.boolean(),
  transcriptContent: z
    .string()
    .describe(
      'The normalized transcript: numbered lines with stable "NN | " prefixes, VTT cues carrying their relative "[HH:MM:SS]" timestamp. It is the citation target every downstream prompt reads.',
    ),
  durationSeconds: z
    .number()
    .nullable()
    .describe('Meeting duration in seconds, parsed from VTT cue timestamps; null for every other input format.'),
  lineCount: z.number().int().nonnegative().describe('Number of numbered lines in the normalized transcript.'),
  meetingId: z
    .string()
    .nullable()
    .describe(
      'The meeting GUID the VTT input stamps on its cues; null when the input carries none (plain text, Word documents, mixed identifiers).',
    ),
  transcriptId: z.string().describe('Fresh random GUID generated for this ingest of the transcript.'),
  title: z.string().describe('Frontmatter title of the normalized transcript: the source file name without extension.'),
  startTimestamp: z
    .string()
    .nullable()
    .describe('ISO 8601 meeting start, defaulted to the source file creation time; null when no usable file timestamp exists.'),
  endTimestamp: z.string().nullable().describe('ISO 8601 meeting end: start plus the parsed duration; null when either is unknown.'),
  participantCount: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe('Distinct speakers derivable from VTT cues; null for plain-text and Word inputs.'),
  normalizedFilePath: z.string().describe('Absolute path of the written normalized markdown transcript.'),
  meetingContext: z
    .string()
    .nullable()
    .describe(
      "Free-form background on this meeting series, seeded from the run's RequestContext preset; null when none was provided.",
    ),
});
export const lineRangeSchema = z.object({
  startLine: z.number().int().min(1).describe('First numbered line of the range in the normalized transcript (inclusive).'),
  endLine: z.number().int().min(1).describe('Last numbered line of the range in the normalized transcript (inclusive).'),
});
export type LineRange = z.infer<typeof lineRangeSchema>;
export const classifiedTopicSchema = z.object({
  topic: z.string().describe('Concise topic label.'),
  lineRanges: z
    .array(lineRangeSchema)
    .describe('Where the topic lives in the normalized transcript: one range per continuous stretch of discussion.'),
});
export type ClassifiedTopic = z.infer<typeof classifiedTopicSchema>;
export type TopicResult = z.infer<typeof topicResultSchema>;
export const topicResultSchema = z.object({
  transcriptContent: z.string(),
  topics: z.array(classifiedTopicSchema),
  omittedTopics: z.array(classifiedTopicSchema),
  singleTopic: z.string().nullable(),
  isCohesive: z.boolean(),
  collapsedToSingleTopic: z.boolean(),
  durationSeconds: z.number().nullable(),
  lineCount: z.number().int().nonnegative(),
  meetingDirectoryName: z.string(),
  format: meetingFormatSchema.describe(
    'The meeting format (GLOSSARY.md): the ritual this meeting follows, judged from the transcript; "other" when none fits.',
  ),
  modeScores: meetingModeScoresSchema.describe(
    'The three meeting-mode scores (GLOSSARY.md: meeting mode); code resolves them to the primary mode.',
  ),
  mode: meetingModeSchema.describe(
    'The primary meeting mode: the highest-scoring mode, resolved in code with a fixed tie-break. Drives prompt emphasis only.',
  ),
  meetingContext: z.string().nullable(),
});
export const topicContextSchema = z.object({
  transcriptContent: z.string(),
  topic: z.string(),
  isSegment: z.boolean(),
  durationSeconds: z.number().nullable(),
  lineCount: z.number().int().nonnegative(),
  meetingDirectoryName: z.string(),
  format: meetingFormatSchema,
  mode: meetingModeSchema,
  meetingContext: z
    .string()
    .nullable()
    .describe(
      'Background on this meeting series, threaded through both branch paths; contextual highlights render only when it exists.',
    ),
});
export const segmentSchema = z.object({
  topic: z.string(),
  content: z.string(),
});
export const segmentCreatedSchema = z.object({
  topic: z.string(),
  filePath: z.string(),
  fileSize: z.number().int().nonnegative(),
  isSegment: z.boolean(),
});
export type SegmentCreated = z.infer<typeof segmentCreatedSchema>;
export const citedPointSchema = z.object({
  statement: z
    .string()
    .describe(
      "The point in the note author's own words: plain prose. Never embed \"(Lnn)\" references or quotation marks here.",
    ),
  lineReferences: z
    .array(z.number().int().min(1))
    .describe('Numbered transcript lines (the NN in "NN |") that support this point.'),
  quote: z
    .string()
    .nullable()
    .catch(null)
    .describe(
      "The speaker's exact words copied from the transcript, when the wording itself matters; null otherwise. An omitted or malformed quote is read as null — a missing quote must never fail the run.",
    ),
});
export type CitedPoint = z.infer<typeof citedPointSchema>;
export const citedTopicContentSchema = z.object({
  title: z.string().describe("Concise title for this topic's file."),
  summary: z.array(citedPointSchema),
  keyInsights: z.array(citedPointSchema),
  contextualHighlights: z.array(citedPointSchema),
});
export type CitedTopicContent = z.infer<typeof citedTopicContentSchema>;
export const validatedPointSchema = citedPointSchema.extend({
  quoteVerified: z.boolean().describe('Whether the quote was verified against the normalized transcript.'),
});
export type ValidatedPoint = z.infer<typeof validatedPointSchema>;
export const validatedTopicFileSchema = z.object({
  topic: z.string(),
  title: z.string(),
  summary: z.array(validatedPointSchema),
  keyInsights: z.array(validatedPointSchema),
  contextualHighlights: z.array(validatedPointSchema),
  hasMeetingContext: z.boolean(),
  isSegment: z.boolean(),
  meetingDirectoryName: z.string(),
});
export type ValidatedTopicFile = z.infer<typeof validatedTopicFileSchema>;
export const consolidatedTopicSchema = topicContextSchema.extend({
  consolidatedContent: z.string(),
});
export const extractedTopicSchema = consolidatedTopicSchema.extend({
  segments: z.array(segmentSchema),
});
export const enrichedTopicSchema = extractedTopicSchema.extend({
  enrichedSegments: z.array(segmentSchema),
});

export const distilledTopicSchema = validatedTopicFileSchema.extend({
  fileName: z.string(),
  transcriptContent: z
    .string()
    .describe('The normalized transcript again — the citation target the concept phases read.'),
});
export type DistilledTopic = z.infer<typeof distilledTopicSchema>;
export const conceptCandidateSchema = z.object({
  informalMention: z
    .string()
    .describe('A concept the discussion mentioned casually or informally, phrased so it doubles as a search query.'),
});
export type ConceptCandidate = z.infer<typeof conceptCandidateSchema>;
export const proposedConceptCandidatesSchema = z.object({
  concepts: z.array(conceptCandidateSchema),
});
export const conceptSearchResultSchema = z.object({
  title: z.string(),
  url: z.url({ protocol: /^https?$/ }).describe('Well-formed absolute http(s) link from the provider chain.'),
  snippet: z.string(),
});
export const conceptSearchItemSchema = z.object({
  informalMention: z.string(),
  results: z.array(conceptSearchResultSchema),
});
export type ConceptSearchItem = z.infer<typeof conceptSearchItemSchema>;
export const proposedConceptsSchema = distilledTopicSchema.extend({
  conceptCandidates: z.array(conceptCandidateSchema),
  conceptSearches: z.array(conceptSearchItemSchema),
});
export type ProposedConcepts = z.infer<typeof proposedConceptsSchema>;
export const conceptProposalSchema = z.object({
  informalMention: z.string(),
  formalFoundation: z.string().describe('The formal, established name behind the informal mention.'),
  blurb: z.string().describe('Short passage tying the informal mention to its formal foundation.'),
  links: z.array(z.object({ title: z.string(), url: z.string() })),
});
export type ConceptProposal = z.infer<typeof conceptProposalSchema>;
export const composedConceptsSchema = z.object({
  concepts: z.array(conceptProposalSchema),
});
export const conceptLinkSchema = z.object({
  title: z.string(),
  url: z.url({ protocol: /^https?$/ }),
});
export const enrichedConceptSchema = z.object({
  informalMention: z.string(),
  formalFoundation: z.string(),
  blurb: z.string(),
  links: z.array(conceptLinkSchema),
  grounding: z.enum(['web-search', 'model-suggested']),
});
export type EnrichedConcept = z.infer<typeof enrichedConceptSchema>;
export const composedTopicFileSchema = proposedConceptsSchema.extend({
  enrichedConcepts: z.array(enrichedConceptSchema),
});
export type ComposedTopicFile = z.infer<typeof composedTopicFileSchema>;

// --- Transcript index (spec: "Transcript index") ---

/** One created-file entry in the workflow's output: a topic file or the
 * transcript index. The `kind` discriminator tells them apart — the index is
 * not a topic, and consumers should never have to guess from `isSegment`. */
export const runOutputEntrySchema = segmentCreatedSchema.extend({
  kind: z.enum(['topic', 'index']).describe("What this created file is: a per-topic file or the meeting's transcript index."),
});
export type RunOutputEntry = z.infer<typeof runOutputEntrySchema>;

/** Run-level data riding the per-topic contexts through each branch path to
 * the collector (spec: run-level data threads through both branch paths).
 * The extras are optional in the type only so the per-topic subworkflow —
 * whose input is `topicContextSchema` — can still consume every item; the
 * branch steps always fill them, and the per-topic steps never read them. */
export const topicRunContextSchema = topicContextSchema.extend({
  omittedTopics: z.array(classifiedTopicSchema).optional(),
  singleTopic: z.string().nullable().optional(),
});
export type TopicRunContext = z.infer<typeof topicRunContextSchema>;

/** What each branch path hands the collector: the created files plus the
 * run-level data the transcript-index step needs (normalized transcript,
 * recorded omissions, where the meeting directory lives, the single-topic
 * gate). */
export const branchRunSchema = z.object({
  files: z.array(runOutputEntrySchema),
  transcriptContent: z.string(),
  omittedTopics: z.array(classifiedTopicSchema),
  singleTopic: z.string().nullable(),
  meetingDirectoryName: z.string(),
  lineCount: z.number().int().nonnegative(),
  format: meetingFormatSchema,
  mode: meetingModeSchema,
});
export type BranchRun = z.infer<typeof branchRunSchema>;

/** Exact form of an action item's due date: an ISO calendar date, or the
 * literal acknowledgment that none was stated. */
const dueDateSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('unstated')])
  .describe('When the deliverable is due, as YYYY-MM-DD; the literal string "unstated" when the meeting set no date.');

/** An action item (GLOSSARY.md): defined by all four of assigner, assignee,
 * due date (or explicitly unstated), and a clear deliverable — every field
 * schema-required, so ownership is never ambiguous. */
export const actionItemSchema = z.object({
  assigner: z.string().min(1).describe('Who assigned the task in the meeting.'),
  assignee: z.string().min(1).describe('Who is responsible for delivering it.'),
  dueDate: dueDateSchema,
  deliverable: z.string().min(1).describe('The concrete deliverable or outcome.'),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

/** A recurring theme (GLOSSARY.md): a subject surfacing across two or more
 * topic files of one meeting — never itself a topic. The model names the
 * topic files where it surfaces; code keeps only themes backed by at least
 * two of the run's real topic files. */
export const recurringThemeSchema = z.object({
  theme: z.string().min(1).describe('The cross-cutting subject, in a few words.'),
  topicFileNames: z
    .array(z.string().min(1))
    .describe('File names (without extension) of the topic files where the theme surfaces; at least two.'),
});
export type RecurringTheme = z.infer<typeof recurringThemeSchema>;

/** An unresolved item (GLOSSARY.md): an open question or unsettled matter,
 * cited to the transcript so it can be picked up where it was raised. */
export const unresolvedItemSchema = z.object({
  statement: z.string().min(1).describe('The open question or unsettled matter.'),
  lineReferences: z.array(z.number().int().min(1)).describe('Numbered transcript lines where the matter was raised or left open.'),
});
export type UnresolvedItem = z.infer<typeof unresolvedItemSchema>;

/** The one structured agent call behind the transcript index: the agent
 * reads the topic files, the recorded omissions, and the normalized
 * transcript, and returns every section except the wikilinked topic index
 * (code builds that from the run's actual files) and the omissions (rendered
 * from run data — code assigns all numbering). */
export const topicIndexContentSchema = z.object({
  title: z.string().min(1).describe("Descriptive title for this meeting's transcript index."),
  executiveSummary: z.string().min(1).describe('A one-read catch-up of the whole meeting: a single prose paragraph, no citations.'),
  recurringThemes: z.array(recurringThemeSchema),
  decisions: z.array(citedPointSchema).describe('The decision log entries: statement + supporting quote + transcript lines.'),
  actionItems: z.array(actionItemSchema),
  unresolvedItems: z.array(unresolvedItemSchema),
});
export type TopicIndexContent = z.infer<typeof topicIndexContentSchema>;

/** A recurring theme after code verified its file list: only real topic-file
 * names of this run, deduplicated, at least two. */
export const validatedRecurringThemeSchema = z.object({
  theme: z.string(),
  topicFileNames: z.array(z.string()),
});
export type ValidatedRecurringTheme = z.infer<typeof validatedRecurringThemeSchema>;

/** An unresolved item after citation validation. */
export const validatedUnresolvedItemSchema = z.object({
  statement: z.string(),
  lineReferences: z.array(z.number().int().min(1)),
});
export type ValidatedUnresolvedItem = z.infer<typeof validatedUnresolvedItemSchema>;

/** The validated transcript index content the code-rendered markdown is
 * assembled from — the index-side counterpart of `validatedTopicFileSchema`. */
export const validatedTopicIndexSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  recurringThemes: z.array(validatedRecurringThemeSchema),
  decisions: z.array(validatedPointSchema),
  actionItems: z.array(actionItemSchema),
  unresolvedItems: z.array(validatedUnresolvedItemSchema),
});
export type ValidatedTopicIndex = z.infer<typeof validatedTopicIndexSchema>;
