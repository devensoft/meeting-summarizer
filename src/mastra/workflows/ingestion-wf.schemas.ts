import { z } from 'zod';

export const inputFileSchema = z.object({
  filePath: z.string().min(1).describe('Path to a plain-text transcript on the Mastra server.'),
});
export const transcriptSchema = z.object({
  isValidTranscript: z.boolean(),
  transcriptContent: z.string(),
  meetingType: z.string(),
});
export const topicResultSchema = z.object({
  transcriptContent: z.string(),
  topics: z.array(z.string()),
  singleTheme: z.string().nullable(),
});
export const topicContextSchema = z.object({
  transcriptContent: z.string(),
  topic: z.string(),
  isSegment: z.boolean(),
});
export const segmentSchema = z.object({
  topic: z.string(),
  content: z.string(),
});
export const segmentFileSchema = z.object({
  topic: z.string(),
  filePath: z.string(),
  content: z.string(),
  isSegment: z.boolean(),
});
export const segmentCreatedSchema = z.object({
  topic: z.string(),
  filePath: z.string(),
  fileSize: z.number().int().nonnegative(),
  isSegment: z.boolean(),
});
export const consolidatedTopicSchema = topicContextSchema.extend({
  consolidatedContent: z.string(),
});
export const extractedTopicSchema = consolidatedTopicSchema.extend({
  segments: z.array(segmentSchema),
});
export const enrichedTopicSchema = extractedTopicSchema.extend({
  enrichedSegments: z.array(segmentSchema),
});
