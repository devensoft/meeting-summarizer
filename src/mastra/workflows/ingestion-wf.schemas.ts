import { z } from 'zod';

export const inputFileSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Path to a WebVTT (.vtt) or plain-text transcript on the Mastra server. Relative paths resolve against the project root (or the directory named by PROJECT_ROOT, when set); absolute paths are used as-is.',
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
      'The normalized transcript: line-numbered plain text with stable "NN | " prefixes. It is the citation target every downstream prompt reads.',
    ),
  durationSeconds: z
    .number()
    .nullable()
    .describe('Meeting duration in seconds, parsed from VTT cue timestamps; null for plain-text input.'),
  lineCount: z.number().int().nonnegative().describe('Number of numbered lines in the normalized transcript.'),
  meetingType: z.string(),
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
  meetingType: z.string(),
  meetingContext: z.string().nullable(),
});
export const topicContextSchema = z.object({
  transcriptContent: z.string(),
  topic: z.string(),
  isSegment: z.boolean(),
  durationSeconds: z.number().nullable(),
  lineCount: z.number().int().nonnegative(),
  meetingDirectoryName: z.string(),
  meetingType: z.string(),
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
    .describe("The speaker's exact words copied from the transcript, when the wording itself matters; null otherwise."),
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
